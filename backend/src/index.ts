import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pool } from "./db";
import { disconnectRedis } from "./lib/redis";
import { registerCoreEventListeners } from "./lib/events";
import { errorHandler, notFoundHandler } from "./lib/errors";
import {
  requestIdMiddleware,
  requestLoggerMiddleware,
} from "./middleware/request-logger.middleware";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./modules/auth/auth.routes";
import adminRoutes from "./modules/admin/admin.routes";
import permissionsRoutes from "./modules/permissions/permissions.routes";
import catalogRoutes from "./modules/catalog/catalog.routes";
import distributorsRoutes from "./modules/catalog/distributors.routes";
import distributorRoutes from "./modules/distributor/distributor.routes";
import watchlistRoutes from "./modules/watchlist/watchlist.routes";
import ordersRoutes from "./modules/orders/orders.routes";
import { startOrderExpirySweeper } from "./modules/orders/orders.service";

registerCoreEventListeners();
const stopOrderExpirySweeper = startOrderExpirySweeper();

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.set("trust proxy", 1);

const rawFrontendUrl = process.env.FRONTEND_URL?.trim();
const allowedOrigins = rawFrontendUrl
  ? rawFrontendUrl
      .split(",")
      .map((url) => url.trim().replace(/\/+$/, ""))
      .filter(Boolean)
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }
      const normalized = origin.trim().replace(/\/+$/, "");
      if (
        allowedOrigins.length === 0 ||
        allowedOrigins.includes("*") ||
        allowedOrigins.includes(normalized) ||
        process.env.NODE_ENV !== "production"
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    exposedHeaders: ["X-Request-Id"],
  })
);
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/api/ping", (_req, res) => {
  res.json({ ok: true, service: "madad-b2b" });
});

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/permissions", permissionsRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/distributors", distributorsRoutes);
app.use("/api/distributor", distributorRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/orders", ordersRoutes);

app.use("/api", notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`madad-b2b backend listening on port ${PORT}`);
});

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  stopOrderExpirySweeper();
  console.log(`Received ${signal}, shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    console.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 5000);
  forceExitTimer.unref();

  server.close(async () => {
    try {
      await Promise.allSettled([pool.end(), disconnectRedis()]);
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (err) {
      console.error("Error during graceful shutdown:", err);
      process.exit(1);
    }
  });
  server.closeIdleConnections?.();
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
