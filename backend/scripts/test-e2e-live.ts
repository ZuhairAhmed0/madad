import "dotenv/config";
import assert from "node:assert/strict";
import { eq, inArray, or } from "drizzle-orm";
import { db, pool } from "../src/db";
import {
  distributorDrugAliases,
  distributorListings,
  orderItems,
  orders,
  organizations,
  pharmacyWatchlist,
  priceAccessPermissions,
  priceChangeLogs,
  users,
} from "../src/db/schema";

const BASE_URL = (process.env.API_URL ?? "http://localhost:4000").replace(
  /\/+$/,
  ""
);
const AUTH_COOKIE_NAME = "madad_token";
const TEMP_ORG_PASSWORD = "E2ePass123!";

interface ApiResponse<T = unknown> {
  status: number;
  data: T;
  rawText: string;
  headers: Headers;
  setCookies: string[];
}

interface ErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: {
      conflicts?: Array<{
        listingId?: string;
        currentPriceVersion?: number;
        currentWholesalePriceSdg?: number;
      }>;
    };
  };
}

interface HealthBody {
  status: string;
  db?: { ok?: boolean };
  redis?: { ok?: boolean };
}

interface AuthUserSummary {
  id: string;
  email: string;
  fullName: string;
  role: string;
  organizationId: string | null;
}

interface OrgSummary {
  id: string;
  name: string;
  type: "PHARMACY" | "DISTRIBUTOR";
  licenseNumber: string;
  region: string;
  verificationStatus: "PENDING" | "VERIFIED" | "SUSPENDED";
  verifiedAt: string | null;
  salesStatus: "OPEN" | "PAUSED_REPRICING";
  orderExpiryMinutes: number;
}

interface LoginBody {
  token: string;
  user: AuthUserSummary;
  organization: OrgSummary | null;
}

interface MeBody {
  user: AuthUserSummary;
  organization: OrgSummary | null;
}

interface MasterDrugItem {
  id: string;
  genericName: string;
  tradeName: string;
  manufacturer: string;
  strength: string;
  dosageForm: string;
}

interface DistributorListingItem {
  id: string;
  distributorId: string;
  drugId: string;
  wholesalePriceSdg: number;
  isAvailable: boolean;
  priceVersion: number;
}

interface PriceLogItem {
  id: string;
  listingId: string;
  distributorId: string;
  drugId: string;
  oldPriceSdg: number;
  newPriceSdg: number;
  percentChange: string;
}

interface BulkImportBody {
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  unmappedCount: number;
  invalidCount: number;
  unmappedRows: Array<{
    rowNumber: number;
    rawName: string;
    normalizedName: string;
    wholesalePriceSdg: number;
  }>;
  invalidRows: Array<{
    rowNumber: number;
    rawName: string;
    reason: string;
  }>;
}

interface AliasRecord {
  id: string;
  distributorId: string;
  rawNameNormalized: string;
  masterDrugId: string;
}

interface CatalogItem {
  listingId: string;
  drugId: string;
  tradeName: string;
  manufacturer: string;
  wholesalePriceSdg: number | null;
  priceLocked: boolean;
  permissionStatus: string;
  isAvailable: boolean;
  priceVersion: number;
  distributor: {
    id: string;
    name: string;
  };
}

interface CatalogBody {
  items: CatalogItem[];
  meta: {
    catalogVersion: number;
    fromCache: boolean;
  };
}

interface PermissionRecord {
  id: string;
  distributorId: string;
  pharmacyId: string;
  status: "PENDING" | "APPROVED" | "REVOKED";
}

interface WatchlistItem {
  id: string;
  drugId: string;
  pricingPolicy: "HIGHEST_AUTHORIZED" | "PREFERRED_DISTRIBUTOR";
  preferredDistributorId: string | null;
  effectiveWholesaleSdg: number | null;
  suggestedShelfPriceSdg: number | null;
  hasPriceIncrease: boolean;
}

interface OrderRecord {
  id: string;
  pharmacyId: string;
  distributorId: string;
  status: "PENDING_CONFIRMATION" | "CONFIRMED" | "EXPIRED_CANCELLED" | "CANCELLED";
  totalSdg: number;
  items?: Array<{ id: string; listingId: string; quantity: number }>;
  counterparty?: { id: string; name: string } | null;
}

function getSetCookies(headers: Headers): string[] {
  const maybeGetSetCookie = (
    headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;
  if (typeof maybeGetSetCookie === "function") {
    return maybeGetSetCookie.call(headers);
  }
  const combined = headers.get("set-cookie");
  return combined ? [combined] : [];
}

function extractAuthCookieValue(setCookies: string[]): string {
  for (const cookie of setCookies) {
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]+)`));
    if (match && match[1]) {
      return match[1];
    }
  }
  throw new Error(`Expected ${AUTH_COOKIE_NAME} cookie in Set-Cookie headers`);
}

function assertAuthSetCookiePresent(setCookies: string[], label: string): string {
  const matching = setCookies.find((c) => c.includes(`${AUTH_COOKIE_NAME}=`));
  assert.ok(matching, `${label}: Set-Cookie must contain ${AUTH_COOKIE_NAME}=`);
  assert.ok(
    matching.toLowerCase().includes("httponly"),
    `${label}: Set-Cookie must set HttpOnly`
  );
  return extractAuthCookieValue(setCookies);
}

function assertNoPasswordHash(rawText: string, context: string): void {
  assert.ok(
    !rawText.includes("passwordHash"),
    `${context}: response must strictly omit passwordHash`
  );
}

async function requestJson<T>(
  path: string,
  options: {
    method?: string;
    token?: string;
    headers?: Record<string, string>;
    body?: unknown;
    rawBody?: string;
  } = {}
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let bodyStr: string | undefined;
  if (options.rawBody !== undefined) {
    headers["Content-Type"] ??= "application/json";
    bodyStr = options.rawBody;
  } else if (options.body !== undefined) {
    headers["Content-Type"] ??= "application/json";
    bodyStr = JSON.stringify(options.body);
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: bodyStr,
  });

  const rawText = await res.text();
  let data: T;
  try {
    data = JSON.parse(rawText) as T;
  } catch {
    throw new Error(
      `Expected JSON from ${options.method ?? "GET"} ${path} (HTTP ${res.status}), got: ${rawText.slice(0, 300)}`
    );
  }

  return {
    status: res.status,
    data,
    rawText,
    headers: res.headers,
    setCookies: getSetCookies(res.headers),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeLookupName(raw: string): string {
  return raw
    .trim()
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0))
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/[-_/,|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickTestDrugs(drugs: MasterDrugItem[]): {
  drug1: MasterDrugItem;
  drug2: MasterDrugItem;
  drug3: MasterDrugItem;
  drug4: MasterDrugItem;
} {
  const tsCounts = new Map<string, number>();
  const tCounts = new Map<string, number>();
  for (const d of drugs) {
    const tsKey = normalizeLookupName(`${d.tradeName} ${d.strength}`);
    const tKey = normalizeLookupName(d.tradeName);
    tsCounts.set(tsKey, (tsCounts.get(tsKey) ?? 0) + 1);
    tCounts.set(tKey, (tCounts.get(tKey) ?? 0) + 1);
  }

  const byMfr = new Map<string, MasterDrugItem[]>();
  for (const d of drugs) {
    const list = byMfr.get(d.manufacturer) ?? [];
    list.push(d);
    byMfr.set(d.manufacturer, list);
  }

  let sharedPair: [MasterDrugItem, MasterDrugItem] | null = null;
  for (const group of byMfr.values()) {
    if (group.length < 2) continue;
    const unambiguousForImport = group.filter(
      (d) =>
        tsCounts.get(normalizeLookupName(`${d.tradeName} ${d.strength}`)) === 1
    );
    if (unambiguousForImport.length >= 2) {
      sharedPair = [unambiguousForImport[0], unambiguousForImport[1]];
      break;
    }
    if (unambiguousForImport.length === 1) {
      const other = group.find((d) => d.id !== unambiguousForImport[0].id);
      if (other) {
        sharedPair = [other, unambiguousForImport[0]];
        break;
      }
    }
  }

  assert.ok(
    sharedPair,
    "Need at least 2 active master drugs sharing a manufacturer (with unique import name)"
  );

  const [drug1, drug2] = sharedPair;
  const remaining = drugs.filter((d) => d.id !== drug1.id && d.id !== drug2.id);
  assert.ok(remaining.length >= 2, "Need at least 4 distinct active master drugs");

  const drug3 = remaining[0];
  const drug4 = remaining[1];
  assert.equal(new Set([drug1.id, drug2.id, drug3.id, drug4.id]).size, 4);
  return { drug1, drug2, drug3, drug4 };
}

async function warmCatalogCache(
  path: string,
  token: string,
  label: string
): Promise<CatalogBody> {
  const first = await requestJson<CatalogBody>(path, { token });
  assert.equal(first.status, 200, `${label} warm#1 expected 200`);
  // Wait briefly for fire-and-forget Redis cacheSet to complete.
  await sleep(350);
  const second = await requestJson<CatalogBody>(path, { token });
  assert.equal(second.status, 200, `${label} warm#2 expected 200`);
  assert.equal(
    second.data.meta.fromCache,
    true,
    `${label} expected Redis cache hit (fromCache=true)`
  );
  return second.data;
}

async function cleanupTestOrganizations(orgIds: string[]): Promise<void> {
  if (orgIds.length === 0) {
    return;
  }

  await db.transaction(async (tx) => {
    const orderRows = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(
        or(inArray(orders.pharmacyId, orgIds), inArray(orders.distributorId, orgIds))
      );
    const orderIds = orderRows.map((o) => o.id);

    const listingRows = await tx
      .select({ id: distributorListings.id })
      .from(distributorListings)
      .where(inArray(distributorListings.distributorId, orgIds));
    const listingIds = listingRows.map((l) => l.id);

    const itemConditions = [
      ...(orderIds.length > 0 ? [inArray(orderItems.orderId, orderIds)] : []),
      ...(listingIds.length > 0
        ? [inArray(orderItems.listingId, listingIds)]
        : []),
    ];
    if (itemConditions.length > 0) {
      await tx.delete(orderItems).where(or(...itemConditions));
    }

    await tx
      .delete(orders)
      .where(
        or(inArray(orders.pharmacyId, orgIds), inArray(orders.distributorId, orgIds))
      );

    const logConditions = [
      inArray(priceChangeLogs.distributorId, orgIds),
      ...(listingIds.length > 0
        ? [inArray(priceChangeLogs.listingId, listingIds)]
        : []),
    ];
    await tx.delete(priceChangeLogs).where(or(...logConditions));

    await tx
      .delete(distributorListings)
      .where(inArray(distributorListings.distributorId, orgIds));

    await tx
      .delete(distributorDrugAliases)
      .where(inArray(distributorDrugAliases.distributorId, orgIds));

    await tx
      .delete(priceAccessPermissions)
      .where(
        or(
          inArray(priceAccessPermissions.distributorId, orgIds),
          inArray(priceAccessPermissions.pharmacyId, orgIds)
        )
      );

    await tx
      .delete(pharmacyWatchlist)
      .where(
        or(
          inArray(pharmacyWatchlist.pharmacyId, orgIds),
          inArray(pharmacyWatchlist.preferredDistributorId, orgIds)
        )
      );

    await tx.delete(users).where(inArray(users.organizationId, orgIds));
    await tx.delete(organizations).where(inArray(organizations.id, orgIds));
  });
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const ts = Date.now();
  let passedSuites = 0;

  let testDistId: string | null = null;
  let testPharmId: string | null = null;
  let testPharmToken: string | null = null;
  let suites1To9Passed = false;

  const passSuite = (num: number, title: string): void => {
    passedSuites += 1;
    console.log(`PASS: Suite ${num} — ${title}`);
  };

  console.log(`Running Madad B2B comprehensive E2E test suite against ${BASE_URL}\n`);

  try {
    // =========================================================================
    // Suite 1 — Health, Routing & Error Handling
    // =========================================================================
    const pingRes = await requestJson<{ ok: boolean; service: string }>("/api/ping");
    assert.equal(pingRes.status, 200);
    assert.equal(pingRes.data.ok, true);
    assert.equal(pingRes.data.service, "madad-b2b");
    assert.ok(pingRes.headers.get("x-request-id"), "Expected X-Request-Id header");

    const healthRes = await requestJson<HealthBody>("/api/health");
    assert.equal(
      healthRes.status,
      200,
      `GET /api/health expected 200, got ${healthRes.status}: ${healthRes.rawText}`
    );
    assert.equal(healthRes.data.status, "ok");
    assert.equal(healthRes.data.db?.ok, true);
    assert.equal(healthRes.data.redis?.ok, true);

    const notFoundRes = await requestJson<ErrorBody>("/api/non-existent-route");
    assert.equal(notFoundRes.status, 404);
    assert.equal(notFoundRes.data.error?.code, "NOT_FOUND");

    const badJsonRes = await requestJson<ErrorBody>("/api/auth/login", {
      method: "POST",
      rawBody: "{not-valid-json",
    });
    assert.equal(badJsonRes.status, 400);
    assert.equal(badJsonRes.data.error?.code, "INVALID_JSON");
    passSuite(1, "Health, Routing & Error Handling");

    // =========================================================================
    // Suite 2 — Auth, Cookies, RBAC & Live Suspension Gate
    // =========================================================================
    const badCredsRes = await requestJson<ErrorBody>("/api/auth/login", {
      method: "POST",
      body: { email: "admin@madad.sd", password: "WrongPassword!" },
    });
    assert.equal(badCredsRes.status, 401);
    assert.equal(badCredsRes.data.error?.code, "INVALID_CREDENTIALS");

    const amalRes = await requestJson<ErrorBody>("/api/auth/login", {
      method: "POST",
      body: { email: "amal@madad.sd", password: "Pass123!" },
    });
    assert.equal(amalRes.status, 403);
    assert.equal(amalRes.data.error?.code, "ORG_NOT_VERIFIED");

    const unauthMeRes = await requestJson<ErrorBody>("/api/auth/me");
    assert.equal(unauthMeRes.status, 401);
    assert.equal(unauthMeRes.data.error?.code, "UNAUTHORIZED");

    const adminLogin = await requestJson<LoginBody>("/api/auth/login", {
      method: "POST",
      body: { email: "admin@madad.sd", password: "Admin123!" },
    });
    assert.equal(adminLogin.status, 200);
    assertAuthSetCookiePresent(adminLogin.setCookies, "admin login");
    assertNoPasswordHash(adminLogin.rawText, "admin login");
    const adminToken = adminLogin.data.token;
    assert.ok(adminToken);

    const fanarLogin = await requestJson<LoginBody>("/api/auth/login", {
      method: "POST",
      body: { email: "fanar@madad.sd", password: "Pass123!" },
    });
    assert.equal(fanarLogin.status, 200);
    assertAuthSetCookiePresent(fanarLogin.setCookies, "fanar login");
    assertNoPasswordHash(fanarLogin.rawText, "fanar login");
    const fanarToken = fanarLogin.data.token;
    const fanarOrgId = fanarLogin.data.organization!.id;

    const yolandLogin = await requestJson<LoginBody>("/api/auth/login", {
      method: "POST",
      body: { email: "yoland@madad.sd", password: "Pass123!" },
    });
    assert.equal(yolandLogin.status, 200);
    const yolandCookieVal = assertAuthSetCookiePresent(
      yolandLogin.setCookies,
      "yoland login"
    );
    assertNoPasswordHash(yolandLogin.rawText, "yoland login");
    const yolandToken = yolandLogin.data.token;

    const meBearerRes = await requestJson<MeBody>("/api/auth/me", {
      token: yolandToken,
    });
    assert.equal(meBearerRes.status, 200);
    assert.equal(meBearerRes.data.user.email, "yoland@madad.sd");
    assertNoPasswordHash(meBearerRes.rawText, "/api/auth/me Bearer");

    const meCookieRes = await requestJson<MeBody>("/api/auth/me", {
      headers: { Cookie: `${AUTH_COOKIE_NAME}=${yolandCookieVal}` },
    });
    assert.equal(meCookieRes.status, 200);
    assert.equal(meCookieRes.data.user.email, "yoland@madad.sd");

    const logoutRes = await requestJson<{ ok: boolean }>("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: `${AUTH_COOKIE_NAME}=${yolandCookieVal}` },
    });
    assert.equal(logoutRes.status, 200);
    assert.equal(logoutRes.data.ok, true);
    const logoutCookie = logoutRes.setCookies.find((c) =>
      c.includes(`${AUTH_COOKIE_NAME}=`)
    );
    assert.ok(logoutCookie, "POST /api/auth/logout must clear madad_token cookie");

    // RBAC boundaries
    assert.equal(
      (await requestJson<ErrorBody>("/api/admin/organizations", { token: yolandToken }))
        .status,
      403
    );
    assert.equal(
      (await requestJson<ErrorBody>("/api/distributor/listings", { token: yolandToken }))
        .status,
      403
    );
    assert.equal(
      (await requestJson<ErrorBody>("/api/catalog", { token: fanarToken })).status,
      403
    );
    assert.equal(
      (await requestJson<ErrorBody>("/api/watchlist", { token: fanarToken })).status,
      403
    );
    passSuite(2, "Auth, Cookies, RBAC & Live Suspension Gate");

    // =========================================================================
    // Suite 3 — Admin Onboarding, Verification Timestamp Preservation & Live Revocation
    // =========================================================================
    const pendingListRes = await requestJson<{ organizations: OrgSummary[] }>(
      "/api/admin/organizations?type=PHARMACY&status=PENDING",
      { token: adminToken }
    );
    assert.equal(pendingListRes.status, 200);
    assertNoPasswordHash(pendingListRes.rawText, "admin list organizations");
    assert.ok(
      pendingListRes.data.organizations.some(
        (org) => org.licenseNumber === "PHARM-OMD-103"
      ),
      "Expected Amal's pending pharmacy in pending pharmacies list"
    );

    const distEmail = `e2e.dist.${ts}@madad.sd`;
    const distLicense = `E2E-LIC-DIST-${ts}`;
    const createDistRes = await requestJson<{ organization: OrgSummary }>(
      "/api/admin/organizations",
      {
        method: "POST",
        token: adminToken,
        body: {
          name: `E2E-DIST-${ts}`,
          type: "DISTRIBUTOR",
          licenseNumber: distLicense,
          region: "Khartoum E2E",
          verificationStatus: "PENDING",
          orderExpiryMinutes: 60,
          user: {
            fullName: "E2E Distributor Admin",
            email: distEmail,
            password: TEMP_ORG_PASSWORD,
          },
        },
      }
    );
    assert.equal(createDistRes.status, 201);
    testDistId = createDistRes.data.organization.id;
    assert.equal(createDistRes.data.organization.verificationStatus, "PENDING");

    const pharmEmail = `e2e.pharm.${ts}@madad.sd`;
    const pharmLicense = `E2E-LIC-PHARM-${ts}`;
    const createPharmRes = await requestJson<{ organization: OrgSummary }>(
      "/api/admin/organizations",
      {
        method: "POST",
        token: adminToken,
        body: {
          name: `E2E-PHARM-${ts}`,
          type: "PHARMACY",
          licenseNumber: pharmLicense,
          region: "Omdurman E2E",
          verificationStatus: "PENDING",
          orderExpiryMinutes: 60,
          user: {
            fullName: "E2E Pharmacy Owner",
            email: pharmEmail,
            password: TEMP_ORG_PASSWORD,
          },
        },
      }
    );
    assert.equal(createPharmRes.status, 201);
    testPharmId = createPharmRes.data.organization.id;
    assert.equal(createPharmRes.data.organization.verificationStatus, "PENDING");

    const dupLicenseRes = await requestJson<ErrorBody>(
      "/api/admin/organizations",
      {
        method: "POST",
        token: adminToken,
        body: {
          name: `E2E-DUP-${ts}`,
          type: "DISTRIBUTOR",
          licenseNumber: distLicense,
          region: "Bahri E2E",
          verificationStatus: "PENDING",
          user: {
            fullName: "E2E Duplicate License",
            email: `e2e.dup.${ts}@madad.sd`,
            password: TEMP_ORG_PASSWORD,
          },
        },
      }
    );
    assert.equal(dupLicenseRes.status, 409);
    assert.equal(dupLicenseRes.data.error?.code, "CONFLICT");

    const pendingDistLogin = await requestJson<ErrorBody>("/api/auth/login", {
      method: "POST",
      body: { email: distEmail, password: TEMP_ORG_PASSWORD },
    });
    assert.equal(pendingDistLogin.status, 403);
    assert.equal(pendingDistLogin.data.error?.code, "ORG_NOT_VERIFIED");

    const pendingPharmLogin = await requestJson<ErrorBody>("/api/auth/login", {
      method: "POST",
      body: { email: pharmEmail, password: TEMP_ORG_PASSWORD },
    });
    assert.equal(pendingPharmLogin.status, 403);
    assert.equal(pendingPharmLogin.data.error?.code, "ORG_NOT_VERIFIED");

    const verifyDistRes = await requestJson<{ organization: OrgSummary }>(
      `/api/admin/organizations/${testDistId}/verify`,
      {
        method: "PATCH",
        token: adminToken,
        body: { verificationStatus: "VERIFIED" },
      }
    );
    assert.equal(verifyDistRes.status, 200);
    assert.ok(verifyDistRes.data.organization.verifiedAt);

    const verifyPharmRes1 = await requestJson<{ organization: OrgSummary }>(
      `/api/admin/organizations/${testPharmId}/verify`,
      {
        method: "PATCH",
        token: adminToken,
        body: { verificationStatus: "VERIFIED" },
      }
    );
    assert.equal(verifyPharmRes1.status, 200);
    const firstVerifiedAt = verifyPharmRes1.data.organization.verifiedAt;
    assert.ok(firstVerifiedAt, "verifiedAt must be set upon VERIFIED transition");

    const verifyPharmRes2 = await requestJson<{ organization: OrgSummary }>(
      `/api/admin/organizations/${testPharmId}/verify`,
      {
        method: "PATCH",
        token: adminToken,
        body: { verificationStatus: "VERIFIED" },
      }
    );
    assert.equal(verifyPharmRes2.status, 200);
    assert.equal(
      verifyPharmRes2.data.organization.verifiedAt,
      firstVerifiedAt,
      "Re-verifying an already verified org must preserve verifiedAt"
    );

    const testPharmLogin = await requestJson<LoginBody>("/api/auth/login", {
      method: "POST",
      body: { email: pharmEmail, password: TEMP_ORG_PASSWORD },
    });
    assert.equal(testPharmLogin.status, 200);
    testPharmToken = testPharmLogin.data.token;

    const suspendPharmRes = await requestJson<{ organization: OrgSummary }>(
      `/api/admin/organizations/${testPharmId}/verify`,
      {
        method: "PATCH",
        token: adminToken,
        body: { verificationStatus: "SUSPENDED" },
      }
    );
    assert.equal(suspendPharmRes.status, 200);

    const suspendedMeRes = await requestJson<ErrorBody>("/api/auth/me", {
      token: testPharmToken,
    });
    assert.equal(suspendedMeRes.status, 403);
    assert.equal(suspendedMeRes.data.error?.code, "ORG_NOT_VERIFIED");

    const restorePharmRes = await requestJson<{ organization: OrgSummary }>(
      `/api/admin/organizations/${testPharmId}/verify`,
      {
        method: "PATCH",
        token: adminToken,
        body: { verificationStatus: "VERIFIED" },
      }
    );
    assert.equal(restorePharmRes.status, 200);
    assert.equal(
      (await requestJson<MeBody>("/api/auth/me", { token: testPharmToken })).status,
      200
    );

    const testDistLogin = await requestJson<LoginBody>("/api/auth/login", {
      method: "POST",
      body: { email: distEmail, password: TEMP_ORG_PASSWORD },
    });
    assert.equal(testDistLogin.status, 200);
    const testDistToken = testDistLogin.data.token;
    passSuite(3, "Admin Onboarding, Verification Timestamp Preservation & Live Revocation");

    // =========================================================================
    // Suite 4 — Master Drugs, Listings CRUD, Price Clamping & IDOR
    // =========================================================================
    const mfrRes = await requestJson<{ manufacturers: string[] }>(
      "/api/catalog/manufacturers",
      { token: testDistToken }
    );
    assert.equal(mfrRes.status, 200);
    assert.ok(mfrRes.data.manufacturers.length >= 3);

    const masterDrugsRes = await requestJson<{ drugs: MasterDrugItem[] }>(
      "/api/catalog/master-drugs",
      { token: testDistToken }
    );
    assert.equal(masterDrugsRes.status, 200);
    assert.ok(masterDrugsRes.data.drugs.length >= 10);

    const { drug1, drug2, drug3, drug4 } = pickTestDrugs(masterDrugsRes.data.drugs);

    const createListing1Res = await requestJson<{ listing: DistributorListingItem }>(
      "/api/distributor/listings",
      {
        method: "POST",
        token: testDistToken,
        body: {
          drugId: drug1.id,
          wholesalePriceSdg: 10000,
          isAvailable: true,
        },
      }
    );
    assert.equal(createListing1Res.status, 201);
    const listing1Id = createListing1Res.data.listing.id;
    assert.equal(createListing1Res.data.listing.priceVersion, 1);

    const dupListingRes = await requestJson<ErrorBody>("/api/distributor/listings", {
      method: "POST",
      token: testDistToken,
      body: { drugId: drug1.id, wholesalePriceSdg: 12000, isAvailable: true },
    });
    assert.equal(dupListingRes.status, 409);
    assert.equal(dupListingRes.data.error?.code, "CONFLICT");

    const toggleOffRes = await requestJson<{ listing: DistributorListingItem }>(
      `/api/distributor/listings/${listing1Id}`,
      {
        method: "PATCH",
        token: testDistToken,
        body: { isAvailable: false },
      }
    );
    assert.equal(toggleOffRes.status, 200);
    assert.equal(toggleOffRes.data.listing.isAvailable, false);
    assert.equal(toggleOffRes.data.listing.priceVersion, 1);

    const emptyLogsRes = await requestJson<{ logs: PriceLogItem[] }>(
      "/api/distributor/price-logs",
      { token: testDistToken }
    );
    assert.equal(emptyLogsRes.status, 200);
    assert.equal(emptyLogsRes.data.logs.length, 0);

    const set10Res = await requestJson<{ listing: DistributorListingItem }>(
      `/api/distributor/listings/${listing1Id}`,
      {
        method: "PATCH",
        token: testDistToken,
        body: { isAvailable: true, wholesalePriceSdg: 10 },
      }
    );
    assert.equal(set10Res.status, 200);
    assert.equal(set10Res.data.listing.isAvailable, true);
    assert.equal(set10Res.data.listing.priceVersion, 2);

    const clampJumpRes = await requestJson<{ listing: DistributorListingItem }>(
      `/api/distributor/listings/${listing1Id}`,
      {
        method: "PATCH",
        token: testDistToken,
        body: { wholesalePriceSdg: 200000 },
      }
    );
    assert.equal(clampJumpRes.status, 200);
    assert.equal(clampJumpRes.data.listing.priceVersion, 3);

    const clampedLogsRes = await requestJson<{ logs: PriceLogItem[] }>(
      "/api/distributor/price-logs",
      { token: testDistToken }
    );
    assert.equal(clampedLogsRes.status, 200);
    assert.equal(clampedLogsRes.data.logs[0]?.percentChange, "9999.99");

    const restorePriceRes = await requestJson<{ listing: DistributorListingItem }>(
      `/api/distributor/listings/${listing1Id}`,
      {
        method: "PATCH",
        token: testDistToken,
        body: { wholesalePriceSdg: 10000 },
      }
    );
    assert.equal(restorePriceRes.status, 200);
    assert.equal(restorePriceRes.data.listing.priceVersion, 4);

    const idorPatchListingRes = await requestJson<ErrorBody>(
      `/api/distributor/listings/${listing1Id}`,
      {
        method: "PATCH",
        token: fanarToken,
        body: { wholesalePriceSdg: 9999 },
      }
    );
    assert.equal(idorPatchListingRes.status, 403);
    assert.equal(idorPatchListingRes.data.error?.code, "FORBIDDEN");
    passSuite(4, "Master Drugs, Listings CRUD, Price Clamping & IDOR");

    // =========================================================================
    // Suite 5 — Bulk Import (BOM, Arabic Digits, Partial Failure, Deduplication) & Aliases
    // =========================================================================
    const bulkCsv = [
      "\uFEFFالصنف,السعر,التوفر",
      `${drug2.tradeName} ${drug2.strength},"١٢,٥٠٠ جنيه سوداني",متوفر`,
      `${drug2.tradeName} ${drug2.strength},"١٣,٠٠٠ ج.س",نعم`,
      "صنف أمدرمان التجريبي ١٠٠,18000,متوفر",
      "دواء كسري,12.5,متوفر",
      "دواء برقم هاتف,09123456789,متوفر",
    ].join("\n");

    const bulkImportRes = await requestJson<BulkImportBody>(
      "/api/distributor/listings/bulk-import",
      {
        method: "POST",
        token: testDistToken,
        body: { text: bulkCsv },
      }
    );
    assert.equal(bulkImportRes.status, 200);
    assert.equal(bulkImportRes.data.totalRows, 5);
    assert.equal(bulkImportRes.data.createdCount, 1);
    assert.equal(bulkImportRes.data.updatedCount, 0);
    assert.equal(bulkImportRes.data.unmappedCount, 1);
    assert.equal(bulkImportRes.data.invalidCount, 2);
    assert.equal(
      bulkImportRes.data.unmappedRows[0]?.normalizedName,
      "صنف امدرمان التجريبي 100"
    );

    const afterBulkListings = await requestJson<{ listings: DistributorListingItem[] }>(
      "/api/distributor/listings",
      { token: testDistToken }
    );
    assert.equal(afterBulkListings.status, 200);
    const listing2 = afterBulkListings.data.listings.find(
      (l) => l.drugId === drug2.id
    );
    assert.ok(listing2, "Expected imported listing for drug2");
    assert.equal(listing2.wholesalePriceSdg, 13000);

    const aliasRes = await requestJson<{
      alias: AliasRecord;
      listing: DistributorListingItem | null;
    }>("/api/distributor/aliases", {
      method: "POST",
      token: testDistToken,
      body: {
        rawName: "صنف أمدرمان التجريبي ١٠٠",
        masterDrugId: drug3.id,
        wholesalePriceSdg: 18000,
      },
    });
    assert.equal(aliasRes.status, 201);
    assert.equal(aliasRes.data.alias.rawNameNormalized, "صنف امدرمان التجريبي 100");
    assert.equal(aliasRes.data.alias.masterDrugId, drug3.id);
    assert.ok(aliasRes.data.listing);
    assert.equal(aliasRes.data.listing.wholesalePriceSdg, 18000);
    const listing3Id = aliasRes.data.listing.id;

    const aliasesListRes = await requestJson<{ aliases: AliasRecord[] }>(
      "/api/distributor/aliases",
      { token: testDistToken }
    );
    assert.equal(aliasesListRes.status, 200);
    assert.ok(
      aliasesListRes.data.aliases.some(
        (a) =>
          a.rawNameNormalized === "صنف امدرمان التجريبي 100" &&
          a.masterDrugId === drug3.id
      )
    );

    const reImportRes = await requestJson<BulkImportBody>(
      "/api/distributor/listings/bulk-import",
      {
        method: "POST",
        token: testDistToken,
        body: { text: "صنف امدرمان التجريبي 100\t19500\tمتوفر" },
      }
    );
    assert.equal(reImportRes.status, 200);
    assert.equal(reImportRes.data.unmappedCount, 0);
    assert.equal(reImportRes.data.updatedCount, 1);

    const listingsAfterReimport = await requestJson<{
      listings: DistributorListingItem[];
    }>("/api/distributor/listings", { token: testDistToken });
    const listing3 = listingsAfterReimport.data.listings.find(
      (l) => l.id === listing3Id
    );
    assert.ok(listing3);
    assert.equal(listing3.wholesalePriceSdg, 19500);
    assert.equal(listing3.priceVersion, 2);

    // Wait for async bulk-import catalog.invalidated listener to finish before Suite 6.
    await sleep(500);
    passSuite(5, "Bulk Import (BOM, Arabic Digits, Partial Failure, Deduplication) & Aliases");

    // =========================================================================
    // Suite 6 — Permissions State Machine, IDOR & Cross-Tenant Redis Cache Isolation
    // =========================================================================
    const distsListRes = await requestJson<{
      distributors: Array<{ id: string; permissionStatus: string }>;
    }>("/api/distributors", { token: testPharmToken });
    assert.equal(distsListRes.status, 200);
    const testDistSummary = distsListRes.data.distributors.find(
      (d) => d.id === testDistId
    );
    assert.ok(testDistSummary);
    assert.equal(testDistSummary.permissionStatus, "NONE");

    const distDetailRes = await requestJson<{
      permissionStatus: string;
      listings: Array<{ wholesalePriceSdg: number | null; priceLocked: boolean }>;
    }>(`/api/distributors/${testDistId}`, { token: testPharmToken });
    assert.equal(distDetailRes.status, 200);
    assert.equal(distDetailRes.data.permissionStatus, "NONE");
    assert.equal(distDetailRes.data.listings.length, 3);
    for (const l of distDetailRes.data.listings) {
      assert.equal(l.priceLocked, true);
      assert.equal(l.wholesalePriceSdg, null);
    }

    const yolandCatPath = "/api/catalog?sort=cheapest&limit=50";
    const testPharmCatPath = `/api/catalog?distributorId=${testDistId}&sort=cheapest`;

    await warmCatalogCache(yolandCatPath, yolandToken, "yoland pre-permission");
    const pharmLockedWarm = await warmCatalogCache(
      testPharmCatPath,
      testPharmToken,
      "testPharm locked"
    );
    for (const item of pharmLockedWarm.items) {
      assert.equal(item.priceLocked, true);
      assert.equal(item.wholesalePriceSdg, null);
    }

    const reqPerm1Res = await requestJson<{
      created: boolean;
      permission: PermissionRecord;
    }>("/api/permissions/request", {
      method: "POST",
      token: testPharmToken,
      body: { distributorId: testDistId },
    });
    assert.equal(reqPerm1Res.status, 201);
    assert.equal(reqPerm1Res.data.created, true);
    assert.equal(reqPerm1Res.data.permission.status, "PENDING");
    const permId = reqPerm1Res.data.permission.id;

    const reqPerm2Res = await requestJson<{
      created: boolean;
      permission: PermissionRecord;
    }>("/api/permissions/request", {
      method: "POST",
      token: testPharmToken,
      body: { distributorId: testDistId },
    });
    assert.equal(reqPerm2Res.status, 200);
    assert.equal(reqPerm2Res.data.created, false);
    assert.equal(reqPerm2Res.data.permission.id, permId);

    const newPharmsRes = await requestJson<{
      pharmacies: Array<{ id: string; permissionStatus: string }>;
    }>("/api/distributor/new-pharmacies", { token: testDistToken });
    assert.equal(newPharmsRes.status, 200);
    const matchingNewPharm = newPharmsRes.data.pharmacies.find(
      (p) => p.id === testPharmId
    );
    assert.ok(matchingNewPharm);
    assert.equal(matchingNewPharm.permissionStatus, "PENDING");

    const pendingPermsRes = await requestJson<{ permissions: PermissionRecord[] }>(
      "/api/permissions?status=PENDING",
      { token: testDistToken }
    );
    assert.equal(pendingPermsRes.status, 200);
    assert.ok(pendingPermsRes.data.permissions.some((p) => p.id === permId));

    const idorApprovePermRes = await requestJson<ErrorBody>(
      `/api/permissions/${permId}`,
      {
        method: "PATCH",
        token: fanarToken,
        body: { status: "APPROVED" },
      }
    );
    assert.equal(idorApprovePermRes.status, 403);
    assert.equal(idorApprovePermRes.data.error?.code, "FORBIDDEN");

    const approvePermRes = await requestJson<{ permission: PermissionRecord }>(
      `/api/permissions/${permId}`,
      {
        method: "PATCH",
        token: testDistToken,
        body: { status: "APPROVED" },
      }
    );
    assert.equal(approvePermRes.status, 200);
    assert.equal(approvePermRes.data.permission.status, "APPROVED");

    await sleep(500);

    const pharmUnlockedCat = await requestJson<CatalogBody>(testPharmCatPath, {
      token: testPharmToken,
    });
    assert.equal(pharmUnlockedCat.status, 200);
    assert.equal(pharmUnlockedCat.data.meta.fromCache, false);
    assert.ok(pharmUnlockedCat.data.items.length >= 3);
    for (const item of pharmUnlockedCat.data.items) {
      assert.equal(item.priceLocked, false);
      assert.ok(
        typeof item.wholesalePriceSdg === "number" &&
          Number.isInteger(item.wholesalePriceSdg) &&
          item.wholesalePriceSdg > 0
      );
    }

    const yolandIsolatedCat = await requestJson<CatalogBody>(yolandCatPath, {
      token: yolandToken,
    });
    assert.equal(yolandIsolatedCat.status, 200);
    assert.equal(
      yolandIsolatedCat.data.meta.fromCache,
      true,
      "Cross-tenant isolation violated: yoland cache was invalidated by testPharm permission change"
    );

    const revokePermRes = await requestJson<{ permission: PermissionRecord }>(
      `/api/permissions/${permId}`,
      {
        method: "PATCH",
        token: testDistToken,
        body: { status: "REVOKED" },
      }
    );
    assert.equal(revokePermRes.status, 200);
    assert.equal(revokePermRes.data.permission.status, "REVOKED");

    await sleep(500);

    const pharmRevokedCat = await requestJson<CatalogBody>(testPharmCatPath, {
      token: testPharmToken,
    });
    assert.equal(pharmRevokedCat.status, 200);
    for (const item of pharmRevokedCat.data.items) {
      assert.equal(item.priceLocked, true);
      assert.equal(item.wholesalePriceSdg, null);
    }

    const reRequestPermRes = await requestJson<{
      created: boolean;
      permission: PermissionRecord;
    }>("/api/permissions/request", {
      method: "POST",
      token: testPharmToken,
      body: { distributorId: testDistId },
    });
    assert.equal(reRequestPermRes.status, 200);
    assert.equal(reRequestPermRes.data.permission.status, "PENDING");

    const reApproveRes = await requestJson<{ permission: PermissionRecord }>(
      `/api/permissions/${permId}`,
      {
        method: "PATCH",
        token: testDistToken,
        body: { status: "APPROVED" },
      }
    );
    assert.equal(reApproveRes.status, 200);
    assert.equal(reApproveRes.data.permission.status, "APPROVED");
    await sleep(500);
    passSuite(6, "Permissions State Machine, IDOR & Cross-Tenant Redis Cache Isolation");

    // =========================================================================
    // Suite 7 — ACID Bulk Percentage Pricing & Global Cache Invalidation
    // =========================================================================
    const pharmCatPreBulk = await warmCatalogCache(
      testPharmCatPath,
      testPharmToken,
      "testPharm pre-bulk-percent"
    );
    const verBefore = pharmCatPreBulk.meta.catalogVersion;

    const bulkPercentRes = await requestJson<{
      updatedCount: number;
      updatedListings: DistributorListingItem[];
    }>("/api/distributor/pricing/bulk-percent", {
      method: "POST",
      token: testDistToken,
      body: { manufacturer: drug1.manufacturer, percentChange: 10 },
    });
    assert.equal(bulkPercentRes.status, 200);
    assert.ok(bulkPercentRes.data.updatedCount >= 1);
    for (const updated of bulkPercentRes.data.updatedListings) {
      assert.ok(
        Number.isInteger(updated.wholesalePriceSdg) && updated.wholesalePriceSdg > 0
      );
      assert.ok(updated.priceVersion >= 2);
    }

    await sleep(500);

    const pharmCatPostBulk = await requestJson<CatalogBody>(testPharmCatPath, {
      token: testPharmToken,
    });
    assert.equal(pharmCatPostBulk.status, 200);
    assert.equal(pharmCatPostBulk.data.meta.fromCache, false);
    assert.ok(
      pharmCatPostBulk.data.meta.catalogVersion > verBefore,
      `Expected catalogVersion > ${verBefore}, got ${pharmCatPostBulk.data.meta.catalogVersion}`
    );
    passSuite(7, "ACID Bulk Percentage Pricing & Global Cache Invalidation");

    // =========================================================================
    // Suite 8 — Watchlist Radar, Margin Calc, Alerts, IDOR & Acknowledge
    // =========================================================================
    const createWatchRes = await requestJson<{ item: WatchlistItem }>(
      "/api/watchlist",
      {
        method: "POST",
        token: testPharmToken,
        body: {
          drugId: drug1.id,
          pricingPolicy: "PREFERRED_DISTRIBUTOR",
          preferredDistributorId: testDistId,
          profitMarginPercent: 25,
        },
      }
    );
    assert.equal(createWatchRes.status, 201);
    const watchId = createWatchRes.data.item.id;

    const dupWatchRes = await requestJson<ErrorBody>("/api/watchlist", {
      method: "POST",
      token: testPharmToken,
      body: {
        drugId: drug1.id,
        pricingPolicy: "PREFERRED_DISTRIBUTOR",
        preferredDistributorId: testDistId,
        profitMarginPercent: 25,
      },
    });
    assert.equal(dupWatchRes.status, 409);
    assert.equal(dupWatchRes.data.error?.code, "CONFLICT");

    const currentListing1 = pharmCatPostBulk.data.items.find(
      (i) => i.listingId === listing1Id
    );
    assert.ok(currentListing1?.wholesalePriceSdg);
    const boostedPrice = Math.round(currentListing1.wholesalePriceSdg * 1.2);

    const bumpWatchListingRes = await requestJson<{
      listing: DistributorListingItem;
    }>(`/api/distributor/listings/${listing1Id}`, {
      method: "PATCH",
      token: testDistToken,
      body: { wholesalePriceSdg: boostedPrice },
    });
    assert.equal(bumpWatchListingRes.status, 200);

    const watchList1Res = await requestJson<{
      items: WatchlistItem[];
      alertsCount: number;
    }>("/api/watchlist", { token: testPharmToken });
    assert.equal(watchList1Res.status, 200);
    assert.equal(watchList1Res.data.alertsCount, 1);
    const watchedEntry = watchList1Res.data.items.find((i) => i.id === watchId);
    assert.ok(watchedEntry);
    assert.equal(watchedEntry.hasPriceIncrease, true);
    assert.equal(watchedEntry.effectiveWholesaleSdg, boostedPrice);
    assert.equal(
      watchedEntry.suggestedShelfPriceSdg,
      Math.round(boostedPrice * 1.25)
    );

    const alertsRes = await requestJson<{ alerts: PriceLogItem[] }>(
      "/api/watchlist/price-alerts?watchedOnly=true",
      { token: testPharmToken }
    );
    assert.equal(alertsRes.status, 200);
    assert.ok(
      alertsRes.data.alerts.some(
        (a) =>
          a.distributorId === testDistId &&
          a.drugId === drug1.id &&
          a.newPriceSdg === boostedPrice
      )
    );

    assert.equal(
      (
        await requestJson<ErrorBody>(`/api/watchlist/${watchId}`, {
          method: "PATCH",
          token: yolandToken,
          body: { profitMarginPercent: 30 },
        })
      ).status,
      403
    );
    assert.equal(
      (
        await requestJson<ErrorBody>(`/api/watchlist/${watchId}`, {
          method: "DELETE",
          token: yolandToken,
        })
      ).status,
      403
    );

    const switchPolicyRes = await requestJson<{ item: WatchlistItem }>(
      `/api/watchlist/${watchId}`,
      {
        method: "PATCH",
        token: testPharmToken,
        body: { pricingPolicy: "HIGHEST_AUTHORIZED" },
      }
    );
    assert.equal(switchPolicyRes.status, 200);
    assert.equal(switchPolicyRes.data.item.preferredDistributorId, null);

    const ackWatchRes = await requestJson<{ item: WatchlistItem }>(
      `/api/watchlist/${watchId}/acknowledge`,
      {
        method: "POST",
        token: testPharmToken,
        body: {},
      }
    );
    assert.equal(ackWatchRes.status, 200);
    assert.equal(ackWatchRes.data.item.hasPriceIncrease, false);

    const watchListAfterAck = await requestJson<{
      items: WatchlistItem[];
      alertsCount: number;
    }>("/api/watchlist", { token: testPharmToken });
    assert.equal(watchListAfterAck.status, 200);
    assert.equal(watchListAfterAck.data.alertsCount, 0);

    const deleteWatchRes = await requestJson<{ ok: boolean; id: string }>(
      `/api/watchlist/${watchId}`,
      {
        method: "DELETE",
        token: testPharmToken,
      }
    );
    assert.equal(deleteWatchRes.status, 200);
    assert.equal(deleteWatchRes.data.ok, true);
    passSuite(8, "Watchlist Radar, Margin Calc, Alerts, IDOR & Acknowledge");

    // =========================================================================
    // Suite 9 — Orders Lifecycle (Idempotency, Concurrency, Confirm, Cancel, Pause, Expiry)
    // =========================================================================
    const createListing4Res = await requestJson<{ listing: DistributorListingItem }>(
      "/api/distributor/listings",
      {
        method: "POST",
        token: testDistToken,
        body: {
          drugId: drug4.id,
          wholesalePriceSdg: 5000,
          isAvailable: true,
        },
      }
    );
    assert.equal(createListing4Res.status, 201);
    const listing4 = createListing4Res.data.listing;
    await sleep(300);

    const latestCatRes = await requestJson<CatalogBody>(testPharmCatPath, {
      token: testPharmToken,
    });
    assert.equal(latestCatRes.status, 200);
    const catListing1 = latestCatRes.data.items.find(
      (i) => i.listingId === listing1Id
    )!;
    const catListing3 = latestCatRes.data.items.find(
      (i) => i.listingId === listing3Id
    )!;
    assert.ok(catListing1.wholesalePriceSdg);

    const fanarMaskedRes = await requestJson<CatalogBody>(
      `/api/catalog?distributorId=${fanarOrgId}&limit=5`,
      { token: testPharmToken }
    );
    assert.equal(fanarMaskedRes.status, 200);
    const fanarListing = fanarMaskedRes.data.items[0];
    assert.ok(fanarListing);

    const missingIdemRes = await requestJson<ErrorBody>("/api/orders", {
      method: "POST",
      token: testPharmToken,
      body: {
        distributorId: testDistId,
        items: [
          {
            listingId: catListing1.listingId,
            quantity: 1,
            expectedPriceVersion: catListing1.priceVersion,
          },
        ],
      },
    });
    assert.equal(missingIdemRes.status, 400);
    assert.equal(missingIdemRes.data.error?.code, "MISSING_IDEMPOTENCY_KEY");

    const unauthDistOrderRes = await requestJson<ErrorBody>("/api/orders", {
      method: "POST",
      token: testPharmToken,
      headers: { "Idempotency-Key": `e2e-unauth-${ts}` },
      body: {
        distributorId: fanarOrgId,
        items: [
          {
            listingId: fanarListing.listingId,
            quantity: 1,
            expectedPriceVersion: fanarListing.priceVersion,
          },
        ],
      },
    });
    assert.equal(unauthDistOrderRes.status, 403);
    assert.equal(unauthDistOrderRes.data.error?.code, "PRICE_ACCESS_REQUIRED");

    // Mark drug3 temporarily unavailable -> 409 ITEM_UNAVAILABLE -> restore
    assert.equal(
      (
        await requestJson(`/api/distributor/listings/${listing3Id}`, {
          method: "PATCH",
          token: testDistToken,
          body: { isAvailable: false },
        })
      ).status,
      200
    );
    const unavailOrderRes = await requestJson<ErrorBody>("/api/orders", {
      method: "POST",
      token: testPharmToken,
      headers: { "Idempotency-Key": `e2e-unavail-${ts}` },
      body: {
        distributorId: testDistId,
        items: [
          {
            listingId: listing3Id,
            quantity: 1,
            expectedPriceVersion: catListing3.priceVersion,
          },
        ],
      },
    });
    assert.equal(unavailOrderRes.status, 409);
    assert.equal(unavailOrderRes.data.error?.code, "ITEM_UNAVAILABLE");

    assert.equal(
      (
        await requestJson(`/api/distributor/listings/${listing3Id}`, {
          method: "PATCH",
          token: testDistToken,
          body: { isAvailable: true },
        })
      ).status,
      200
    );

    // Stale expectedPriceVersion -> 409 PRICE_VERSION_CONFLICT
    const staleVersion =
      catListing1.priceVersion === 1 ? 999 : catListing1.priceVersion - 1;
    const staleOrderRes = await requestJson<ErrorBody>("/api/orders", {
      method: "POST",
      token: testPharmToken,
      headers: { "Idempotency-Key": `e2e-stale-${ts}` },
      body: {
        distributorId: testDistId,
        items: [
          {
            listingId: catListing1.listingId,
            quantity: 1,
            expectedPriceVersion: staleVersion,
          },
        ],
      },
    });
    assert.equal(staleOrderRes.status, 409);
    assert.equal(staleOrderRes.data.error?.code, "PRICE_VERSION_CONFLICT");
    assert.equal(
      staleOrderRes.data.error?.details?.conflicts?.[0]?.currentPriceVersion,
      catListing1.priceVersion
    );
    assert.equal(
      staleOrderRes.data.error?.details?.conflicts?.[0]?.currentWholesalePriceSdg,
      catListing1.wholesalePriceSdg
    );

    // Valid multi-item order + idempotent replay + cross-tenant conflict
    const idemKey1 = `e2e-order1-${ts}`;
    const order1Payload = {
      distributorId: testDistId,
      items: [
        {
          listingId: catListing1.listingId,
          quantity: 2,
          expectedPriceVersion: catListing1.priceVersion,
        },
        {
          listingId: listing4.id,
          quantity: 3,
          expectedPriceVersion: listing4.priceVersion,
        },
      ],
    };

    const createOrder1Res = await requestJson<{
      idempotentReplay: boolean;
      order: OrderRecord;
      items: Array<{ id: string }>;
    }>("/api/orders", {
      method: "POST",
      token: testPharmToken,
      headers: { "Idempotency-Key": idemKey1 },
      body: order1Payload,
    });
    assert.equal(createOrder1Res.status, 201);
    assert.equal(createOrder1Res.data.idempotentReplay, false);
    assert.equal(createOrder1Res.data.order.status, "PENDING_CONFIRMATION");
    assert.equal(
      createOrder1Res.data.order.totalSdg,
      2 * catListing1.wholesalePriceSdg + 3 * listing4.wholesalePriceSdg
    );
    const order1Id = createOrder1Res.data.order.id;

    const replayOrder1Res = await requestJson<{
      idempotentReplay: boolean;
      order: OrderRecord;
    }>("/api/orders", {
      method: "POST",
      token: testPharmToken,
      headers: { "Idempotency-Key": idemKey1 },
      body: order1Payload,
    });
    assert.equal(replayOrder1Res.status, 200);
    assert.equal(replayOrder1Res.data.idempotentReplay, true);
    assert.equal(replayOrder1Res.data.order.id, order1Id);

    const crossTenantIdemRes = await requestJson<ErrorBody>("/api/orders", {
      method: "POST",
      token: yolandToken,
      headers: { "Idempotency-Key": idemKey1 },
      body: order1Payload,
    });
    assert.equal(crossTenantIdemRes.status, 409);
    assert.equal(crossTenantIdemRes.data.error?.code, "IDEMPOTENCY_KEY_CONFLICT");

    const pharmOrdersRes = await requestJson<{ orders: OrderRecord[] }>(
      "/api/orders",
      { token: testPharmToken }
    );
    assert.equal(pharmOrdersRes.status, 200);
    const pharmOrder1 = pharmOrdersRes.data.orders.find((o) => o.id === order1Id);
    assert.ok(pharmOrder1);
    assert.equal(pharmOrder1.items?.length, 2);
    assert.equal(pharmOrder1.counterparty?.id, testDistId);

    const distOrdersRes = await requestJson<{ orders: OrderRecord[] }>(
      "/api/orders",
      { token: testDistToken }
    );
    assert.equal(distOrdersRes.status, 200);
    const distOrder1 = distOrdersRes.data.orders.find((o) => o.id === order1Id);
    assert.ok(distOrder1);
    assert.equal(distOrder1.items?.length, 2);
    assert.equal(distOrder1.counterparty?.id, testPharmId);

    // Confirm RBAC / IDOR guards
    assert.equal(
      (
        await requestJson<ErrorBody>(`/api/orders/${order1Id}/confirm`, {
          method: "PATCH",
          token: fanarToken,
        })
      ).status,
      403
    );
    assert.equal(
      (
        await requestJson<ErrorBody>(`/api/orders/${order1Id}/confirm`, {
          method: "PATCH",
          token: testPharmToken,
        })
      ).status,
      403
    );

    const confirmOrder1Res = await requestJson<{ order: OrderRecord }>(
      `/api/orders/${order1Id}/confirm`,
      { method: "PATCH", token: testDistToken }
    );
    assert.equal(confirmOrder1Res.status, 200);
    assert.equal(confirmOrder1Res.data.order.status, "CONFIRMED");

    const cancelConfirmedRes = await requestJson<ErrorBody>(
      `/api/orders/${order1Id}/cancel`,
      { method: "PATCH", token: testPharmToken }
    );
    assert.equal(cancelConfirmedRes.status, 409);
    assert.equal(cancelConfirmedRes.data.error?.code, "INVALID_ORDER_STATE");

    // Cancel pending order2
    const createOrder2Res = await requestJson<{ order: OrderRecord }>(
      "/api/orders",
      {
        method: "POST",
        token: testPharmToken,
        headers: { "Idempotency-Key": `e2e-order2-${ts}` },
        body: {
          distributorId: testDistId,
          items: [
            {
              listingId: catListing1.listingId,
              quantity: 1,
              expectedPriceVersion: catListing1.priceVersion,
            },
          ],
        },
      }
    );
    assert.equal(createOrder2Res.status, 201);
    const cancelOrder2Res = await requestJson<{ order: OrderRecord }>(
      `/api/orders/${createOrder2Res.data.order.id}/cancel`,
      { method: "PATCH", token: testPharmToken }
    );
    assert.equal(cancelOrder2Res.status, 200);
    assert.equal(cancelOrder2Res.data.order.status, "CANCELLED");

    // Live Commit-Before-Throw Expiry
    const createOrder3Res = await requestJson<{ order: OrderRecord }>(
      "/api/orders",
      {
        method: "POST",
        token: testPharmToken,
        headers: { "Idempotency-Key": `e2e-order3-${ts}` },
        body: {
          distributorId: testDistId,
          items: [
            {
              listingId: catListing1.listingId,
              quantity: 1,
              expectedPriceVersion: catListing1.priceVersion,
            },
          ],
        },
      }
    );
    assert.equal(createOrder3Res.status, 201);
    const order3Id = createOrder3Res.data.order.id;

    await db
      .update(orders)
      .set({ expiresAt: new Date(Date.now() - 120_000) })
      .where(eq(orders.id, order3Id));

    const expiredConfirmRes = await requestJson<ErrorBody>(
      `/api/orders/${order3Id}/confirm`,
      { method: "PATCH", token: testDistToken }
    );
    assert.equal(expiredConfirmRes.status, 409);
    assert.equal(expiredConfirmRes.data.error?.code, "ORDER_EXPIRED");

    const expiredListRes = await requestJson<{ orders: OrderRecord[] }>(
      "/api/orders?status=EXPIRED_CANCELLED",
      { token: testPharmToken }
    );
    assert.equal(expiredListRes.status, 200);
    assert.ok(
      expiredListRes.data.orders.some(
        (o) => o.id === order3Id && o.status === "EXPIRED_CANCELLED"
      ),
      "Expired order must be committed as EXPIRED_CANCELLED in PostgreSQL"
    );

    // Sales Pause Guard
    const pauseDistRes = await requestJson<{ organization: OrgSummary }>(
      "/api/distributor/status",
      {
        method: "PATCH",
        token: testDistToken,
        body: { salesStatus: "PAUSED_REPRICING" },
      }
    );
    assert.equal(pauseDistRes.status, 200);
    assert.equal(pauseDistRes.data.organization.salesStatus, "PAUSED_REPRICING");

    const pausedOrderRes = await requestJson<ErrorBody>("/api/orders", {
      method: "POST",
      token: testPharmToken,
      headers: { "Idempotency-Key": `e2e-paused-${ts}` },
      body: {
        distributorId: testDistId,
        items: [
          {
            listingId: catListing1.listingId,
            quantity: 1,
            expectedPriceVersion: catListing1.priceVersion,
          },
        ],
      },
    });
    assert.equal(pausedOrderRes.status, 409);
    assert.equal(pausedOrderRes.data.error?.code, "DISTRIBUTOR_PAUSED");

    const reopenDistRes = await requestJson<{ organization: OrgSummary }>(
      "/api/distributor/status",
      {
        method: "PATCH",
        token: testDistToken,
        body: { salesStatus: "OPEN" },
      }
    );
    assert.equal(reopenDistRes.status, 200);
    assert.equal(reopenDistRes.data.organization.salesStatus, "OPEN");
    passSuite(
      9,
      "Orders Lifecycle (Idempotency, Concurrency 409, Confirm, Cancel, Sales Pause, Commit-Before-Throw)"
    );

    suites1To9Passed = true;
  } finally {
    const tempOrgIds = [testDistId, testPharmId].filter(
      (id): id is string => id !== null
    );

    try {
      await cleanupTestOrganizations(tempOrgIds);

      if (suites1To9Passed) {
        if (tempOrgIds.length > 0) {
          const remaining = await db
            .select({ id: organizations.id })
            .from(organizations)
            .where(inArray(organizations.id, tempOrgIds));
          assert.equal(
            remaining.length,
            0,
            "Temporary test organizations must be completely removed from PostgreSQL"
          );
        }

        if (testPharmToken) {
          const postCleanupMe = await requestJson<ErrorBody>("/api/auth/me", {
            token: testPharmToken,
          });
          assert.equal(
            postCleanupMe.status,
            401,
            "Deleted test pharmacy token must fail /api/auth/me with 401"
          );
        }

        passSuite(10, "Post-Cleanup Verification");
        const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
        console.log(
          `\nSummary: ${passedSuites}/10 E2E suites passed in ${elapsedSeconds}s (seed data clean).`
        );
      }
    } finally {
      await pool.end();
    }
  }
}

main().catch((err) => {
  console.error("\nLive E2E suite failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
