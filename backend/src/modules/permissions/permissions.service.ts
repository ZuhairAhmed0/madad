import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { organizations, priceAccessPermissions } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { eventBus } from "../../lib/events";
import type { AuthenticatedUser } from "../../types/express";
import type { ListPermissionsQuery } from "./permissions.schemas";

/** Request price access from a verified distributor on behalf of a pharmacy. */
export async function requestPriceAccess(
  pharmacyId: string,
  distributorId: string
) {
  const [distributor] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, distributorId),
        eq(organizations.type, "DISTRIBUTOR"),
        eq(organizations.verificationStatus, "VERIFIED")
      )
    )
    .limit(1);

  if (!distributor) {
    throw new AppError(404, "NOT_FOUND", "الموزع غير موجود أو غير مفعل");
  }

  const [existing] = await db
    .select()
    .from(priceAccessPermissions)
    .where(
      and(
        eq(priceAccessPermissions.distributorId, distributorId),
        eq(priceAccessPermissions.pharmacyId, pharmacyId)
      )
    )
    .limit(1);

  if (existing) {
    if (existing.status === "APPROVED" || existing.status === "PENDING") {
      return { permission: existing, created: false };
    }

    const [updated] = await db
      .update(priceAccessPermissions)
      .set({
        status: "PENDING",
        updatedAt: new Date(),
      })
      .where(eq(priceAccessPermissions.id, existing.id))
      .returning();

    eventBus.emit("permission.changed", {
      distributorId: updated.distributorId,
      pharmacyId: updated.pharmacyId,
      status: updated.status,
    });

    return { permission: updated, created: false };
  }

  const [inserted] = await db
    .insert(priceAccessPermissions)
    .values({
      distributorId,
      pharmacyId,
      status: "PENDING",
    })
    .onConflictDoNothing({
      target: [
        priceAccessPermissions.distributorId,
        priceAccessPermissions.pharmacyId,
      ],
    })
    .returning();

  if (!inserted) {
    const [concurrentExisting] = await db
      .select()
      .from(priceAccessPermissions)
      .where(
        and(
          eq(priceAccessPermissions.distributorId, distributorId),
          eq(priceAccessPermissions.pharmacyId, pharmacyId)
        )
      )
      .limit(1);

    if (!concurrentExisting) {
      throw new AppError(500, "INTERNAL_SERVER_ERROR", "تعذر إنشاء طلب الصلاحية");
    }

    return { permission: concurrentExisting, created: false };
  }

  eventBus.emit("permission.changed", {
    distributorId: inserted.distributorId,
    pharmacyId: inserted.pharmacyId,
    status: inserted.status,
  });

  return { permission: inserted, created: true };
}

/** List price access permissions scoped to the authenticated pharmacy or distributor. */
export async function listPermissionsForUser(
  authUser: AuthenticatedUser,
  filters: ListPermissionsQuery
) {
  if (!authUser.organizationId) {
    throw new AppError(403, "FORBIDDEN", "لا توجد منشأة مرتبطة بهذا الحساب");
  }

  if (authUser.role === "PHARMACY") {
    const conditions = [
      eq(priceAccessPermissions.pharmacyId, authUser.organizationId),
      ...(filters.status
        ? [eq(priceAccessPermissions.status, filters.status)]
        : []),
    ];

    return db
      .select({
        id: priceAccessPermissions.id,
        distributorId: priceAccessPermissions.distributorId,
        pharmacyId: priceAccessPermissions.pharmacyId,
        status: priceAccessPermissions.status,
        createdAt: priceAccessPermissions.createdAt,
        updatedAt: priceAccessPermissions.updatedAt,
        distributor: {
          id: organizations.id,
          name: organizations.name,
          region: organizations.region,
          salesStatus: organizations.salesStatus,
          orderExpiryMinutes: organizations.orderExpiryMinutes,
        },
      })
      .from(priceAccessPermissions)
      .innerJoin(
        organizations,
        eq(priceAccessPermissions.distributorId, organizations.id)
      )
      .where(and(...conditions))
      .orderBy(desc(priceAccessPermissions.updatedAt));
  }

  if (authUser.role === "DISTRIBUTOR") {
    const conditions = [
      eq(priceAccessPermissions.distributorId, authUser.organizationId),
      ...(filters.status
        ? [eq(priceAccessPermissions.status, filters.status)]
        : []),
    ];

    return db
      .select({
        id: priceAccessPermissions.id,
        distributorId: priceAccessPermissions.distributorId,
        pharmacyId: priceAccessPermissions.pharmacyId,
        status: priceAccessPermissions.status,
        createdAt: priceAccessPermissions.createdAt,
        updatedAt: priceAccessPermissions.updatedAt,
        pharmacy: {
          id: organizations.id,
          name: organizations.name,
          licenseNumber: organizations.licenseNumber,
          region: organizations.region,
          verifiedAt: organizations.verifiedAt,
        },
      })
      .from(priceAccessPermissions)
      .innerJoin(
        organizations,
        eq(priceAccessPermissions.pharmacyId, organizations.id)
      )
      .where(and(...conditions))
      .orderBy(
        sql`CASE WHEN ${priceAccessPermissions.status} = 'PENDING' THEN 0 ELSE 1 END ASC`,
        desc(priceAccessPermissions.updatedAt)
      );
  }

  throw new AppError(403, "FORBIDDEN", "ليست لديك صلاحية لعرض أذونات الأسعار");
}

/** Approve or revoke a pharmacy's price access permission for the owning distributor. */
export async function updatePermissionStatus(
  distributorId: string,
  permissionId: string,
  status: "APPROVED" | "REVOKED"
) {
  const [existing] = await db
    .select()
    .from(priceAccessPermissions)
    .where(eq(priceAccessPermissions.id, permissionId))
    .limit(1);

  if (!existing) {
    throw new AppError(404, "NOT_FOUND", "طلب الصلاحية غير موجود");
  }

  if (existing.distributorId !== distributorId) {
    throw new AppError(403, "FORBIDDEN", "ليست لديك صلاحية لتعديل هذا الطلب");
  }

  const [updated] = await db
    .update(priceAccessPermissions)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(priceAccessPermissions.id, permissionId))
    .returning();

  eventBus.emit("permission.changed", {
    distributorId: updated.distributorId,
    pharmacyId: updated.pharmacyId,
    status: updated.status,
  });

  return { permission: updated };
}
