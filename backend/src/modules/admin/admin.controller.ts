import type { RequestHandler } from "express";
import {
  createOrganizationSchema,
  listOrganizationsQuerySchema,
  verifyOrganizationSchema,
} from "./admin.schemas";
import * as adminService from "./admin.service";

export const listOrganizationsHandler: RequestHandler = async (req, res) => {
  const filters = listOrganizationsQuerySchema.parse(req.query);
  const organizations = await adminService.listOrganizations(filters);
  res.status(200).json({ organizations });
};

export const createOrganizationHandler: RequestHandler = async (req, res) => {
  const input = createOrganizationSchema.parse(req.body);
  const result = await adminService.createOrganizationWithUser(input);
  res.status(201).json(result);
};

export const verifyOrganizationHandler: RequestHandler = async (req, res) => {
  const { id, verificationStatus } = verifyOrganizationSchema.parse({
    id: req.params.id,
    verificationStatus: req.body?.verificationStatus,
  });
  const result = await adminService.updateVerificationStatus(
    id,
    verificationStatus
  );
  res.status(200).json(result);
};
