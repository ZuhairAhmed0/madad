import {
  and,
  desc,
  DrizzleQueryError,
  eq,
  inArray,
} from "drizzle-orm";
import { DatabaseError } from "pg";
import { db } from "../../db";
import {
  distributorListings,
  masterDrugs,
  organizations,
  pharmacyWatchlist,
  priceAccessPermissions,
  priceChangeLogs,
  type PricingPolicy,
} from "../../db/schema";
import { AppError } from "../../lib/errors";
import type {
  CreateWatchlistInput,
  PriceAlertsQuery,
  UpdateWatchlistInput,
} from "./watchlist.schemas";

export interface AuthorizedListingSnapshot {
  listingId: string;
  drugId: string;
  distributorId: string;
  distributorName: string;
  wholesalePriceSdg: number;
  isAvailable: boolean;
  updatedAt: Date;
}

export interface WatchlistMetricInput {
  pricingPolicy: PricingPolicy;
  preferredDistributorId: string | null;
  profitMarginPercent: string | number;
  lastAcknowledgedWholesaleSdg: number | null;
}

export interface EvaluatedWatchlistMetrics {
  effectiveWholesaleSdg: number | null;
  referenceDistributor: {
    id: string;
    name: string;
    isAvailable: boolean;
    updatedAt: Date;
  } | null;
  suggestedShelfPriceSdg: number | null;
  hasPriceIncrease: boolean;
  hasPriceChange: boolean;
  priceDeltaSdg: number | null;
  priceDeltaPercent: number | null;
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

/** Pure single-source-of-truth calculation of effective wholesale, shelf margin, and delta alerts. */
export function evaluateWatchlistMetrics(
  item: WatchlistMetricInput,
  authorizedListingsForDrug: readonly AuthorizedListingSnapshot[]
): EvaluatedWatchlistMetrics {
  let selected: AuthorizedListingSnapshot | null = null;

  if (item.pricingPolicy === "PREFERRED_DISTRIBUTOR") {
    if (item.preferredDistributorId) {
      selected =
        authorizedListingsForDrug.find(
          (l) => l.distributorId === item.preferredDistributorId
        ) ?? null;
    }
  } else if (authorizedListingsForDrug.length > 0) {
    const available = authorizedListingsForDrug.filter((l) => l.isAvailable);
    const candidatePool =
      available.length > 0 ? available : authorizedListingsForDrug;

    selected = candidatePool.reduce((highest, current) => {
      if (current.wholesalePriceSdg > highest.wholesalePriceSdg) {
        return current;
      }
      if (
        current.wholesalePriceSdg === highest.wholesalePriceSdg &&
        current.updatedAt.getTime() > highest.updatedAt.getTime()
      ) {
        return current;
      }
      return highest;
    });
  }

  const effectiveWholesaleSdg = selected ? selected.wholesalePriceSdg : null;
  const referenceDistributor = selected
    ? {
        id: selected.distributorId,
        name: selected.distributorName,
        isAvailable: selected.isAvailable,
        updatedAt: selected.updatedAt,
      }
    : null;

  const marginPercent = Number(item.profitMarginPercent);
  const suggestedShelfPriceSdg =
    effectiveWholesaleSdg !== null
      ? Math.round(effectiveWholesaleSdg * (1 + marginPercent / 100))
      : null;

  const hasPriceIncrease =
    effectiveWholesaleSdg !== null &&
    item.lastAcknowledgedWholesaleSdg !== null &&
    effectiveWholesaleSdg > item.lastAcknowledgedWholesaleSdg;

  const hasPriceChange =
    effectiveWholesaleSdg !== null &&
    item.lastAcknowledgedWholesaleSdg !== null &&
    effectiveWholesaleSdg !== item.lastAcknowledgedWholesaleSdg;

  const priceDeltaSdg =
    effectiveWholesaleSdg !== null && item.lastAcknowledgedWholesaleSdg !== null
      ? effectiveWholesaleSdg - item.lastAcknowledgedWholesaleSdg
      : null;

  const priceDeltaPercent =
    priceDeltaSdg !== null && item.lastAcknowledgedWholesaleSdg
      ? Number(
          ((priceDeltaSdg / item.lastAcknowledgedWholesaleSdg) * 100).toFixed(2)
        )
      : null;

  return {
    effectiveWholesaleSdg,
    referenceDistributor,
    suggestedShelfPriceSdg,
    hasPriceIncrease,
    hasPriceChange,
    priceDeltaSdg,
    priceDeltaPercent,
  };
}

/** Batch-load authorized listings only (APPROVED + VERIFIED distributor) grouped by drugId. */
export async function fetchAuthorizedListingsByDrugIds(
  pharmacyId: string,
  drugIds: string[]
): Promise<Map<string, AuthorizedListingSnapshot[]>> {
  const byDrugId = new Map<string, AuthorizedListingSnapshot[]>();
  if (drugIds.length === 0) {
    return byDrugId;
  }

  const rows = await db
    .select({
      listingId: distributorListings.id,
      drugId: distributorListings.drugId,
      distributorId: distributorListings.distributorId,
      distributorName: organizations.name,
      wholesalePriceSdg: distributorListings.wholesalePriceSdg,
      isAvailable: distributorListings.isAvailable,
      updatedAt: distributorListings.updatedAt,
    })
    .from(distributorListings)
    .innerJoin(
      organizations,
      and(
        eq(organizations.id, distributorListings.distributorId),
        eq(organizations.type, "DISTRIBUTOR"),
        eq(organizations.verificationStatus, "VERIFIED")
      )
    )
    .innerJoin(
      priceAccessPermissions,
      and(
        eq(
          priceAccessPermissions.distributorId,
          distributorListings.distributorId
        ),
        eq(priceAccessPermissions.pharmacyId, pharmacyId),
        eq(priceAccessPermissions.status, "APPROVED")
      )
    )
    .where(inArray(distributorListings.drugId, drugIds));

  for (const row of rows) {
    const list = byDrugId.get(row.drugId);
    if (list) {
      list.push(row);
    } else {
      byDrugId.set(row.drugId, [row]);
    }
  }

  return byDrugId;
}

async function assertVerifiedDistributor(distributorId: string): Promise<void> {
  const [distributor] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, distributorId),
        eq(organizations.type, "DISTRIBUTOR"),
        eq(organizations.verificationStatus, "VERIFIED")
      )
    )
    .limit(1);

  if (!distributor) {
    throw new AppError(404, "NOT_FOUND", "الموزع المفضل غير موجود أو غير مفعل");
  }
}

async function loadWatchlistRowWithDrug(id: string) {
  const [row] = await db
    .select({
      watchlist: pharmacyWatchlist,
      drug: {
        id: masterDrugs.id,
        tradeName: masterDrugs.tradeName,
        genericName: masterDrugs.genericName,
        manufacturer: masterDrugs.manufacturer,
        strength: masterDrugs.strength,
        dosageForm: masterDrugs.dosageForm,
      },
    })
    .from(pharmacyWatchlist)
    .innerJoin(masterDrugs, eq(pharmacyWatchlist.drugId, masterDrugs.id))
    .where(eq(pharmacyWatchlist.id, id))
    .limit(1);

  return row ?? null;
}

function buildEnrichedWatchlistItem(
  row: typeof pharmacyWatchlist.$inferSelect,
  drug: {
    id: string;
    tradeName: string;
    genericName: string;
    manufacturer: string;
    strength: string;
    dosageForm: string;
  },
  authorizedListings: readonly AuthorizedListingSnapshot[]
) {
  const metrics = evaluateWatchlistMetrics(row, authorizedListings);
  return {
    ...row,
    drug,
    ...metrics,
  };
}

/** List pharmacy watchlist items enriched with authorized wholesale radar and shelf calculations. */
export async function listWatchlist(pharmacyId: string) {
  const rows = await db
    .select({
      watchlist: pharmacyWatchlist,
      drug: {
        id: masterDrugs.id,
        tradeName: masterDrugs.tradeName,
        genericName: masterDrugs.genericName,
        manufacturer: masterDrugs.manufacturer,
        strength: masterDrugs.strength,
        dosageForm: masterDrugs.dosageForm,
      },
    })
    .from(pharmacyWatchlist)
    .innerJoin(
      masterDrugs,
      and(
        eq(pharmacyWatchlist.drugId, masterDrugs.id),
        eq(masterDrugs.status, "ACTIVE")
      )
    )
    .where(eq(pharmacyWatchlist.pharmacyId, pharmacyId));

  const drugIds = Array.from(new Set(rows.map((r) => r.watchlist.drugId)));
  const authorizedByDrugId = await fetchAuthorizedListingsByDrugIds(
    pharmacyId,
    drugIds
  );

  const items = rows
    .map((r) =>
      buildEnrichedWatchlistItem(
        r.watchlist,
        r.drug,
        authorizedByDrugId.get(r.watchlist.drugId) ?? []
      )
    )
    .sort((a, b) => {
      if (a.hasPriceIncrease !== b.hasPriceIncrease) {
        return a.hasPriceIncrease ? -1 : 1;
      }
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

  const alertsCount = items.filter((item) => item.hasPriceIncrease).length;

  return { items, alertsCount };
}

/** List recent price change alerts strictly from APPROVED verified distributors. */
export async function listPriceAlerts(
  pharmacyId: string,
  query: PriceAlertsQuery
) {
  const baseQuery = db
    .select({
      id: priceChangeLogs.id,
      listingId: priceChangeLogs.listingId,
      distributorId: priceChangeLogs.distributorId,
      distributorName: organizations.name,
      drugId: priceChangeLogs.drugId,
      manufacturer: priceChangeLogs.manufacturer,
      oldPriceSdg: priceChangeLogs.oldPriceSdg,
      newPriceSdg: priceChangeLogs.newPriceSdg,
      percentChange: priceChangeLogs.percentChange,
      changedAt: priceChangeLogs.changedAt,
      drug: {
        id: masterDrugs.id,
        tradeName: masterDrugs.tradeName,
        genericName: masterDrugs.genericName,
        strength: masterDrugs.strength,
        dosageForm: masterDrugs.dosageForm,
      },
    })
    .from(priceChangeLogs)
    .innerJoin(
      organizations,
      and(
        eq(organizations.id, priceChangeLogs.distributorId),
        eq(organizations.type, "DISTRIBUTOR"),
        eq(organizations.verificationStatus, "VERIFIED")
      )
    )
    .innerJoin(
      priceAccessPermissions,
      and(
        eq(priceAccessPermissions.distributorId, priceChangeLogs.distributorId),
        eq(priceAccessPermissions.pharmacyId, pharmacyId),
        eq(priceAccessPermissions.status, "APPROVED")
      )
    )
    .innerJoin(
      masterDrugs,
      and(
        eq(masterDrugs.id, priceChangeLogs.drugId),
        eq(masterDrugs.status, "ACTIVE")
      )
    );

  if (query.watchedOnly) {
    return baseQuery
      .innerJoin(
        pharmacyWatchlist,
        and(
          eq(pharmacyWatchlist.pharmacyId, pharmacyId),
          eq(pharmacyWatchlist.drugId, priceChangeLogs.drugId)
        )
      )
      .orderBy(desc(priceChangeLogs.changedAt))
      .limit(query.limit);
  }

  return baseQuery.orderBy(desc(priceChangeLogs.changedAt)).limit(query.limit);
}

/** Add an active drug to a pharmacy's price watchlist with initial shelf calculation. */
export async function createWatchlistItem(
  pharmacyId: string,
  input: CreateWatchlistInput
) {
  const [drug] = await db
    .select({
      id: masterDrugs.id,
      tradeName: masterDrugs.tradeName,
      genericName: masterDrugs.genericName,
      manufacturer: masterDrugs.manufacturer,
      strength: masterDrugs.strength,
      dosageForm: masterDrugs.dosageForm,
    })
    .from(masterDrugs)
    .where(
      and(eq(masterDrugs.id, input.drugId), eq(masterDrugs.status, "ACTIVE"))
    )
    .limit(1);

  if (!drug) {
    throw new AppError(404, "NOT_FOUND", "الدواء غير موجود أو غير مفعل");
  }

  const preferredDistributorId = input.preferredDistributorId ?? null;
  if (preferredDistributorId) {
    await assertVerifiedDistributor(preferredDistributorId);
  }

  const authorizedByDrugId = await fetchAuthorizedListingsByDrugIds(
    pharmacyId,
    [input.drugId]
  );
  const authorizedListings = authorizedByDrugId.get(input.drugId) ?? [];
  const marginStr = input.profitMarginPercent.toFixed(2);

  const initialMetrics = evaluateWatchlistMetrics(
    {
      pricingPolicy: input.pricingPolicy,
      preferredDistributorId,
      profitMarginPercent: marginStr,
      lastAcknowledgedWholesaleSdg: null,
    },
    authorizedListings
  );

  try {
    const [inserted] = await db
      .insert(pharmacyWatchlist)
      .values({
        pharmacyId,
        drugId: input.drugId,
        pricingPolicy: input.pricingPolicy,
        preferredDistributorId:
          input.pricingPolicy === "PREFERRED_DISTRIBUTOR"
            ? preferredDistributorId
            : null,
        profitMarginPercent: marginStr,
        autoCalcEnabled: input.autoCalcEnabled,
        lastAcknowledgedWholesaleSdg: initialMetrics.effectiveWholesaleSdg,
        currentShelfPriceSdg: initialMetrics.suggestedShelfPriceSdg,
      })
      .returning();

    return {
      item: buildEnrichedWatchlistItem(inserted, drug, authorizedListings),
    };
  } catch (err) {
    if (isUniqueViolationError(err)) {
      throw new AppError(
        409,
        "CONFLICT",
        "هذا الصنف موجود مسبقاً في قائمة المتابعة"
      );
    }
    throw err;
  }
}

/** Update watchlist policy, margin, or manual shelf price with IDOR and distributor checks. */
export async function updateWatchlistItem(
  pharmacyId: string,
  id: string,
  input: Omit<UpdateWatchlistInput, "id">
) {
  const found = await loadWatchlistRowWithDrug(id);
  if (!found) {
    throw new AppError(404, "NOT_FOUND", "عنصر المتابعة غير موجود");
  }

  const { watchlist: existing, drug } = found;
  if (existing.pharmacyId !== pharmacyId) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "ليست لديك صلاحية لتعديل هذا العنصر"
    );
  }

  const nextPolicy = input.pricingPolicy ?? existing.pricingPolicy;
  const nextPreferredDistributorId =
    nextPolicy === "HIGHEST_AUTHORIZED"
      ? null
      : input.preferredDistributorId !== undefined
        ? input.preferredDistributorId
        : existing.preferredDistributorId;

  if (nextPolicy === "PREFERRED_DISTRIBUTOR" && !nextPreferredDistributorId) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "يجب تحديد الموزع المفضل عند اختيار سياسة الموزع المفضل"
    );
  }

  if (
    nextPreferredDistributorId &&
    nextPreferredDistributorId !== existing.preferredDistributorId
  ) {
    await assertVerifiedDistributor(nextPreferredDistributorId);
  }

  const [updated] = await db
    .update(pharmacyWatchlist)
    .set({
      pricingPolicy: nextPolicy,
      preferredDistributorId: nextPreferredDistributorId,
      ...(input.profitMarginPercent !== undefined
        ? { profitMarginPercent: input.profitMarginPercent.toFixed(2) }
        : {}),
      ...(input.autoCalcEnabled !== undefined
        ? { autoCalcEnabled: input.autoCalcEnabled }
        : {}),
      ...(input.currentShelfPriceSdg !== undefined
        ? { currentShelfPriceSdg: input.currentShelfPriceSdg }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(pharmacyWatchlist.id, id))
    .returning();

  const authorizedByDrugId = await fetchAuthorizedListingsByDrugIds(
    pharmacyId,
    [updated.drugId]
  );

  return {
    item: buildEnrichedWatchlistItem(
      updated,
      drug,
      authorizedByDrugId.get(updated.drugId) ?? []
    ),
  };
}

/** Acknowledge the current authorized wholesale price and update the shelf price. */
export async function acknowledgeWatchlistItem(
  pharmacyId: string,
  id: string,
  input: { customShelfPriceSdg?: number }
) {
  const found = await loadWatchlistRowWithDrug(id);
  if (!found) {
    throw new AppError(404, "NOT_FOUND", "عنصر المتابعة غير موجود");
  }

  const { watchlist: existing, drug } = found;
  if (existing.pharmacyId !== pharmacyId) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "ليست لديك صلاحية لتعديل هذا العنصر"
    );
  }

  const authorizedByDrugId = await fetchAuthorizedListingsByDrugIds(
    pharmacyId,
    [existing.drugId]
  );
  const authorizedListings = authorizedByDrugId.get(existing.drugId) ?? [];
  const metrics = evaluateWatchlistMetrics(existing, authorizedListings);

  if (metrics.effectiveWholesaleSdg === null) {
    throw new AppError(
      400,
      "NO_AUTHORIZED_PRICE",
      "لا يوجد سعر جملة مصرح به حالياً لهذا الصنف"
    );
  }

  const nextShelfPriceSdg =
    input.customShelfPriceSdg ??
    (existing.autoCalcEnabled
      ? metrics.suggestedShelfPriceSdg
      : existing.currentShelfPriceSdg);

  const [updated] = await db
    .update(pharmacyWatchlist)
    .set({
      lastAcknowledgedWholesaleSdg: metrics.effectiveWholesaleSdg,
      currentShelfPriceSdg: nextShelfPriceSdg,
      updatedAt: new Date(),
    })
    .where(eq(pharmacyWatchlist.id, id))
    .returning();

  return {
    item: buildEnrichedWatchlistItem(updated, drug, authorizedListings),
  };
}

/** Remove an item from the pharmacy's watchlist with IDOR validation. */
export async function deleteWatchlistItem(pharmacyId: string, id: string) {
  const [existing] = await db
    .select({
      id: pharmacyWatchlist.id,
      pharmacyId: pharmacyWatchlist.pharmacyId,
    })
    .from(pharmacyWatchlist)
    .where(eq(pharmacyWatchlist.id, id))
    .limit(1);

  if (!existing) {
    throw new AppError(404, "NOT_FOUND", "عنصر المتابعة غير موجود");
  }

  if (existing.pharmacyId !== pharmacyId) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "ليست لديك صلاحية لحذف هذا العنصر"
    );
  }

  await db.delete(pharmacyWatchlist).where(eq(pharmacyWatchlist.id, id));

  return { ok: true, id };
}
