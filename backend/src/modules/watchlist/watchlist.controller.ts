import type { Request, RequestHandler } from "express";
import { AppError } from "../../lib/errors";
import {
  acknowledgeWatchlistSchema,
  createWatchlistSchema,
  priceAlertsQuerySchema,
  updateWatchlistSchema,
  watchlistIdParamSchema,
} from "./watchlist.schemas";
import * as watchlistService from "./watchlist.service";

function requirePharmacyId(req: Request): string {
  const pharmacyId = req.user?.organizationId;
  if (!pharmacyId) {
    throw new AppError(403, "FORBIDDEN", "لا توجد منشأة مرتبطة بهذا الحساب");
  }
  return pharmacyId;
}

export const listWatchlistHandler: RequestHandler = async (req, res) => {
  const pharmacyId = requirePharmacyId(req);
  const result = await watchlistService.listWatchlist(pharmacyId);
  res.status(200).json(result);
};

export const listPriceAlertsHandler: RequestHandler = async (req, res) => {
  const pharmacyId = requirePharmacyId(req);
  const query = priceAlertsQuerySchema.parse(req.query);
  const alerts = await watchlistService.listPriceAlerts(pharmacyId, query);
  res.status(200).json({ alerts });
};

export const createWatchlistHandler: RequestHandler = async (req, res) => {
  const pharmacyId = requirePharmacyId(req);
  const input = createWatchlistSchema.parse(req.body);
  const result = await watchlistService.createWatchlistItem(pharmacyId, input);
  res.status(201).json(result);
};

export const updateWatchlistHandler: RequestHandler = async (req, res) => {
  const pharmacyId = requirePharmacyId(req);
  const { id, ...updates } = updateWatchlistSchema.parse({
    id: req.params.id,
    pricingPolicy: req.body?.pricingPolicy,
    preferredDistributorId: req.body?.preferredDistributorId,
    profitMarginPercent: req.body?.profitMarginPercent,
    autoCalcEnabled: req.body?.autoCalcEnabled,
    currentShelfPriceSdg: req.body?.currentShelfPriceSdg,
  });
  const result = await watchlistService.updateWatchlistItem(
    pharmacyId,
    id,
    updates
  );
  res.status(200).json(result);
};

export const acknowledgeWatchlistHandler: RequestHandler = async (
  req: Request,
  res
) => {
  const pharmacyId = requirePharmacyId(req);
  const { id, customShelfPriceSdg } = acknowledgeWatchlistSchema.parse({
    id: req.params.id,
    customShelfPriceSdg: req.body?.customShelfPriceSdg,
  });
  const result = await watchlistService.acknowledgeWatchlistItem(
    pharmacyId,
    id,
    { customShelfPriceSdg }
  );
  res.status(200).json(result);
};

export const deleteWatchlistHandler: RequestHandler = async (
  req: Request,
  res
) => {
  const pharmacyId = requirePharmacyId(req);
  const { id } = watchlistIdParamSchema.parse({ id: req.params.id });
  const result = await watchlistService.deleteWatchlistItem(pharmacyId, id);
  res.status(200).json(result);
};
