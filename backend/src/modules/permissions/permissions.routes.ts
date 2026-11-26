import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import {
  listPermissionsHandler,
  requestPermissionHandler,
  updatePermissionHandler,
} from "./permissions.controller";

const router = Router();

router.post(
  "/request",
  requireAuth,
  requireRole("PHARMACY"),
  requestPermissionHandler
);
router.get(
  "/",
  requireAuth,
  requireRole("PHARMACY", "DISTRIBUTOR"),
  listPermissionsHandler
);
router.patch(
  "/:id",
  requireAuth,
  requireRole("DISTRIBUTOR"),
  updatePermissionHandler
);

export default router;
