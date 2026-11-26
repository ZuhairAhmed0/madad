import type { RequestHandler } from "express";
import { AppError } from "../../lib/errors";
import {
  listPermissionsQuerySchema,
  requestPermissionSchema,
  updatePermissionSchema,
} from "./permissions.schemas";
import * as permissionsService from "./permissions.service";

export const requestPermissionHandler: RequestHandler = async (req, res) => {
  const pharmacyId = req.user?.organizationId;
  if (!pharmacyId) {
    throw new AppError(403, "FORBIDDEN", "لا توجد منشأة مرتبطة بهذا الحساب");
  }

  const { distributorId } = requestPermissionSchema.parse(req.body);
  const result = await permissionsService.requestPriceAccess(
    pharmacyId,
    distributorId
  );

  res.status(result.created ? 201 : 200).json(result);
};

export const listPermissionsHandler: RequestHandler = async (req, res) => {
  const filters = listPermissionsQuerySchema.parse(req.query);
  const permissions = await permissionsService.listPermissionsForUser(
    req.user!,
    filters
  );

  res.status(200).json({ permissions });
};

export const updatePermissionHandler: RequestHandler = async (req, res) => {
  const distributorId = req.user?.organizationId;
  if (!distributorId) {
    throw new AppError(403, "FORBIDDEN", "لا توجد منشأة مرتبطة بهذا الحساب");
  }

  const { id, status } = updatePermissionSchema.parse({
    id: req.params.id,
    status: req.body?.status,
  });
  const result = await permissionsService.updatePermissionStatus(
    distributorId,
    id,
    status
  );

  res.status(200).json(result);
};
