import { z } from "zod";

const verificationStatusSchema = z.enum(["PENDING", "VERIFIED", "SUSPENDED"]);
const orgTypeSchema = z.enum(["PHARMACY", "DISTRIBUTOR"]);

export const listOrganizationsQuerySchema = z.object({
  status: verificationStatusSchema.optional(),
  type: orgTypeSchema.optional(),
});

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "اسم المنشأة مطلوب"),
  type: orgTypeSchema,
  licenseNumber: z.string().trim().min(2, "رقم الترخيص مطلوب"),
  region: z.string().trim().min(2, "المنطقة مطلوبة"),
  verificationStatus: verificationStatusSchema.default("PENDING"),
  orderExpiryMinutes: z.number().int().positive().default(60),
  user: z.object({
    fullName: z.string().trim().min(2, "الاسم الكامل مطلوب"),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email("البريد الإلكتروني غير صالح")),
    password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
  }),
});

export const verifyOrganizationSchema = z.object({
  id: z.uuid("معرف المنشأة غير صالح"),
  verificationStatus: verificationStatusSchema,
});

export type ListOrganizationsQuery = z.infer<
  typeof listOrganizationsQuerySchema
>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type VerifyOrganizationInput = z.infer<typeof verifyOrganizationSchema>;
