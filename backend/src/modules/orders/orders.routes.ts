import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import {
  cancelOrderHandler,
  confirmOrderHandler,
  createOrderHandler,
  listOrdersHandler,
} from "./orders.controller";

const router = Router();

router.use(requireAuth);

router.post("/", requireRole("PHARMACY"), createOrderHandler);
router.get("/", requireRole("PHARMACY", "DISTRIBUTOR"), listOrdersHandler);
router.patch("/:id/confirm", requireRole("DISTRIBUTOR"), confirmOrderHandler);
router.patch(
  "/:id/cancel",
  requireRole("PHARMACY", "DISTRIBUTOR"),
  cancelOrderHandler
);

export default router;
