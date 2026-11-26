import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import {
  getDistributorDetailHandler,
  listDistributorsHandler,
} from "./catalog.controller";

const router = Router();

router.use(requireAuth, requireRole("PHARMACY"));

router.get("/", listDistributorsHandler);
router.get("/:id", getDistributorDetailHandler);

export default router;
