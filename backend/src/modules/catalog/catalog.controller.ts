import type { Request, RequestHandler } from "express";
import { AppError } from "../../lib/errors";
import {
  catalogQuerySchema,
  distributorIdParamSchema,
  masterDrugsQuerySchema,
} from "./catalog.schemas";
import * as catalogService from "./catalog.service";

function requireOrgId(req: Request): string {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    throw new AppError(403, "FORBIDDEN", "لا توجد منشأة مرتبطة بهذا الحساب");
  }
  return organizationId;
}

export const searchCatalogHandler: RequestHandler = async (req, res) => {
  const pharmacyId = requireOrgId(req);
  const query = catalogQuerySchema.parse(req.query);
  const result = await catalogService.searchCatalog(pharmacyId, query);
  res.status(200).json(result);
};

export const listManufacturersHandler: RequestHandler = async (_req, res) => {
  const manufacturers = await catalogService.listManufacturers();
  res.status(200).json({ manufacturers });
};

export const searchMasterDrugsHandler: RequestHandler = async (req, res) => {
  const query = masterDrugsQuerySchema.parse(req.query);
  const drugs = await catalogService.searchMasterDrugs(query);
  res.status(200).json({ drugs });
};

export const listDistributorsHandler: RequestHandler = async (req, res) => {
  const pharmacyId = requireOrgId(req);
  const distributors = await catalogService.listDistributorsForPharmacy(
    pharmacyId
  );
  res.status(200).json({ distributors });
};

export const getDistributorDetailHandler: RequestHandler = async (
  req,
  res
) => {
  const pharmacyId = requireOrgId(req);
  const { id } = distributorIdParamSchema.parse({ id: req.params.id });
  const result = await catalogService.getDistributorDetailForPharmacy(
    pharmacyId,
    id
  );
  res.status(200).json(result);
};
