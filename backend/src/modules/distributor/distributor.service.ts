import {
  and,
  asc,
  desc,
  DrizzleQueryError,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { DatabaseError } from "pg";
import { db } from "../../db";
import {
  distributorDrugAliases,
  distributorListings,
  masterDrugs,
  organizations,
  priceAccessPermissions,
  priceChangeLogs,
  type PermissionStatus,
} from "../../db/schema";
import { AppError } from "../../lib/errors";
import { eventBus } from "../../lib/events";
import {
  normalizeDrugName,
  parseAvailability,
  parseSdgIntegerPrice,
} from "../../lib/text-normalizer";
import { csvTextParser } from "./parsers/csv-text.parser";
import { jsonRowsParser } from "./parsers/json-rows.parser";
import type {
  BulkImportInput,
  BulkPercentPricingInput,
  CreateListingInput,
  ListListingsQuery,
  NewPharmaciesQuery,
  UpdateListingInput,
  UpdateStatusInput,
  UpsertAliasInput,
} from "./distributor.schemas";

const MAX_BULK_IMPORT_ROWS = 1000;

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function computeClampedPercentChange(
  oldPriceSdg: number,
  newPriceSdg: number
): string {
  const rawPercent = ((newPriceSdg - oldPriceSdg) / oldPriceSdg) * 100;
  // Clamp to numeric(6, 2) range [-9999.99, 9999.99] to prevent PG 22003 overflow.
  const clamped = Math.max(-9999.99, Math.min(9999.99, rawPercent));
  return clamped.toFixed(2);
}

function isUniqueViolationError(err: unknown): boolean {
  const candidate = err instanceof DrizzleQueryError ? err.cause : err;
  if (candidate instanceof DatabaseError) {
    return candidate.code === "23505";
  }

  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "code" in candidate &&
    (candidate as { code?: unknown }).code === "23505"
  );
}

/** Update distributor sales status and/or default order expiry window. */
export async function updateDistributorStatus(
  distributorId: string,
  input: UpdateStatusInput
) {
  const [updated] = await db
    .update(organizations)
    .set({
      ...(input.salesStatus !== undefined
        ? { salesStatus: input.salesStatus }
        : {}),
      ...(input.orderExpiryMinutes !== undefined
        ? { orderExpiryMinutes: input.orderExpiryMinutes }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, distributorId))
    .returning();

  if (!updated) {
    throw new AppError(404, "NOT_FOUND", "الموزع غير موجود");
  }

  eventBus.emit("catalog.invalidated", {
    reason: "DISTRIBUTOR_STATUS_CHANGED",
    distributorId,
  });

  return { organization: updated };
}

/** List all listings owned by the authenticated distributor with master drug details. */
export async function listDistributorListings(
  distributorId: string,
  filters: ListListingsQuery
) {
  const conditions: SQL[] = [
    eq(distributorListings.distributorId, distributorId),
  ];

  if (filters.q) {
    const pattern = `%${escapeLikePattern(filters.q)}%`;
    const searchCond = or(
      ilike(masterDrugs.tradeName, pattern),
      ilike(masterDrugs.genericName, pattern),
      ilike(masterDrugs.manufacturer, pattern)
    );
    if (searchCond) {
      conditions.push(searchCond);
    }
  }

  if (filters.manufacturer) {
    conditions.push(eq(masterDrugs.manufacturer, filters.manufacturer));
  }

  if (filters.availableOnly) {
    conditions.push(eq(distributorListings.isAvailable, true));
  }

  return db
    .select({
      id: distributorListings.id,
      distributorId: distributorListings.distributorId,
      drugId: distributorListings.drugId,
      wholesalePriceSdg: distributorListings.wholesalePriceSdg,
      isAvailable: distributorListings.isAvailable,
      priceVersion: distributorListings.priceVersion,
      updatedAt: distributorListings.updatedAt,
      createdAt: distributorListings.createdAt,
      drug: {
        id: masterDrugs.id,
        tradeName: masterDrugs.tradeName,
        genericName: masterDrugs.genericName,
        manufacturer: masterDrugs.manufacturer,
        strength: masterDrugs.strength,
        dosageForm: masterDrugs.dosageForm,
      },
    })
    .from(distributorListings)
    .innerJoin(masterDrugs, eq(distributorListings.drugId, masterDrugs.id))
    .where(and(...conditions))
    .orderBy(desc(distributorListings.updatedAt));
}

/** Create a new distributor listing for an active master drug. */
export async function createDistributorListing(
  distributorId: string,
  input: CreateListingInput
) {
  const [drug] = await db
    .select({ id: masterDrugs.id })
    .from(masterDrugs)
    .where(
      and(eq(masterDrugs.id, input.drugId), eq(masterDrugs.status, "ACTIVE"))
    )
    .limit(1);

  if (!drug) {
    throw new AppError(404, "NOT_FOUND", "الدواء غير موجود أو غير مفعل");
  }

  try {
    const [listing] = await db
      .insert(distributorListings)
      .values({
        distributorId,
        drugId: input.drugId,
        wholesalePriceSdg: input.wholesalePriceSdg,
        isAvailable: input.isAvailable,
        priceVersion: 1,
      })
      .returning();

    eventBus.emit("catalog.invalidated", {
      reason: "LISTING_MUTATED",
      distributorId,
    });

    return { listing };
  } catch (err) {
    if (isUniqueViolationError(err)) {
      throw new AppError(
        409,
        "CONFLICT",
        "هذا الصنف مضاف مسبقاً في قائمتك"
      );
    }
    throw err;
  }
}

/** Update a listing's price and/or availability with row locking and price change auditing. */
export async function updateDistributorListing(
  distributorId: string,
  listingId: string,
  input: Omit<UpdateListingInput, "id">
) {
  const txResult = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: distributorListings.id,
        distributorId: distributorListings.distributorId,
        drugId: distributorListings.drugId,
        wholesalePriceSdg: distributorListings.wholesalePriceSdg,
        isAvailable: distributorListings.isAvailable,
        priceVersion: distributorListings.priceVersion,
        manufacturer: masterDrugs.manufacturer,
      })
      .from(distributorListings)
      .innerJoin(masterDrugs, eq(distributorListings.drugId, masterDrugs.id))
      .where(eq(distributorListings.id, listingId))
      .for("update", { of: distributorListings });

    if (!existing) {
      throw new AppError(404, "NOT_FOUND", "الصنف غير موجود");
    }

    if (existing.distributorId !== distributorId) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "ليست لديك صلاحية لتعديل هذا الصنف"
      );
    }

    const priceChanged =
      input.wholesalePriceSdg !== undefined &&
      input.wholesalePriceSdg !== existing.wholesalePriceSdg;
    const availabilityChanged =
      input.isAvailable !== undefined &&
      input.isAvailable !== existing.isAvailable;

    const nextPriceSdg = input.wholesalePriceSdg ?? existing.wholesalePriceSdg;
    const nextAvailable = input.isAvailable ?? existing.isAvailable;
    const nextPriceVersion = priceChanged
      ? existing.priceVersion + 1
      : existing.priceVersion;
    const now = new Date();

    const [updated] = await tx
      .update(distributorListings)
      .set({
        wholesalePriceSdg: nextPriceSdg,
        isAvailable: nextAvailable,
        priceVersion: nextPriceVersion,
        updatedAt: now,
      })
      .where(eq(distributorListings.id, listingId))
      .returning();

    let clampedPercentNum: number | undefined;
    if (priceChanged) {
      const percentChangeStr = computeClampedPercentChange(
        existing.wholesalePriceSdg,
        nextPriceSdg
      );
      clampedPercentNum = Number(percentChangeStr);

      await tx.insert(priceChangeLogs).values({
        listingId: existing.id,
        distributorId,
        drugId: existing.drugId,
        manufacturer: existing.manufacturer,
        oldPriceSdg: existing.wholesalePriceSdg,
        newPriceSdg: nextPriceSdg,
        percentChange: percentChangeStr,
        changedAt: now,
      });
    }

    return {
      listing: updated,
      priceChanged,
      availabilityChanged,
      manufacturer: existing.manufacturer,
      percentChange: clampedPercentNum,
    };
  });

  if (txResult.priceChanged) {
    eventBus.emit("pricing.updated", {
      distributorId,
      manufacturer: txResult.manufacturer,
      affectedCount: 1,
      percentChange: txResult.percentChange,
    });
  } else if (txResult.availabilityChanged) {
    eventBus.emit("catalog.invalidated", {
      reason: "LISTING_MUTATED",
      distributorId,
    });
  }

  return { listing: txResult.listing };
}

/** Atomically adjust all active-drug listing prices for a manufacturer inside one ACID transaction. */
export async function applyBulkPercentPricing(
  distributorId: string,
  input: BulkPercentPricingInput
) {
  const updatedListings = await db.transaction(async (tx) => {
    const lockedRows = await tx
      .select({
        id: distributorListings.id,
        drugId: distributorListings.drugId,
        wholesalePriceSdg: distributorListings.wholesalePriceSdg,
        priceVersion: distributorListings.priceVersion,
        manufacturer: masterDrugs.manufacturer,
      })
      .from(distributorListings)
      .innerJoin(
        masterDrugs,
        and(
          eq(distributorListings.drugId, masterDrugs.id),
          eq(masterDrugs.status, "ACTIVE")
        )
      )
      .where(
        and(
          eq(distributorListings.distributorId, distributorId),
          eq(masterDrugs.manufacturer, input.manufacturer)
        )
      )
      .orderBy(asc(distributorListings.id))
      .for("update", { of: distributorListings });

    if (lockedRows.length === 0) {
      throw new AppError(
        404,
        "NOT_FOUND",
        "لا توجد أصناف مسجلة لهذه الشركة المنتجة في قائمتك"
      );
    }

    const computedRows = lockedRows.map((row) => ({
      ...row,
      newPriceSdg: Math.max(
        1,
        Math.round(row.wholesalePriceSdg * (1 + input.percentChange / 100))
      ),
    }));

    const listingIds = computedRows.map((row) => row.id);
    const priceCaseChunks = computedRows.map(
      (row) =>
        sql`WHEN ${distributorListings.id} = ${row.id}::uuid THEN ${row.newPriceSdg}::integer`
    );
    const priceCaseSql = sql.join(priceCaseChunks, sql` `);
    const now = new Date();

    const updated = await tx
      .update(distributorListings)
      .set({
        wholesalePriceSdg: sql`CASE ${priceCaseSql} END`,
        priceVersion: sql`${distributorListings.priceVersion} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(distributorListings.distributorId, distributorId),
          inArray(distributorListings.id, listingIds)
        )
      )
      .returning();

    const percentChangeStr = input.percentChange.toFixed(2);
    await tx.insert(priceChangeLogs).values(
      computedRows.map((row) => ({
        listingId: row.id,
        distributorId,
        drugId: row.drugId,
        manufacturer: row.manufacturer,
        oldPriceSdg: row.wholesalePriceSdg,
        newPriceSdg: row.newPriceSdg,
        percentChange: percentChangeStr,
        changedAt: now,
      }))
    );

    return updated;
  });

  eventBus.emit("pricing.updated", {
    distributorId,
    manufacturer: input.manufacturer,
    affectedCount: updatedListings.length,
    percentChange: input.percentChange,
  });

  return {
    manufacturer: input.manufacturer,
    percentChange: input.percentChange,
    updatedCount: updatedListings.length,
    updatedListings,
  };
}

/** Return recent price change audit logs owned by the distributor. */
export async function listPriceChangeLogs(
  distributorId: string,
  limit: number
) {
  return db
    .select({
      id: priceChangeLogs.id,
      listingId: priceChangeLogs.listingId,
      distributorId: priceChangeLogs.distributorId,
      drugId: priceChangeLogs.drugId,
      manufacturer: priceChangeLogs.manufacturer,
      oldPriceSdg: priceChangeLogs.oldPriceSdg,
      newPriceSdg: priceChangeLogs.newPriceSdg,
      percentChange: priceChangeLogs.percentChange,
      changedAt: priceChangeLogs.changedAt,
      drug: {
        tradeName: masterDrugs.tradeName,
        genericName: masterDrugs.genericName,
        strength: masterDrugs.strength,
      },
    })
    .from(priceChangeLogs)
    .innerJoin(masterDrugs, eq(priceChangeLogs.drugId, masterDrugs.id))
    .where(eq(priceChangeLogs.distributorId, distributorId))
    .orderBy(desc(priceChangeLogs.changedAt))
    .limit(limit);
}

/** List verified pharmacies with this distributor's permission state, newest verified first. */
export async function listNewVerifiedPharmacies(
  distributorId: string,
  filters: NewPharmaciesQuery
) {
  const conditions: SQL[] = [
    eq(organizations.type, "PHARMACY"),
    eq(organizations.verificationStatus, "VERIFIED"),
  ];

  if (filters.region) {
    conditions.push(
      ilike(organizations.region, `%${escapeLikePattern(filters.region)}%`)
    );
  }

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      licenseNumber: organizations.licenseNumber,
      region: organizations.region,
      verifiedAt: organizations.verifiedAt,
      createdAt: organizations.createdAt,
      permissionId: priceAccessPermissions.id,
      permissionStatus: priceAccessPermissions.status,
    })
    .from(organizations)
    .leftJoin(
      priceAccessPermissions,
      and(
        eq(priceAccessPermissions.distributorId, distributorId),
        eq(priceAccessPermissions.pharmacyId, organizations.id)
      )
    )
    .where(and(...conditions))
    .orderBy(
      sql`${organizations.verifiedAt} DESC NULLS LAST`,
      desc(organizations.createdAt)
    );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    licenseNumber: row.licenseNumber,
    region: row.region,
    verifiedAt: row.verifiedAt,
    permissionStatus: (row.permissionStatus ?? "NONE") as
      | "NONE"
      | PermissionStatus,
    permissionId: row.permissionId ?? null,
  }));
}

interface ActiveMasterDrugSummary {
  id: string;
  tradeName: string;
  genericName: string;
  manufacturer: string;
  strength: string;
  dosageForm: string;
}

interface SuggestedDrug {
  id: string;
  tradeName: string;
  genericName: string;
  manufacturer: string;
  strength: string;
}

export interface BulkImportInvalidRow {
  rowNumber: number;
  rawName: string;
  reason: string;
}

export interface BulkImportUnmappedRow {
  rowNumber: number;
  rawName: string;
  normalizedName: string;
  wholesalePriceSdg: number;
  isAvailable: boolean;
  suggestedDrugs: SuggestedDrug[];
}

function registerUnambiguousKey(
  map: Map<string, string | "AMBIGUOUS">,
  key: string,
  drugId: string
): void {
  if (!key) {
    return;
  }
  const existing = map.get(key);
  if (existing === undefined) {
    map.set(key, drugId);
  } else if (existing !== drugId) {
    map.set(key, "AMBIGUOUS");
  }
}

function buildDrugLookupMaps(
  activeDrugs: ActiveMasterDrugSummary[],
  aliases: Array<{ rawNameNormalized: string; masterDrugId: string }>
) {
  const activeDrugsById = new Map(activeDrugs.map((d) => [d.id, d]));

  const aliasMap = new Map<string, string>();
  for (const alias of aliases) {
    if (activeDrugsById.has(alias.masterDrugId)) {
      aliasMap.set(alias.rawNameNormalized, alias.masterDrugId);
    }
  }

  const exactTradeStrengthMap = new Map<string, string | "AMBIGUOUS">();
  const exactTradeMap = new Map<string, string | "AMBIGUOUS">();

  for (const drug of activeDrugs) {
    registerUnambiguousKey(
      exactTradeStrengthMap,
      normalizeDrugName(`${drug.tradeName} ${drug.strength}`),
      drug.id
    );
    registerUnambiguousKey(
      exactTradeMap,
      normalizeDrugName(drug.tradeName),
      drug.id
    );
  }

  return {
    activeDrugsById,
    aliasMap,
    exactTradeStrengthMap,
    exactTradeMap,
  };
}

function suggestCandidateDrugs(
  normalizedName: string,
  activeDrugs: ActiveMasterDrugSummary[]
): SuggestedDrug[] {
  const queryTokens = normalizedName.split(" ").filter((t) => t.length > 0);
  if (queryTokens.length === 0) {
    return [];
  }

  const scored: Array<{ score: number; drug: SuggestedDrug }> = [];

  for (const drug of activeDrugs) {
    const candidateNormalized = normalizeDrugName(
      `${drug.tradeName} ${drug.genericName} ${drug.strength}`
    );
    const candidateTokenSet = new Set(candidateNormalized.split(" "));

    let score = 0;
    for (const token of queryTokens) {
      if (candidateTokenSet.has(token)) {
        score += 2;
      } else if (
        token.length >= 3 &&
        candidateNormalized.includes(token)
      ) {
        score += 1;
      }
    }

    if (score > 0) {
      scored.push({
        score,
        drug: {
          id: drug.id,
          tradeName: drug.tradeName,
          genericName: drug.genericName,
          manufacturer: drug.manufacturer,
          strength: drug.strength,
        },
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((item) => item.drug);
}

/** Bulk import distributor listings from CSV/Excel/WhatsApp text or JSON rows. */
export async function bulkImportListings(
  distributorId: string,
  input: BulkImportInput
) {
  const parsedRows =
    input.format === "CSV_TEXT"
      ? csvTextParser.parse(input.text)
      : jsonRowsParser.parse(input.rows);

  if (parsedRows.length === 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "لا توجد صفوف صالحة للاستيراد"
    );
  }

  if (parsedRows.length > MAX_BULK_IMPORT_ROWS) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `الحد الأقصى للاستيراد في الدفعة الواحدة هو ${MAX_BULK_IMPORT_ROWS} صف`
    );
  }

  const [activeDrugs, aliases] = await Promise.all([
    db
      .select({
        id: masterDrugs.id,
        tradeName: masterDrugs.tradeName,
        genericName: masterDrugs.genericName,
        manufacturer: masterDrugs.manufacturer,
        strength: masterDrugs.strength,
        dosageForm: masterDrugs.dosageForm,
      })
      .from(masterDrugs)
      .where(eq(masterDrugs.status, "ACTIVE")),
    db
      .select({
        rawNameNormalized: distributorDrugAliases.rawNameNormalized,
        masterDrugId: distributorDrugAliases.masterDrugId,
      })
      .from(distributorDrugAliases)
      .where(eq(distributorDrugAliases.distributorId, distributorId)),
  ]);

  const { activeDrugsById, aliasMap, exactTradeStrengthMap, exactTradeMap } =
    buildDrugLookupMaps(activeDrugs, aliases);

  const invalidRows: BulkImportInvalidRow[] = [];
  const unmappedRows: BulkImportUnmappedRow[] = [];
  const matchedByDrugId = new Map<
    string,
    { masterDrugId: string; wholesalePriceSdg: number; isAvailable: boolean }
  >();

  for (const row of parsedRows) {
    const rawNameTrimmed = row.rawName.trim();
    const normalizedName = normalizeDrugName(rawNameTrimmed);

    if (normalizedName.length === 0) {
      invalidRows.push({
        rowNumber: row.rowNumber,
        rawName: row.rawName,
        reason: "اسم الصنف مفقود",
      });
      continue;
    }

    const parsedPrice = parseSdgIntegerPrice(row.rawPrice);
    if (parsedPrice === null) {
      invalidRows.push({
        rowNumber: row.rowNumber,
        rawName: row.rawName,
        reason:
          "السعر غير صالح؛ يجب أن يكون عدداً صحيحاً موجباً بالجنيه السوداني",
      });
      continue;
    }

    const parsedAvailable = parseAvailability(row.rawAvailable);
    if (parsedAvailable === null) {
      invalidRows.push({
        rowNumber: row.rowNumber,
        rawName: row.rawName,
        reason: "قيمة حالة التوفر غير صالحة",
      });
      continue;
    }

    let resolvedDrugId = aliasMap.get(normalizedName);
    if (!resolvedDrugId) {
      const tsMatch = exactTradeStrengthMap.get(normalizedName);
      if (tsMatch && tsMatch !== "AMBIGUOUS") {
        resolvedDrugId = tsMatch;
      }
    }
    if (!resolvedDrugId) {
      const tradeMatch = exactTradeMap.get(normalizedName);
      if (tradeMatch && tradeMatch !== "AMBIGUOUS") {
        resolvedDrugId = tradeMatch;
      }
    }

    if (!resolvedDrugId) {
      unmappedRows.push({
        rowNumber: row.rowNumber,
        rawName: row.rawName,
        normalizedName,
        wholesalePriceSdg: parsedPrice,
        isAvailable: parsedAvailable,
        suggestedDrugs: suggestCandidateDrugs(normalizedName, activeDrugs),
      });
      continue;
    }

    // Keep last occurrence if the same drug appears multiple times in one upload.
    matchedByDrugId.set(resolvedDrugId, {
      masterDrugId: resolvedDrugId,
      wholesalePriceSdg: parsedPrice,
      isAvailable: parsedAvailable,
    });
  }

  let createdCount = 0;
  let updatedCount = 0;

  if (matchedByDrugId.size > 0) {
    const matchedDrugIds = Array.from(matchedByDrugId.keys());

    const txCounts = await db.transaction(async (tx) => {
      const existingRows = await tx
        .select({
          id: distributorListings.id,
          drugId: distributorListings.drugId,
          wholesalePriceSdg: distributorListings.wholesalePriceSdg,
          priceVersion: distributorListings.priceVersion,
        })
        .from(distributorListings)
        .where(
          and(
            eq(distributorListings.distributorId, distributorId),
            inArray(distributorListings.drugId, matchedDrugIds)
          )
        )
        .orderBy(asc(distributorListings.id))
        .for("update");

      const existingByDrugId = new Map(
        existingRows.map((row) => [row.drugId, row])
      );

      const toInsert: Array<{
        distributorId: string;
        drugId: string;
        wholesalePriceSdg: number;
        isAvailable: boolean;
        priceVersion: number;
      }> = [];

      const toUpdate: Array<{
        existing: (typeof existingRows)[number];
        incoming: {
          masterDrugId: string;
          wholesalePriceSdg: number;
          isAvailable: boolean;
        };
        priceChanged: boolean;
        nextPriceVersion: number;
      }> = [];

      for (const incoming of matchedByDrugId.values()) {
        const existing = existingByDrugId.get(incoming.masterDrugId);
        if (!existing) {
          toInsert.push({
            distributorId,
            drugId: incoming.masterDrugId,
            wholesalePriceSdg: incoming.wholesalePriceSdg,
            isAvailable: incoming.isAvailable,
            priceVersion: 1,
          });
        } else {
          const priceChanged =
            incoming.wholesalePriceSdg !== existing.wholesalePriceSdg;
          toUpdate.push({
            existing,
            incoming,
            priceChanged,
            nextPriceVersion: priceChanged
              ? existing.priceVersion + 1
              : existing.priceVersion,
          });
        }
      }

      if (toInsert.length > 0) {
        await tx.insert(distributorListings).values(toInsert);
      }

      if (toUpdate.length > 0) {
        const now = new Date();
        const listingIds = toUpdate.map((u) => u.existing.id);

        const priceCaseSql = sql.join(
          toUpdate.map(
            (u) =>
              sql`WHEN ${distributorListings.id} = ${u.existing.id}::uuid THEN ${u.incoming.wholesalePriceSdg}::integer`
          ),
          sql` `
        );
        const availCaseSql = sql.join(
          toUpdate.map(
            (u) =>
              sql`WHEN ${distributorListings.id} = ${u.existing.id}::uuid THEN ${u.incoming.isAvailable}::boolean`
          ),
          sql` `
        );
        const versionCaseSql = sql.join(
          toUpdate.map(
            (u) =>
              sql`WHEN ${distributorListings.id} = ${u.existing.id}::uuid THEN ${u.nextPriceVersion}::integer`
          ),
          sql` `
        );

        await tx
          .update(distributorListings)
          .set({
            wholesalePriceSdg: sql`CASE ${priceCaseSql} END`,
            isAvailable: sql`CASE ${availCaseSql} END`,
            priceVersion: sql`CASE ${versionCaseSql} END`,
            updatedAt: now,
          })
          .where(
            and(
              eq(distributorListings.distributorId, distributorId),
              inArray(distributorListings.id, listingIds)
            )
          );

        const logRows = toUpdate
          .filter((u) => u.priceChanged)
          .map((u) => {
            const drug = activeDrugsById.get(u.incoming.masterDrugId)!;
            return {
              listingId: u.existing.id,
              distributorId,
              drugId: u.incoming.masterDrugId,
              manufacturer: drug.manufacturer,
              oldPriceSdg: u.existing.wholesalePriceSdg,
              newPriceSdg: u.incoming.wholesalePriceSdg,
              percentChange: computeClampedPercentChange(
                u.existing.wholesalePriceSdg,
                u.incoming.wholesalePriceSdg
              ),
              changedAt: now,
            };
          });

        if (logRows.length > 0) {
          await tx.insert(priceChangeLogs).values(logRows);
        }
      }

      return {
        createdCount: toInsert.length,
        updatedCount: toUpdate.length,
      };
    });

    createdCount = txCounts.createdCount;
    updatedCount = txCounts.updatedCount;
  }

  if (createdCount + updatedCount > 0) {
    eventBus.emit("catalog.invalidated", {
      reason: "BULK_IMPORT",
      distributorId,
    });
  }

  return {
    totalRows: parsedRows.length,
    createdCount,
    updatedCount,
    unmappedCount: unmappedRows.length,
    invalidCount: invalidRows.length,
    unmappedRows,
    invalidRows,
  };
}

/** Return the distributor's saved drug aliases joined with master drug details. */
export async function listDistributorAliases(distributorId: string) {
  return db
    .select({
      id: distributorDrugAliases.id,
      distributorId: distributorDrugAliases.distributorId,
      rawNameNormalized: distributorDrugAliases.rawNameNormalized,
      masterDrugId: distributorDrugAliases.masterDrugId,
      createdAt: distributorDrugAliases.createdAt,
      drug: {
        id: masterDrugs.id,
        tradeName: masterDrugs.tradeName,
        genericName: masterDrugs.genericName,
        manufacturer: masterDrugs.manufacturer,
        strength: masterDrugs.strength,
        dosageForm: masterDrugs.dosageForm,
      },
    })
    .from(distributorDrugAliases)
    .innerJoin(
      masterDrugs,
      eq(distributorDrugAliases.masterDrugId, masterDrugs.id)
    )
    .where(eq(distributorDrugAliases.distributorId, distributorId))
    .orderBy(desc(distributorDrugAliases.createdAt));
}

/** Save a one-time distributor drug alias and optionally upsert its listing price atomically. */
export async function upsertDistributorAlias(
  distributorId: string,
  input: UpsertAliasInput
) {
  const [drug] = await db
    .select({
      id: masterDrugs.id,
      manufacturer: masterDrugs.manufacturer,
    })
    .from(masterDrugs)
    .where(
      and(
        eq(masterDrugs.id, input.masterDrugId),
        eq(masterDrugs.status, "ACTIVE")
      )
    )
    .limit(1);

  if (!drug) {
    throw new AppError(404, "NOT_FOUND", "الدواء المرجعي غير موجود أو غير مفعل");
  }

  const rawNameNormalized = normalizeDrugName(input.rawName);
  if (rawNameNormalized.length === 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "اسم الصنف غير صالح بعد التطبيع"
    );
  }

  const txResult = await db.transaction(async (tx) => {
    const [existingAlias] = await tx
      .select({ id: distributorDrugAliases.id })
      .from(distributorDrugAliases)
      .where(
        and(
          eq(distributorDrugAliases.distributorId, distributorId),
          eq(distributorDrugAliases.rawNameNormalized, rawNameNormalized)
        )
      )
      .limit(1);

    const [alias] = await tx
      .insert(distributorDrugAliases)
      .values({
        distributorId,
        rawNameNormalized,
        masterDrugId: input.masterDrugId,
      })
      .onConflictDoUpdate({
        target: [
          distributorDrugAliases.distributorId,
          distributorDrugAliases.rawNameNormalized,
        ],
        set: {
          masterDrugId: input.masterDrugId,
        },
      })
      .returning();

    let listing: typeof distributorListings.$inferSelect | null = null;
    let listingMutated = false;

    if (input.wholesalePriceSdg !== undefined) {
      const now = new Date();
      const [existingListing] = await tx
        .select()
        .from(distributorListings)
        .where(
          and(
            eq(distributorListings.distributorId, distributorId),
            eq(distributorListings.drugId, input.masterDrugId)
          )
        )
        .for("update");

      if (!existingListing) {
        const [insertedListing] = await tx
          .insert(distributorListings)
          .values({
            distributorId,
            drugId: input.masterDrugId,
            wholesalePriceSdg: input.wholesalePriceSdg,
            isAvailable: input.isAvailable,
            priceVersion: 1,
          })
          .returning();

        listing = insertedListing;
        listingMutated = true;
      } else {
        const priceChanged =
          input.wholesalePriceSdg !== existingListing.wholesalePriceSdg;
        const nextPriceVersion = priceChanged
          ? existingListing.priceVersion + 1
          : existingListing.priceVersion;

        const [updatedListing] = await tx
          .update(distributorListings)
          .set({
            wholesalePriceSdg: input.wholesalePriceSdg,
            isAvailable: input.isAvailable,
            priceVersion: nextPriceVersion,
            updatedAt: now,
          })
          .where(eq(distributorListings.id, existingListing.id))
          .returning();

        if (priceChanged) {
          await tx.insert(priceChangeLogs).values({
            listingId: existingListing.id,
            distributorId,
            drugId: input.masterDrugId,
            manufacturer: drug.manufacturer,
            oldPriceSdg: existingListing.wholesalePriceSdg,
            newPriceSdg: input.wholesalePriceSdg,
            percentChange: computeClampedPercentChange(
              existingListing.wholesalePriceSdg,
              input.wholesalePriceSdg
            ),
            changedAt: now,
          });
        }

        listing = updatedListing;
        listingMutated =
          priceChanged || input.isAvailable !== existingListing.isAvailable;
      }
    }

    return {
      created: !existingAlias,
      alias,
      listing,
      listingMutated,
    };
  });

  if (txResult.listingMutated) {
    eventBus.emit("catalog.invalidated", {
      reason: "LISTING_MUTATED",
      distributorId,
    });
  }

  return {
    created: txResult.created,
    alias: txResult.alias,
    listing: txResult.listing,
  };
}
