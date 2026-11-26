import { z } from "zod";

export const createOrderSchema = z.object({
  distributorId: z.uuid("معرف الموزع غير صالح"),
  items: z
    .array(
      z.object({
        listingId: z.uuid("معرف الصنف غير صالح"),
        quantity: z
          .number()
          .int("الكمية يجب أن تكون عدداً صحيحاً")
          .positive("الكمية يجب أن تكون أكبر من صفر")
          .max(100_000, "الكمية تتجاوز الحد الأقصى المسموح"),
        expectedPriceVersion: z
          .number()
          .int("إصدار السعر يجب أن يكون عدداً صحيحاً")
          .positive("إصدار السعر غير صالح"),
      })
    )
    .min(1, "يجب إضافة صنف واحد على الأقل")
    .max(100, "الحد الأقصى للأصناف في الطلبية الواحدة هو 100 صنف")
    .refine(
      (items) => new Set(items.map((item) => item.listingId)).size === items.length,
      { message: "لا يمكن تكرار نفس الصنف في الطلبية الواحدة" }
    ),
});

export const listOrdersQuerySchema = z.object({
  status: z
    .enum([
      "PENDING_CONFIRMATION",
      "CONFIRMED",
      "EXPIRED_CANCELLED",
      "CANCELLED",
    ])
    .optional(),
});

export const orderIdParamSchema = z.object({
  id: z.uuid("معرف الطلبية غير صالح"),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
