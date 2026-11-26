import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import {
  acknowledgeWatchlistHandler,
  createWatchlistHandler,
  deleteWatchlistHandler,
  listPriceAlertsHandler,
  listWatchlistHandler,
  updateWatchlistHandler,
} from "./watchlist.controller";

const router = Router();

router.use(requireAuth, requireRole("PHARMACY"));

router.get("/", listWatchlistHandler);
router.get("/price-alerts", listPriceAlertsHandler);
router.post("/", createWatchlistHandler);
router.patch("/:id", updateWatchlistHandler);
router.post("/:id/acknowledge", acknowledgeWatchlistHandler);
router.delete("/:id", deleteWatchlistHandler);

export default router;
