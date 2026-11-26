import { Pool, type PoolConfig } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export interface DependencyHealth {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

const databaseUrl = process.env.DATABASE_URL;
const useLooseSsl =
  Boolean(databaseUrl?.includes("sslmode=require")) ||
  process.env.NODE_ENV === "production";

const poolConfig: PoolConfig = {
  connectionString: databaseUrl,
  connectionTimeoutMillis: 20000,
  idleTimeoutMillis: 30000,
  ...(useLooseSsl ? { ssl: { rejectUnauthorized: false } } : {}),
};

export const pool = new Pool(poolConfig);

// Prevent unhandled error events from crashing the process when Neon suspends idle connections.
pool.on("error", (err) => {
  console.error("[db] unexpected idle client error:", err.message);
});

export const db = drizzle(pool, { schema });

/** Run a lightweight query against PostgreSQL and measure latency. */
export async function pingDb(): Promise<DependencyHealth> {
  if (!databaseUrl) {
    return { ok: false, error: "DATABASE_URL is not configured" };
  }

  const start = Date.now();
  try {
    await pool.query("SELECT 1");
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
