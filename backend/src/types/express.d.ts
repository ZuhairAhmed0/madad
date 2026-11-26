import type {
  OrgType,
  SalesStatus,
  UserRole,
  VerificationStatus,
} from "../db/schema";

export interface AuthenticatedOrganization {
  id: string;
  name: string;
  type: OrgType;
  verificationStatus: VerificationStatus;
  region: string;
  salesStatus: SalesStatus;
  orderExpiryMinutes: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  organizationId: string | null;
  organization: AuthenticatedOrganization | null;
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: AuthenticatedUser;
    }
  }
}

export {};
