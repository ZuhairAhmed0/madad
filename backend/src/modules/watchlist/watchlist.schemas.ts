import { z } from "zod";

export const priceAlertsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  watchedOnly: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((val) => val === true || val === "true")
    .default(false),
});

export const createWatchlistSchema = z
  .object({
    drugId: z.uuid("معرف الدواء غير صالح"),
    pricingPolicy: z
      .enum(["HIGHEST_AUTHORIZED", "PREFERRED_DISTRIBUTOR"])
      .default("HIGHEST_AUTHORIZED"),
    preferredDistributorId: z
      .uuid("معرف الموزع المفضل غير صالح")
      .nullable()
      .optional(),
    profitMarginPercent: z.number().min(0).max(500).default(20),
    autoCalcEnabled: z.boolean().default(true),
  })
  .refine(
    (data) =>
      data.pricingPolicy !== "PREFERRED_DISTRIBUTOR" ||
      Boolean(data.preferredDistributorId),
    {
      message: "يجب تحديد الموزع المفضل عند اختيار سياسة الموزع المفضل",
      path: ["preferredDistributorId"],
    }
  );

export const updateWatchlistSchema = z
  .object({
    id: z.uuid("معرف عنصر المتابعة غير صالح"),
    pricingPolicy: z
      .enum(["HIGHEST_AUTHORIZED", "PREFERRED_DISTRIBUTOR"])
      .optional(),
    preferredDistributorId: z
      .uuid("معرف الموزع المفضل غير صالح")
      .nullable()
      .optional(),
    profitMarginPercent: z.number().min(0).max(500).optional(),
    autoCalcEnabled: z.boolean().optional(),
    currentShelfPriceSdg: z
      .number()
      .int("سعر الرف يجب أن يكون عدداً صحيحاً")
      .positive("سعر الرف يجب أن يكون أكبر من صفر")
      .max(2_147_483_647)
      .optional(),
  })
  .refine(
    (data) =>
      data.pricingPolicy !== undefined ||
      data.preferredDistributorId !== undefined ||
      data.profitMarginPercent !== undefined ||
      data.autoCalcEnabled !== undefined ||
      data.currentShelfPriceSdg !== undefined,
    { message: "يجب تحديد حقل واحد على الأقل للتحديث" }
  );

export const acknowledgeWatchlistSchema = z.object({
  id: z.uuid("معرف عنصر المتابعة غير صالح"),
  customShelfPriceSdg: z
    .number()
    .int("سعر الرف يجب أن يكون عدداً صحيحاً")
    .positive("سعر الرف يجب أن يكون أكبر من صفر")
    .max(2_147_483_647)
    .optional(),
});

export const watchlistIdParamSchema = z.object({
  id: z.uuid("معرف عنصر المتابعة غير صالح"),
});

export type PriceAlertsQuery = z.infer<typeof priceAlertsQuerySchema>;
export type CreateWatchlistInput = z.infer<typeof createWatchlistSchema>;
export type UpdateWatchlistInput = z.infer<typeof updateWatchlistSchema>;
export type AcknowledgeWatchlistInput = z.infer<
  typeof acknowledgeWatchlistSchema
>;
