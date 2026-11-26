import Redis, { type RedisOptions } from "ioredis";
import type { DependencyHealth } from "../db";

export const CATALOG_VERSION_KEY = "madad:catalog:version";
export const pharmacyPermVersionKey = (pharmacyId: string): string =>
  `madad:perm:ver:${pharmacyId}`;

const redisUrl = process.env.REDIS_URL?.trim();
let redisInitError: string | undefined;

function createRedisClient(url: string | undefined): Redis | null {
  if (!url) {
    redisInitError = "REDIS_URL is not configured";
    return null;
  }

  try {
    // Validate URL syntax before constructing ioredis so malformed env values degrade cleanly.
    new URL(url);

    const options: RedisOptions = {
      commandTimeout: 4000,
      connectTimeout: 5000,
      keepAlive: 10000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 500, 10000),
      ...(url.startsWith("rediss://") &&
      process.env.REDIS_TLS_REJECT_UNAUTHORIZED === "false"
        ? { tls: { rejectUnauthorized: false } }
        : {}),
    };

    const client = new Redis(url, options);

    client.on("error", (err) => {
      console.error(
        "[redis] connection error (degrading gracefully):",
        err.message
      );
    });

    return client;
  } catch (err) {
    redisInitError = err instanceof Error ? err.message : String(err);
    console.error(
      "[redis] initialization failed (degrading gracefully):",
      redisInitError
    );
    return null;
  }
}

export const redis = createRedisClient(redisUrl);

async function getVersionedInt(key: string, label: string): Promise<number> {
  if (!redis) {
    return 0;
  }

  try {
    const raw = await redis.get(key);
    if (!raw) {
      return 0;
    }

    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  } catch (err) {
    console.warn(
      `[redis] ${label} failed, degrading to version 0:`,
      err instanceof Error ? err.message : String(err)
    );
    return 0;
  }
}

async function bumpVersionKey(key: string, label: string): Promise<void> {
  if (!redis) {
    return;
  }

  try {
    await redis.incr(key);
  } catch (err) {
    console.warn(
      `[redis] ${label} failed, continuing without cache bump:`,
      err instanceof Error ? err.message : String(err)
    );
  }
}

/** Return the current catalog cache version, defaulting to 0 when unavailable. */
export async function getCatalogVersion(): Promise<number> {
  return getVersionedInt(CATALOG_VERSION_KEY, "getCatalogVersion");
}

/** Increment the catalog cache version on price or stock-status mutations. */
export async function bumpCatalogVersion(): Promise<void> {
  return bumpVersionKey(CATALOG_VERSION_KEY, "bumpCatalogVersion");
}

/** Return the per-pharmacy permission version, defaulting to 0 when unavailable. */
export async function getPharmacyPermVersion(
  pharmacyId: string
): Promise<number> {
  return getVersionedInt(
    pharmacyPermVersionKey(pharmacyId),
    "getPharmacyPermVersion"
  );
}

/** Increment the per-pharmacy permission version when price access changes. */
export async function bumpPharmacyPermVersion(
  pharmacyId: string
): Promise<void> {
  return bumpVersionKey(
    pharmacyPermVersionKey(pharmacyId),
    "bumpPharmacyPermVersion"
  );
}

/** Read and parse a JSON-cached value, returning null on miss or error. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) {
    return null;
  }

  try {
    const raw = await redis.get(key);
    if (raw === null) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(
      "[redis] cacheGet failed, degrading to source:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/** Write a JSON-serializable value to cache with TTL, ignoring failures. */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = 300
): Promise<void> {
  if (!redis) {
    return;
  }

  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    console.warn(
      "[redis] cacheSet failed, continuing without caching:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

/** Probe Redis responsiveness without throwing on failure or timeout. */
export async function pingRedis(): Promise<DependencyHealth> {
  if (!redis) {
    return { ok: false, error: redisInitError ?? "REDIS_URL is not configured" };
  }

  const start = Date.now();
  try {
    await redis.ping();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Close the Redis connection cleanly during process shutdown. */
export async function disconnectRedis(): Promise<void> {
  if (!redis) {
    return;
  }

  try {
    if (redis.status === "ready") {
      await redis.quit();
    } else {
      redis.disconnect();
    }
  } catch {
    redis.disconnect();
  }
}
