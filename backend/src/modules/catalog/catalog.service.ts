import { createHash } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "../../db";
import {
  distributorListings,
  masterDrugs,
  organizations,
  priceAccessPermissions,
  type PermissionStatus,
  type SalesStatus,
} from "../../db/schema";
import { AppError } from "../../lib/errors";
import {
  cacheGet,
  cacheSet,
  getCatalogVersion,
  getPharmacyPermVersion,
} from "../../lib/redis";
import type { CatalogQuery, MasterDrugsQuery } from "./catalog.schemas";

export type EffectivePermissionStatus = "NONE" | PermissionStatus;

export interface MaskedCatalogItem {
  listingId: string;
  drugId: string;
  tradeName: string;
  genericName: string;
  manufacturer: string;
  strength: string;
  dosageForm: string;
  wholesalePriceSdg: number | null;
  priceLocked: boolean;
  permissionStatus: EffectivePermissionStatus;
  isAvailable: boolean;
  priceVersion: number;
  updatedAt: Date | string;
  distributor: {
    id: string;
    name: string;
    region: string;
    salesStatus: SalesStatus;
    orderExpiryMinutes: number;
  };
}

export interface CatalogSearchResult {
  items: MaskedCatalogItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  meta: {
    fetchedAt: string;
    catalogVersion: number;
    fromCache: boolean;
  };
}

/** Single source of truth for backend wholesale price masking. */
export function maskListingPrice(
  wholesalePriceSdg: number,
  permissionStatus: PermissionStatus | null | undefined
): {
  wholesalePriceSdg: number | null;
  priceLocked: boolean;
  permissionStatus: EffectivePermissionStatus;
} {
  const effectiveStatus: EffectivePermissionStatus = permissionStatus ?? "NONE";
  const isAuthorized = effectiveStatus === "APPROVED";

  return {
    wholesalePriceSdg: isAuthorized ? wholesalePriceSdg : null,
    priceLocked: !isAuthorized,
    permissionStatus: effectiveStatus,
  };
}

/** Build a tenant- and permission-version-isolated cache key for catalog queries. */
export function buildCatalogCacheKey(
  catalogVersion: number,
  pharmacyId: string,
  permVersion: number,
  query: CatalogQuery
): string {
  const normalized = {
    q: query.q ?? "",
    manufacturer: query.manufacturer ?? "",
    distributorId: query.distributorId ?? "",
    availableOnly: query.availableOnly,
    sort: query.sort,
    page: query.page,
    limit: query.limit,
  };

  const queryHash = createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");

  return `madad:catalog:v${catalogVersion}:p${pharmacyId}:pv${permVersion}:${queryHash}`;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function buildDrugSearchFilter(q: string): SQL | undefined {
  const pattern = `%${escapeLikePattern(q)}%`;
  return or(
    ilike(masterDrugs.tradeName, pattern),
    ilike(masterDrugs.genericName, pattern),
    ilike(masterDrugs.manufacturer, pattern)
  );
}

/** Search active catalog listings for a pharmacy with strict price masking and scoped caching. */
export async function searchCatalog(
  pharmacyId: string,
  query: CatalogQuery
): Promise<CatalogSearchResult> {
  const [catalogVer, permVer] = await Promise.all([
    getCatalogVersion(),
    getPharmacyPermVersion(pharmacyId),
  ]);

  const cacheKey = buildCatalogCacheKey(catalogVer, pharmacyId, permVer, query);
  const cached = await cacheGet<CatalogSearchResult>(cacheKey);

  if (cached) {
    return {
      ...cached,
      meta: {
        ...cached.meta,
        fromCache: true,
      },
    };
  }

  const conditions: SQL[] = [
    eq(masterDrugs.status, "ACTIVE"),
    eq(organizations.type, "DISTRIBUTOR"),
    eq(organizations.verificationStatus, "VERIFIED"),
  ];

  if (query.q) {
    const searchCondition = buildDrugSearchFilter(query.q);
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }
  if (query.manufacturer) {
    conditions.push(eq(masterDrugs.manufacturer, query.manufacturer));
  }
  if (query.distributorId) {
    conditions.push(eq(distributorListings.distributorId, query.distributorId));
  }
  if (query.availableOnly) {
    conditions.push(eq(distributorListings.isAvailable, true));
  }

  const whereClause = and(...conditions);
  const offset = (query.page - 1) * query.limit;

  const orderByClauses =
    query.sort === "cheapest"
      ? [
          sql`CASE WHEN ${priceAccessPermissions.status} = 'APPROVED' THEN ${distributorListings.wholesalePriceSdg} ELSE NULL END ASC NULLS LAST`,
          desc(distributorListings.updatedAt),
        ]
      : [desc(distributorListings.updatedAt)];

  const [countResult, rows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(distributorListings)
      .innerJoin(masterDrugs, eq(distributorListings.drugId, masterDrugs.id))
      .innerJoin(
        organizations,
        eq(distributorListings.distributorId, organizations.id)
      )
      .where(whereClause),
    db
      .select({
        listingId: distributorListings.id,
        drugId: masterDrugs.id,
        tradeName: masterDrugs.tradeName,
        genericName: masterDrugs.genericName,
        manufacturer: masterDrugs.manufacturer,
        strength: masterDrugs.strength,
        dosageForm: masterDrugs.dosageForm,
        wholesalePriceSdg: distributorListings.wholesalePriceSdg,
        permissionStatus: priceAccessPermissions.status,
        isAvailable: distributorListings.isAvailable,
        priceVersion: distributorListings.priceVersion,
        updatedAt: distributorListings.updatedAt,
        distributor: {
          id: organizations.id,
          name: organizations.name,
          region: organizations.region,
          salesStatus: organizations.salesStatus,
          orderExpiryMinutes: organizations.orderExpiryMinutes,
        },
      })
      .from(distributorListings)
      .innerJoin(masterDrugs, eq(distributorListings.drugId, masterDrugs.id))
      .innerJoin(
        organizations,
        eq(distributorListings.distributorId, organizations.id)
      )
      .leftJoin(
        priceAccessPermissions,
        and(
          eq(
            priceAccessPermissions.distributorId,
            distributorListings.distributorId
          ),
          eq(priceAccessPermissions.pharmacyId, pharmacyId)
        )
      )
      .where(whereClause)
      .orderBy(...orderByClauses)
      .limit(query.limit)
      .offset(offset),
  ]);

  const total = countResult[0]?.total ?? 0;
  const items: MaskedCatalogItem[] = rows.map((row) => {
    const masked = maskListingPrice(
      row.wholesalePriceSdg,
      row.permissionStatus
    );

    return {
      listingId: row.listingId,
      drugId: row.drugId,
      tradeName: row.tradeName,
      genericName: row.genericName,
      manufacturer: row.manufacturer,
      strength: row.strength,
      dosageForm: row.dosageForm,
      wholesalePriceSdg: masked.wholesalePriceSdg,
      priceLocked: masked.priceLocked,
      permissionStatus: masked.permissionStatus,
      isAvailable: row.isAvailable,
      priceVersion: row.priceVersion,
      updatedAt: row.updatedAt,
      distributor: row.distributor,
    };
  });

  const result: CatalogSearchResult = {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
    },
    meta: {
      fetchedAt: new Date().toISOString(),
      catalogVersion: catalogVer,
      fromCache: false,
    },
  };

  void cacheSet(cacheKey, result, 300);

  return result;
}

/** Return sorted distinct manufacturer names from active master drugs. */
export async function listManufacturers(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ manufacturer: masterDrugs.manufacturer })
    .from(masterDrugs)
    .where(eq(masterDrugs.status, "ACTIVE"))
    .orderBy(asc(masterDrugs.manufacturer));

  return rows.map((row) => row.manufacturer);
}

/** Return up to 50 active master drugs matching optional query and manufacturer filters. */
export async function searchMasterDrugs(query: MasterDrugsQuery) {
  const conditions: SQL[] = [eq(masterDrugs.status, "ACTIVE")];

  if (query.q) {
    const searchCondition = buildDrugSearchFilter(query.q);
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }
  if (query.manufacturer) {
    conditions.push(eq(masterDrugs.manufacturer, query.manufacturer));
  }

  return db
    .select({
      id: masterDrugs.id,
      genericName: masterDrugs.genericName,
      tradeName: masterDrugs.tradeName,
      manufacturer: masterDrugs.manufacturer,
      strength: masterDrugs.strength,
      dosageForm: masterDrugs.dosageForm,
    })
    .from(masterDrugs)
    .where(and(...conditions))
    .orderBy(asc(masterDrugs.tradeName))
    .limit(50);
}

/** List all verified distributors with active listing counts and pharmacy permission status. */
export async function listDistributorsForPharmacy(pharmacyId: string) {
  const activeCountsSubquery = db
    .select({
      distributorId: distributorListings.distributorId,
      activeCount: sql<number>`count(*)::int`.as("active_count"),
    })
    .from(distributorListings)
    .innerJoin(
      masterDrugs,
      and(
        eq(distributorListings.drugId, masterDrugs.id),
        eq(masterDrugs.status, "ACTIVE")
      )
    )
    .where(eq(distributorListings.isAvailable, true))
    .groupBy(distributorListings.distributorId)
    .as("active_counts");

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      region: organizations.region,
      salesStatus: organizations.salesStatus,
      orderExpiryMinutes: organizations.orderExpiryMinutes,
      activeListingsCount: sql<number>`coalesce(${activeCountsSubquery.activeCount}, 0)::int`,
      permissionId: priceAccessPermissions.id,
      permissionStatus: priceAccessPermissions.status,
    })
    .from(organizations)
    .leftJoin(
      activeCountsSubquery,
      eq(activeCountsSubquery.distributorId, organizations.id)
    )
    .leftJoin(
      priceAccessPermissions,
      and(
        eq(priceAccessPermissions.distributorId, organizations.id),
        eq(priceAccessPermissions.pharmacyId, pharmacyId)
      )
    )
    .where(
      and(
        eq(organizations.type, "DISTRIBUTOR"),
        eq(organizations.verificationStatus, "VERIFIED")
      )
    )
    .orderBy(asc(organizations.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    region: row.region,
    salesStatus: row.salesStatus,
    orderExpiryMinutes: row.orderExpiryMinutes,
    activeListingsCount: row.activeListingsCount,
    permissionStatus: (row.permissionStatus ?? "NONE") as EffectivePermissionStatus,
    permissionId: row.permissionId ?? null,
  }));
}

/** Get verified distributor profile, permission status, and price-masked listings for a pharmacy. */
export async function getDistributorDetailForPharmacy(
  pharmacyId: string,
  distributorId: string
) {
  const [distributor] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      region: organizations.region,
      salesStatus: organizations.salesStatus,
      orderExpiryMinutes: organizations.orderExpiryMinutes,
    })
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
    throw new AppError(404, "NOT_FOUND", "الموزع غير موجود أو غير مفعل");
  }

  const [permissionRows, listingRows] = await Promise.all([
    db
      .select({
        id: priceAccessPermissions.id,
        status: priceAccessPermissions.status,
      })
      .from(priceAccessPermissions)
      .where(
        and(
          eq(priceAccessPermissions.distributorId, distributorId),
          eq(priceAccessPermissions.pharmacyId, pharmacyId)
        )
      )
      .limit(1),
    db
      .select({
        listingId: distributorListings.id,
        drugId: masterDrugs.id,
        tradeName: masterDrugs.tradeName,
        genericName: masterDrugs.genericName,
        manufacturer: masterDrugs.manufacturer,
        strength: masterDrugs.strength,
        dosageForm: masterDrugs.dosageForm,
        wholesalePriceSdg: distributorListings.wholesalePriceSdg,
        isAvailable: distributorListings.isAvailable,
        priceVersion: distributorListings.priceVersion,
        updatedAt: distributorListings.updatedAt,
      })
      .from(distributorListings)
      .innerJoin(masterDrugs, eq(distributorListings.drugId, masterDrugs.id))
      .where(
        and(
          eq(distributorListings.distributorId, distributorId),
          eq(masterDrugs.status, "ACTIVE")
        )
      )
      .orderBy(desc(distributorListings.updatedAt)),
  ]);

  const permission = permissionRows[0] ?? null;
  const listings = listingRows.map((row) => {
    const masked = maskListingPrice(row.wholesalePriceSdg, permission?.status);

    return {
      listingId: row.listingId,
      drugId: row.drugId,
      tradeName: row.tradeName,
      genericName: row.genericName,
      manufacturer: row.manufacturer,
      strength: row.strength,
      dosageForm: row.dosageForm,
      wholesalePriceSdg: masked.wholesalePriceSdg,
      priceLocked: masked.priceLocked,
      permissionStatus: masked.permissionStatus,
      isAvailable: row.isAvailable,
      priceVersion: row.priceVersion,
      updatedAt: row.updatedAt,
    };
  });

  return {
    distributor,
    permissionStatus: (permission?.status ?? "NONE") as EffectivePermissionStatus,
    permissionId: permission?.id ?? null,
    listings,
  };
}
