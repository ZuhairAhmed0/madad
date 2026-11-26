import type { RequestHandler } from "express";
import { pingDb } from "../db";
import { pingRedis } from "../lib/redis";

/** Report service health while proving graceful degradation if Redis is down. */
export const getHealth: RequestHandler = async (_req, res) => {
  const [db, redis] = await Promise.all([pingDb(), pingRedis()]);
  const timestamp = new Date().toISOString();

  if (!db.ok) {
    res.status(503).json({
      status: "unhealthy",
      db,
      redis,
      timestamp,
    });
    return;
  }

  const status = redis.ok ? "ok" : "degraded";
  res.status(200).json({
    status,
    db,
    redis,
    timestamp,
  });
};
