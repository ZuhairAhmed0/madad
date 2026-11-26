import type { Request, RequestHandler } from "express";
import { AppError } from "../../lib/errors";
import {
  bulkImportSchema,
  bulkPercentPricingSchema,
  createListingSchema,
  listListingsQuerySchema,
  newPharmaciesQuerySchema,
  priceLogsQuerySchema,
  updateListingSchema,
  updateStatusSchema,
  upsertAliasSchema,
} from "./distributor.schemas";
import * as distributorService from "./distributor.service";

function requireDistributorId(req: Request): string {
  const distributorId = req.user?.organizationId;
  if (!distributorId) {
    throw new AppError(403, "FORBIDDEN", "لا توجد منشأة مرتبطة بهذا الحساب");
  }
  return distributorId;
}

export const updateStatusHandler: RequestHandler = async (req, res) => {
  const distributorId = requireDistributorId(req);
  const input = updateStatusSchema.parse(req.body);
  const result = await distributorService.updateDistributorStatus(
    distributorId,
    input
  );
  res.status(200).json(result);
};

export const listListingsHandler: RequestHandler = async (req, res) => {
  const distributorId = requireDistributorId(req);
  const filters = listListingsQuerySchema.parse(req.query);
  const listings = await distributorService.listDistributorListings(
    distributorId,
    filters
  );
  res.status(200).json({ listings });
};

export const createListingHandler: RequestHandler = async (req, res) => {
  const distributorId = requireDistributorId(req);
  const input = createListingSchema.parse(req.body);
  const result = await distributorService.createDistributorListing(
    distributorId,
    input
  );
  res.status(201).json(result);
};

export const updateListingHandler: RequestHandler = async (req, res) => {
  const distributorId = requireDistributorId(req);
  const { id, ...updates } = updateListingSchema.parse({
    id: req.params.id,
    wholesalePriceSdg: req.body?.wholesalePriceSdg,
    isAvailable: req.body?.isAvailable,
  });
  const result = await distributorService.updateDistributorListing(
    distributorId,
    id,
    updates
  );
  res.status(200).json(result);
};

export const bulkPercentPricingHandler: RequestHandler = async (req, res) => {
  const distributorId = requireDistributorId(req);
  const input = bulkPercentPricingSchema.parse(req.body);
  const result = await distributorService.applyBulkPercentPricing(
    distributorId,
    input
  );
  res.status(200).json(result);
};

export const listPriceLogsHandler: RequestHandler = async (req, res) => {
  const distributorId = requireDistributorId(req);
  const { limit } = priceLogsQuerySchema.parse(req.query);
  const logs = await distributorService.listPriceChangeLogs(
    distributorId,
    limit
  );
  res.status(200).json({ logs });
};

export const listNewPharmaciesHandler: RequestHandler = async (req, res) => {
  const distributorId = requireDistributorId(req);
  const filters = newPharmaciesQuerySchema.parse(req.query);
  const pharmacies = await distributorService.listNewVerifiedPharmacies(
    distributorId,
    filters
  );
  res.status(200).json({ pharmacies });
};

export const bulkImportHandler: RequestHandler = async (req, res) => {
  const distributorId = requireDistributorId(req);
  const input = bulkImportSchema.parse(req.body);
  const report = await distributorService.bulkImportListings(
    distributorId,
    input
  );
  res.status(200).json(report);
};

export const listAliasesHandler: RequestHandler = async (req, res) => {
  const distributorId = requireDistributorId(req);
  const aliases = await distributorService.listDistributorAliases(distributorId);
  res.status(200).json({ aliases });
};

export const upsertAliasHandler: RequestHandler = async (req, res) => {
  const distributorId = requireDistributorId(req);
  const input = upsertAliasSchema.parse(req.body);
  const { created, alias, listing } =
    await distributorService.upsertDistributorAlias(distributorId, input);
  res.status(created ? 201 : 200).json({ alias, listing });
};
