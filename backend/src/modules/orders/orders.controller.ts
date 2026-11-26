import type { Request, RequestHandler } from "express";
import { AppError } from "../../lib/errors";
import {
  createOrderSchema,
  listOrdersQuerySchema,
  orderIdParamSchema,
} from "./orders.schemas";
import * as ordersService from "./orders.service";

function requireOrgId(req: Request): string {
  const orgId = req.user?.organizationId;
  if (!orgId) {
    throw new AppError(403, "FORBIDDEN", "لا توجد منشأة مرتبطة بهذا الحساب");
  }
  return orgId;
}

export const createOrderHandler: RequestHandler = async (req, res) => {
  const pharmacyId = requireOrgId(req);
  const idempotencyKey = req.header("Idempotency-Key")?.trim();

  if (!idempotencyKey || idempotencyKey.length > 128) {
    throw new AppError(
      400,
      "MISSING_IDEMPOTENCY_KEY",
      "مفتاح عدم التكرار (Idempotency-Key) مطلوب وصالح (1-128 حرفاً)"
    );
  }

  const input = createOrderSchema.parse(req.body);
  const result = await ordersService.createOrder(
    pharmacyId,
    idempotencyKey,
    input
  );

  res.status(result.idempotentReplay ? 200 : 201).json(result);
};

export const listOrdersHandler: RequestHandler = async (req, res) => {
  const filters = listOrdersQuerySchema.parse(req.query);
  const orders = await ordersService.listOrdersForUser(req.user!, filters);
  res.status(200).json({ orders });
};

export const confirmOrderHandler: RequestHandler = async (req, res) => {
  const distributorId = requireOrgId(req);
  const { id } = orderIdParamSchema.parse({ id: req.params.id });
  const result = await ordersService.confirmOrder(distributorId, id);
  res.status(200).json(result);
};

export const cancelOrderHandler: RequestHandler = async (req, res) => {
  const { id } = orderIdParamSchema.parse({ id: req.params.id });
  const result = await ordersService.cancelOrder(req.user!, id);
  res.status(200).json(result);
};
