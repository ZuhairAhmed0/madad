import { z } from "zod";

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .transform((val) => (val && val.length > 0 ? val : undefined));

export const catalogQuerySchema = z.object({
  q: optionalTrimmedString,
  manufacturer: optionalTrimmedString,
  distributorId: z.uuid("معرف الموزع غير صالح").optional(),
  availableOnly: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((val) => val === true || val === "true")
    .default(false),
  sort: z.enum(["cheapest", "latest"]).default("latest"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const masterDrugsQuerySchema = z.object({
  q: optionalTrimmedString,
  manufacturer: optionalTrimmedString,
});

export const distributorIdParamSchema = z.object({
  id: z.uuid("معرف الموزع غير صالح"),
});

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
export type MasterDrugsQuery = z.infer<typeof masterDrugsQuerySchema>;
export type DistributorIdParam = z.infer<typeof distributorIdParamSchema>;
