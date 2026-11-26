import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import {
  bulkImportHandler,
  bulkPercentPricingHandler,
  createListingHandler,
  listAliasesHandler,
  listListingsHandler,
  listNewPharmaciesHandler,
  listPriceLogsHandler,
  updateListingHandler,
  updateStatusHandler,
  upsertAliasHandler,
} from "./distributor.controller";

const router = Router();

router.use(requireAuth, requireRole("DISTRIBUTOR"));

router.patch("/status", updateStatusHandler);
router.get("/listings", listListingsHandler);
router.post("/listings", createListingHandler);
router.post("/listings/bulk-import", bulkImportHandler);
router.patch("/listings/:id", updateListingHandler);
router.post("/pricing/bulk-percent", bulkPercentPricingHandler);
router.get("/price-logs", listPriceLogsHandler);
router.get("/new-pharmacies", listNewPharmaciesHandler);
router.get("/aliases", listAliasesHandler);
router.post("/aliases", upsertAliasHandler);

export default router;
