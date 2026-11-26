import type { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "../db/schema";
import { AppError } from "../lib/errors";
import {
  assertOrganizationVerified,
  getAuthenticatedUserById,
  getJwtSecret,
} from "../modules/auth/auth.service";

function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.madad_token;
  if (typeof cookieToken === "string" && cookieToken.trim().length > 0) {
    return cookieToken.trim();
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken.length > 0) {
      return bearerToken;
    }
  }

  return null;
}

function verifyTokenSubject(token: string, secret: string): string {
  try {
    const decoded = jwt.verify(token, secret);
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof decoded.sub !== "string" ||
      decoded.sub.length === 0
    ) {
      throw new AppError(401, "UNAUTHORIZED", "يرجى تسجيل الدخول للمتابعة");
    }
    return decoded.sub;
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(401, "UNAUTHORIZED", "يرجى تسجيل الدخول للمتابعة");
  }
}

/** Verify JWT and hydrate live user + organization verification status from PostgreSQL. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const secret = getJwtSecret();
  const token = extractToken(req);

  if (!token) {
    throw new AppError(401, "UNAUTHORIZED", "يرجى تسجيل الدخول للمتابعة");
  }

  const userId = verifyTokenSubject(token, secret);
  const authUser = await getAuthenticatedUserById(userId);

  if (!authUser) {
    throw new AppError(401, "UNAUTHORIZED", "يرجى تسجيل الدخول للمتابعة");
  }

  assertOrganizationVerified(authUser);

  req.user = authUser;
  next();
};

/** Restrict route access to one of the specified user roles. */
export function requireRole(...allowedRoles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHORIZED", "يرجى تسجيل الدخول للمتابعة");
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "ليست لديك صلاحية لتنفيذ هذا الإجراء"
      );
    }

    next();
  };
}
