import assert from "node:assert/strict";

const BASE_URL = (process.env.API_URL ?? "http://localhost:4000").replace(
  /\/+$/,
  ""
);

interface ApiResponse<T = unknown> {
  status: number;
  data: T;
  rawText: string;
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

interface LoginBody {
  token: string;
  user: { id: string; email: string; role: string };
  organization: { id: string; name: string; type: string } | null;
}

interface CatalogItem {
  listingId: string;
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

interface WatchlistBody {
  items: unknown[];
  alertsCount: number;
}

interface BulkPercentBody {
  updatedCount: number;
  updatedListings: Array<{
    id: string;
    wholesalePriceSdg: number;
    priceVersion: number;
  }>;
}

interface OrderBody {
  idempotentReplay: boolean;
  order: {
    id: string;
    status: string;
    totalSdg: number;
  };
}

interface StatusUpdateBody {
  organization: {
    id: string;
    salesStatus: string;
  };
}

async function requestJson<T>(
  path: string,
  options: {
    method?: string;
    token?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let bodyStr: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
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

  return { status: res.status, data, rawText };
}

function logPass(step: string): void {
  console.log(`PASS: ${step}`);
}

async function main(): Promise<void> {
  console.log(`Running Madad B2B live E2E smoke test against ${BASE_URL}\n`);

  let fanarToken: string | null = null;
  let restoreFailed = false;

  try {
    // 1. Health check
    const health = await requestJson<HealthBody>("/api/health");
    assert.equal(
      health.status,
      200,
      `GET /api/health expected 200, got ${health.status}: ${health.rawText}`
    );
    assert.equal(health.data.status, "ok", "health.status must be 'ok'");
    assert.equal(health.data.db?.ok, true, "health.db.ok must be true");
    assert.equal(health.data.redis?.ok, true, "health.redis.ok must be true");
    logPass("1. GET /api/health (ok, db=true, redis=true)");

    // 2. Auth & verification gate
    const amalLogin = await requestJson<ErrorBody>("/api/auth/login", {
      method: "POST",
      body: { email: "amal@madad.sd", password: "Pass123!" },
    });
    assert.equal(
      amalLogin.status,
      403,
      `Pending org login expected 403, got ${amalLogin.status}: ${amalLogin.rawText}`
    );
    assert.equal(
      amalLogin.data.error?.code,
      "ORG_NOT_VERIFIED",
      "Pending org error code must be ORG_NOT_VERIFIED"
    );

    const yolandLogin = await requestJson<LoginBody>("/api/auth/login", {
      method: "POST",
      body: { email: "yoland@madad.sd", password: "Pass123!" },
    });
    assert.equal(
      yolandLogin.status,
      200,
      `Yoland login expected 200, got ${yolandLogin.status}: ${yolandLogin.rawText}`
    );
    assert.ok(yolandLogin.data.token, "Yoland token must be present");
    const yolandToken = yolandLogin.data.token;

    const roaLogin = await requestJson<LoginBody>("/api/auth/login", {
      method: "POST",
      body: { email: "roa@madad.sd", password: "Pass123!" },
    });
    assert.equal(
      roaLogin.status,
      200,
      `Roa login expected 200, got ${roaLogin.status}: ${roaLogin.rawText}`
    );
    assert.ok(roaLogin.data.token, "Roa token must be present");
    const roaToken = roaLogin.data.token;

    const fanarLogin = await requestJson<LoginBody>("/api/auth/login", {
      method: "POST",
      body: { email: "fanar@madad.sd", password: "Pass123!" },
    });
    assert.equal(
      fanarLogin.status,
      200,
      `Fanar login expected 200, got ${fanarLogin.status}: ${fanarLogin.rawText}`
    );
    assert.ok(fanarLogin.data.token, "Fanar token must be present");
    assert.ok(fanarLogin.data.organization?.id, "Fanar organization ID required");
    fanarToken = fanarLogin.data.token;
    const fanarOrgId = fanarLogin.data.organization.id;
    logPass("2. POST /api/auth/login (403 ORG_NOT_VERIFIED + 3 verified tokens)");

    // 3. Price masking, anti-side-channel sort & Redis cache
    const catalogPath = "/api/catalog?sort=cheapest&limit=50";
    const cat1 = await requestJson<CatalogBody>(catalogPath, {
      token: yolandToken,
    });
    assert.equal(
      cat1.status,
      200,
      `GET ${catalogPath} expected 200, got ${cat1.status}: ${cat1.rawText}`
    );
    const initialCatalogVer = cat1.data.meta.catalogVersion;

    const fanarItems = cat1.data.items.filter(
      (item) => item.distributor.id === fanarOrgId
    );
    const lockedItems = cat1.data.items.filter(
      (item) => item.distributor.id !== fanarOrgId
    );
    assert.ok(fanarItems.length > 0, "Expected unlocked Fanar items in catalog");
    assert.ok(
      lockedItems.length > 0,
      "Expected locked non-authorized items in catalog"
    );

    for (const item of fanarItems) {
      assert.equal(item.priceLocked, false, "Fanar items must be unlocked");
      assert.ok(
        typeof item.wholesalePriceSdg === "number" &&
          Number.isInteger(item.wholesalePriceSdg) &&
          item.wholesalePriceSdg > 0,
        "Unlocked wholesalePriceSdg must be a positive integer"
      );
    }

    for (const item of lockedItems) {
      assert.equal(item.priceLocked, true, "Unauthorized items must be locked");
      assert.equal(
        item.wholesalePriceSdg,
        null,
        "Unauthorized wholesalePriceSdg must be null"
      );
    }

    let seenLocked = false;
    for (const item of cat1.data.items) {
      if (item.priceLocked) {
        seenLocked = true;
      } else if (seenLocked) {
        assert.fail(
          `Anti-side-channel sort violation: unlocked item ${item.listingId} appeared after a locked item`
        );
      }
    }

    const cat2 = await requestJson<CatalogBody>(catalogPath, {
      token: yolandToken,
    });
    assert.equal(cat2.status, 200, "Second catalog request expected 200");
    assert.equal(
      cat2.data.meta.fromCache,
      true,
      "Second identical catalog request must hit Redis cache (fromCache=true)"
    );
    logPass(
      "3. GET /api/catalog?sort=cheapest (price masking, NULLS LAST sort, Redis cache hit)"
    );

    // 4. Watchlist radar
    const watchlist = await requestJson<WatchlistBody>("/api/watchlist", {
      token: yolandToken,
    });
    assert.equal(
      watchlist.status,
      200,
      `GET /api/watchlist expected 200, got ${watchlist.status}: ${watchlist.rawText}`
    );
    assert.ok(
      Array.isArray(watchlist.data.items) && watchlist.data.items.length >= 1,
      "Watchlist must contain at least 1 item"
    );
    assert.ok(
      watchlist.data.alertsCount >= 1,
      "Watchlist must report alertsCount >= 1 for unseen price increases"
    );
    logPass("4. GET /api/watchlist (items >= 1, alertsCount >= 1)");

    // 5. ACID bulk percent pricing + Redis version invalidation
    const targetManufacturer = fanarItems[0].manufacturer;
    const bulkRes = await requestJson<BulkPercentBody>(
      "/api/distributor/pricing/bulk-percent",
      {
        method: "POST",
        token: fanarToken,
        body: { manufacturer: targetManufacturer, percentChange: 5 },
      }
    );
    assert.equal(
      bulkRes.status,
      200,
      `Bulk percent expected 200, got ${bulkRes.status}: ${bulkRes.rawText}`
    );
    assert.ok(
      bulkRes.data.updatedCount > 0,
      "Bulk percent updatedCount must be > 0"
    );
    for (const updated of bulkRes.data.updatedListings) {
      assert.ok(
        Number.isInteger(updated.wholesalePriceSdg) &&
          updated.wholesalePriceSdg > 0,
        "Updated wholesalePriceSdg must remain a positive integer"
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const catAfterBulk = await requestJson<CatalogBody>(catalogPath, {
      token: yolandToken,
    });
    assert.equal(
      catAfterBulk.status,
      200,
      "Post-bulk catalog request expected 200"
    );
    assert.equal(
      catAfterBulk.data.meta.fromCache,
      false,
      "Catalog cache must be invalidated after bulk percent update"
    );
    assert.ok(
      catAfterBulk.data.meta.catalogVersion > initialCatalogVer,
      `Expected catalogVersion > ${initialCatalogVer}, got ${catAfterBulk.data.meta.catalogVersion}`
    );
    logPass(
      "5. POST /api/distributor/pricing/bulk-percent (ACID integer update + Redis version bump)"
    );

    // 6. Orders: 409 priceVersion conflict, Idempotency-Key replay & cross-tenant 409, cancel
    const orderListing = catAfterBulk.data.items.find(
      (item) =>
        item.distributor.id === fanarOrgId &&
        !item.priceLocked &&
        item.isAvailable
    );
    assert.ok(
      orderListing,
      "Need an available, unlocked Fanar listing to test order creation"
    );

    const staleVersion =
      orderListing.priceVersion === 1 ? 999 : orderListing.priceVersion - 1;
    const staleRes = await requestJson<ErrorBody>("/api/orders", {
      method: "POST",
      token: yolandToken,
      headers: { "Idempotency-Key": `smoke-stale-${Date.now()}` },
      body: {
        distributorId: orderListing.distributor.id,
        items: [
          {
            listingId: orderListing.listingId,
            quantity: 1,
            expectedPriceVersion: staleVersion,
          },
        ],
      },
    });
    assert.equal(
      staleRes.status,
      409,
      `Stale priceVersion order expected 409, got ${staleRes.status}: ${staleRes.rawText}`
    );
    assert.equal(
      staleRes.data.error?.code,
      "PRICE_VERSION_CONFLICT",
      "Expected PRICE_VERSION_CONFLICT error code"
    );
    assert.equal(
      staleRes.data.error?.details?.conflicts?.[0]?.currentPriceVersion,
      orderListing.priceVersion,
      "Conflict payload must include currentPriceVersion"
    );

    const idemKey = `smoke-${Date.now()}`;
    const orderPayload = {
      distributorId: orderListing.distributor.id,
      items: [
        {
          listingId: orderListing.listingId,
          quantity: 1,
          expectedPriceVersion: orderListing.priceVersion,
        },
      ],
    };

    const createRes = await requestJson<OrderBody>("/api/orders", {
      method: "POST",
      token: yolandToken,
      headers: { "Idempotency-Key": idemKey },
      body: orderPayload,
    });
    assert.equal(
      createRes.status,
      201,
      `Valid order creation expected 201, got ${createRes.status}: ${createRes.rawText}`
    );
    assert.equal(
      createRes.data.idempotentReplay,
      false,
      "Initial order create must have idempotentReplay=false"
    );
    assert.equal(
      createRes.data.order.status,
      "PENDING_CONFIRMATION",
      "Created order status must be PENDING_CONFIRMATION"
    );

    const replayRes = await requestJson<OrderBody>("/api/orders", {
      method: "POST",
      token: yolandToken,
      headers: { "Idempotency-Key": idemKey },
      body: orderPayload,
    });
    assert.equal(
      replayRes.status,
      200,
      `Idempotent replay expected 200, got ${replayRes.status}: ${replayRes.rawText}`
    );
    assert.equal(
      replayRes.data.idempotentReplay,
      true,
      "Replay must have idempotentReplay=true"
    );
    assert.equal(
      replayRes.data.order.id,
      createRes.data.order.id,
      "Replay must return the original order ID"
    );

    const crossTenantRes = await requestJson<ErrorBody>("/api/orders", {
      method: "POST",
      token: roaToken,
      headers: { "Idempotency-Key": idemKey },
      body: orderPayload,
    });
    assert.equal(
      crossTenantRes.status,
      409,
      `Cross-tenant Idempotency-Key replay expected 409, got ${crossTenantRes.status}: ${crossTenantRes.rawText}`
    );
    assert.equal(
      crossTenantRes.data.error?.code,
      "IDEMPOTENCY_KEY_CONFLICT",
      "Expected IDEMPOTENCY_KEY_CONFLICT error code"
    );

    const cancelRes = await requestJson<{ order: { id: string; status: string } }>(
      `/api/orders/${createRes.data.order.id}/cancel`,
      {
        method: "PATCH",
        token: yolandToken,
      }
    );
    assert.equal(
      cancelRes.status,
      200,
      `Cancel order expected 200, got ${cancelRes.status}: ${cancelRes.rawText}`
    );
    assert.equal(
      cancelRes.data.order.status,
      "CANCELLED",
      "Cancelled order status must be CANCELLED"
    );
    logPass(
      "6. POST /api/orders (409 PRICE_VERSION_CONFLICT, 201 create, 200 replay, 409 cross-tenant, cancel)"
    );

    // 7. Sales pause guard
    const pauseRes = await requestJson<StatusUpdateBody>(
      "/api/distributor/status",
      {
        method: "PATCH",
        token: fanarToken,
        body: { salesStatus: "PAUSED_REPRICING" },
      }
    );
    assert.equal(
      pauseRes.status,
      200,
      `Pause distributor expected 200, got ${pauseRes.status}: ${pauseRes.rawText}`
    );
    assert.equal(pauseRes.data.organization.salesStatus, "PAUSED_REPRICING");

    const pausedOrderRes = await requestJson<ErrorBody>("/api/orders", {
      method: "POST",
      token: yolandToken,
      headers: { "Idempotency-Key": `smoke-paused-${Date.now()}` },
      body: orderPayload,
    });
    assert.equal(
      pausedOrderRes.status,
      409,
      `Paused distributor order expected 409, got ${pausedOrderRes.status}: ${pausedOrderRes.rawText}`
    );
    assert.equal(
      pausedOrderRes.data.error?.code,
      "DISTRIBUTOR_PAUSED",
      "Expected DISTRIBUTOR_PAUSED error code"
    );
    logPass("7. PATCH /api/distributor/status (PAUSED_REPRICING -> 409 DISTRIBUTOR_PAUSED)");
  } finally {
    if (fanarToken) {
      try {
        const restoreRes = await requestJson<StatusUpdateBody>(
          "/api/distributor/status",
          {
            method: "PATCH",
            token: fanarToken,
            body: { salesStatus: "OPEN" },
          }
        );
        assert.equal(
          restoreRes.status,
          200,
          `Failed restoring Fanar salesStatus to OPEN (HTTP ${restoreRes.status})`
        );
        assert.equal(restoreRes.data.organization.salesStatus, "OPEN");
        logPass("Cleanup: Restored Fanar salesStatus to OPEN");
      } catch (cleanupErr) {
        restoreFailed = true;
        console.error("CRITICAL: Failed to restore Fanar salesStatus to OPEN:", cleanupErr);
      }
    }
  }

  if (restoreFailed) {
    process.exit(1);
  }

  console.log("\nAll 7 live E2E smoke checks passed.");
}

main().catch((err) => {
  console.error("\nSmoke test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
