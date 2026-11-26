import bcrypt from "bcryptjs";
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "../../db";
import {
  organizations,
  users,
  type UserRole,
  type VerificationStatus,
} from "../../db/schema";
import { AppError } from "../../lib/errors";
import { eventBus } from "../../lib/events";
import type {
  CreateOrganizationInput,
  ListOrganizationsQuery,
} from "./admin.schemas";

interface PrimaryUserSummary {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

/** List organizations (newest first) along with each organization's primary user summary. */
export async function listOrganizations(filters: ListOrganizationsQuery) {
  const conditions: SQL[] = [];
  if (filters.status) {
    conditions.push(eq(organizations.verificationStatus, filters.status));
  }
  if (filters.type) {
    conditions.push(eq(organizations.type, filters.type));
  }

  const orgRows = await db
    .select()
    .from(organizations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(organizations.createdAt));

  if (orgRows.length === 0) {
    return [];
  }

  const orgIds = orgRows.map((org) => org.id);
  const userRows = await db
    .select({
      id: users.id,
      organizationId: users.organizationId,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
    })
    .from(users)
    .where(inArray(users.organizationId, orgIds))
    .orderBy(asc(users.createdAt));

  const primaryUserByOrgId = new Map<string, PrimaryUserSummary>();
  for (const user of userRows) {
    if (user.organizationId && !primaryUserByOrgId.has(user.organizationId)) {
      primaryUserByOrgId.set(user.organizationId, {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      });
    }
  }

  return orgRows.map((org) => ({
    ...org,
    primaryUser: primaryUserByOrgId.get(org.id) ?? null,
  }));
}

/** Create an organization and its initial user atomically inside a PostgreSQL transaction. */
export async function createOrganizationWithUser(
  input: CreateOrganizationInput
) {
  // Hash password before opening the DB transaction to avoid holding connections idle.
  const passwordHash = await bcrypt.hash(input.user.password, 10);
  const normalizedEmail = input.user.email.trim().toLowerCase();
  const verifiedAt = input.verificationStatus === "VERIFIED" ? new Date() : null;

  const created = await db.transaction(async (tx) => {
    const [organization] = await tx
      .insert(organizations)
      .values({
        name: input.name,
        type: input.type,
        licenseNumber: input.licenseNumber,
        region: input.region,
        verificationStatus: input.verificationStatus,
        verifiedAt,
        orderExpiryMinutes: input.orderExpiryMinutes,
      })
      .returning();

    const [user] = await tx
      .insert(users)
      .values({
        organizationId: organization.id,
        email: normalizedEmail,
        passwordHash,
        fullName: input.user.fullName,
        role: input.type,
      })
      .returning({
        id: users.id,
        organizationId: users.organizationId,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        createdAt: users.createdAt,
      });

    return { organization, user };
  });

  if (
    created.organization.type === "DISTRIBUTOR" &&
    created.organization.verificationStatus === "VERIFIED"
  ) {
    eventBus.emit("catalog.invalidated", {
      reason: "DISTRIBUTOR_STATUS_CHANGED",
      distributorId: created.organization.id,
    });
  }

  return created;
}

/** Update an organization's verification status and trigger cache invalidation for distributors. */
export async function updateVerificationStatus(
  orgId: string,
  verificationStatus: VerificationStatus
) {
  const [existing] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!existing) {
    throw new AppError(404, "NOT_FOUND", "المنشأة غير موجودة");
  }

  const nextVerifiedAt =
    verificationStatus === "VERIFIED"
      ? (existing.verifiedAt ?? new Date())
      : verificationStatus === "PENDING"
        ? null
        : existing.verifiedAt;

  const [updated] = await db
    .update(organizations)
    .set({
      verificationStatus,
      verifiedAt: nextVerifiedAt,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId))
    .returning();

  if (updated.type === "DISTRIBUTOR") {
    eventBus.emit("catalog.invalidated", {
      reason: "DISTRIBUTOR_STATUS_CHANGED",
      distributorId: updated.id,
    });
  }

  return { organization: updated };
}
