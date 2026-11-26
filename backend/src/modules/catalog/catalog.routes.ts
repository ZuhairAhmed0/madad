import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import {
  listManufacturersHandler,
  searchCatalogHandler,
  searchMasterDrugsHandler,
} from "./catalog.controller";

const router = Router();

router.get("/", requireAuth, requireRole("PHARMACY"), searchCatalogHandler);
router.get("/manufacturers", requireAuth, listManufacturersHandler);
router.get("/master-drugs", requireAuth, searchMasterDrugsHandler);

export default router;
