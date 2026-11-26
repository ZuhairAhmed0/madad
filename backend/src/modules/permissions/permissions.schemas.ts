import { z } from "zod";

export const requestPermissionSchema = z.object({
  distributorId: z.uuid("معرف الموزع غير صالح"),
});

export const listPermissionsQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REVOKED"]).optional(),
});

export const updatePermissionSchema = z.object({
  id: z.uuid("معرف الإذن غير صالح"),
  status: z.enum(["APPROVED", "REVOKED"]),
});

export type RequestPermissionInput = z.infer<typeof requestPermissionSchema>;
export type ListPermissionsQuery = z.infer<typeof listPermissionsQuerySchema>;
export type UpdatePermissionInput = z.infer<typeof updatePermissionSchema>;
