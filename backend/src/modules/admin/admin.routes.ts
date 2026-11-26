import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import {
  createOrganizationHandler,
  listOrganizationsHandler,
  verifyOrganizationHandler,
} from "./admin.controller";

const router = Router();

router.use(requireAuth, requireRole("ADMIN"));

router.get("/organizations", listOrganizationsHandler);
router.post("/organizations", createOrganizationHandler);
router.patch("/organizations/:id/verify", verifyOrganizationHandler);

export default router;
