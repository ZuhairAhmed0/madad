import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { db } from "../../db";
import { organizations, users } from "../../db/schema";
import { AppError } from "../../lib/errors";
import type {
  AuthenticatedOrganization,
  AuthenticatedUser,
} from "../../types/express";

interface JoinedAuthRow {
  id: string;
  email: string;
  fullName: string;
  role: AuthenticatedUser["role"];
  organizationId: string | null;
  organization: AuthenticatedOrganization | null;
}

/** Return JWT signing secret or fail fast if misconfigured. */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
}

function shapeAuthenticatedUser(row: JoinedAuthRow): AuthenticatedUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
    organizationId: row.organizationId,
    organization: row.organization?.id ? row.organization : null,
  };
}

/** Reject non-admin users whose organization is not currently VERIFIED. */
export function assertOrganizationVerified(authUser: AuthenticatedUser): void {
  if (
    authUser.role !== "ADMIN" &&
    authUser.organization?.verificationStatus !== "VERIFIED"
  ) {
    throw new AppError(
      403,
      "ORG_NOT_VERIFIED",
      "حساب المنشأة قيد المراجعة أو موقوف من الإدارة",
      { verificationStatus: authUser.organization?.verificationStatus }
    );
  }
}

/** Load live user and organization state (excluding passwordHash) by user ID. */
export async function getAuthenticatedUserById(
  userId: string
): Promise<AuthenticatedUser | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      organizationId: users.organizationId,
      organization: {
        id: organizations.id,
        name: organizations.name,
        type: organizations.type,
        verificationStatus: organizations.verificationStatus,
        region: organizations.region,
        salesStatus: organizations.salesStatus,
        orderExpiryMinutes: organizations.orderExpiryMinutes,
      },
    })
    .from(users)
    .leftJoin(organizations, eq(users.organizationId, organizations.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    return null;
  }

  return shapeAuthenticatedUser(row);
}

/** Authenticate user credentials, enforce organization verification, and issue a 24h JWT. */
export async function login(email: string, password: string) {
  const secret = getJwtSecret();
  const normalizedEmail = email.trim().toLowerCase();

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      organizationId: users.organizationId,
      passwordHash: users.passwordHash,
      organization: {
        id: organizations.id,
        name: organizations.name,
        type: organizations.type,
        verificationStatus: organizations.verificationStatus,
        region: organizations.region,
        salesStatus: organizations.salesStatus,
        orderExpiryMinutes: organizations.orderExpiryMinutes,
      },
    })
    .from(users)
    .leftJoin(organizations, eq(users.organizationId, organizations.id))
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!row) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "البريد الإلكتروني أو كلمة المرور غير صحيحة"
    );
  }

  const passwordValid = await bcrypt.compare(password, row.passwordHash);
  if (!passwordValid) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "البريد الإلكتروني أو كلمة المرور غير صحيحة"
    );
  }

  const authUser = shapeAuthenticatedUser(row);
  assertOrganizationVerified(authUser);

  const token = jwt.sign(
    {
      sub: authUser.id,
      role: authUser.role,
      organizationId: authUser.organizationId,
    },
    secret,
    { expiresIn: "24h" }
  );

  const { organization, ...user } = authUser;
  return { token, user, organization };
}
