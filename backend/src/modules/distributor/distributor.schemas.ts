import { z } from "zod";

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .transform((val) => (val && val.length > 0 ? val : undefined));

export const updateStatusSchema = z
  .object({
    salesStatus: z.enum(["OPEN", "PAUSED_REPRICING"]).optional(),
    orderExpiryMinutes: z.number().int().positive().max(1440).optional(),
  })
  .refine(
    (data) =>
      data.salesStatus !== undefined || data.orderExpiryMinutes !== undefined,
    { message: "يجب تحديد حقل واحد على الأقل للتحديث" }
  );

export const listListingsQuerySchema = z.object({
  q: optionalTrimmedString,
  manufacturer: optionalTrimmedString,
  availableOnly: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((val) => val === true || val === "true")
    .default(false),
});

export const createListingSchema = z.object({
  drugId: z.uuid("معرف الدواء غير صالح"),
  wholesalePriceSdg: z
    .number()
    .int("السعر يجب أن يكون عدداً صحيحاً")
    .positive("السعر يجب أن يكون أكبر من صفر"),
  isAvailable: z.boolean().default(true),
});

export const updateListingSchema = z
  .object({
    id: z.uuid("معرف الصنف غير صالح"),
    wholesalePriceSdg: z
      .number()
      .int("السعر يجب أن يكون عدداً صحيحاً")
      .positive("السعر يجب أن يكون أكبر من صفر")
      .optional(),
    isAvailable: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.wholesalePriceSdg !== undefined || data.isAvailable !== undefined,
    { message: "يجب تحديد السعر أو حالة التوفر للتحديث" }
  );

export const bulkPercentPricingSchema = z.object({
  manufacturer: z.string().trim().min(1, "اسم الشركة المنتجة مطلوب"),
  percentChange: z
    .number()
    .min(-90, "نسبة التغيير لا يمكن أن تقل عن -90%")
    .max(500, "نسبة التغيير لا يمكن أن تتجاوز 500%")
    .refine((val) => val !== 0, "نسبة التغيير يجب أن لا تساوي صفراً"),
});

export const priceLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const newPharmaciesQuerySchema = z.object({
  region: optionalTrimmedString,
});

export const bulkImportSchema = z.union([
  z.object({
    format: z.literal("CSV_TEXT").default("CSV_TEXT"),
    text: z
      .string()
      .trim()
      .min(1, "النص المستورد مطلوب")
      .max(200_000, "حجم النص يتجاوز الحد الأقصى المسموح"),
  }),
  z.object({
    format: z.literal("JSON_ROWS"),
    rows: z
      .array(
        z.object({
          rawName: z.string().trim().min(1, "اسم الصنف مطلوب"),
          wholesalePriceSdg: z.union([z.number(), z.string()]),
          isAvailable: z.union([z.boolean(), z.string()]).optional(),
        })
      )
      .min(1, "يجب توفير صف واحد على الأقل")
      .max(1000, "الحد الأقصى للاستيراد هو 1000 صف"),
  }),
]);

export const upsertAliasSchema = z.object({
  rawName: z.string().trim().min(1, "اسم الصنف الأصلي مطلوب"),
  masterDrugId: z.uuid("معرف الدواء المرجعي غير صالح"),
  wholesalePriceSdg: z
    .number()
    .int("السعر يجب أن يكون عدداً صحيحاً")
    .positive("السعر يجب أن يكون أكبر من صفر")
    .optional(),
  isAvailable: z.boolean().default(true),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type ListListingsQuery = z.infer<typeof listListingsQuerySchema>;
export type CreateListingInput = z.infer<typeof createListingSchema>;
export type UpdateListingInput = z.infer<typeof updateListingSchema>;
export type BulkPercentPricingInput = z.infer<typeof bulkPercentPricingSchema>;
export type PriceLogsQuery = z.infer<typeof priceLogsQuerySchema>;
export type NewPharmaciesQuery = z.infer<typeof newPharmaciesQuerySchema>;
export type BulkImportInput = z.infer<typeof bulkImportSchema>;
export type UpsertAliasInput = z.infer<typeof upsertAliasSchema>;
