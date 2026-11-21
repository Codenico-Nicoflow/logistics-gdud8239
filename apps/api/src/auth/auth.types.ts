import { Company, Role } from '@prisma/client';

/** Claims carried in the access token. */
export type JwtPayload = {
  sub: string;
  username: string;
  role: Role;
  companyScope: Company | null;
  /** Issued-at (seconds), set by the JWT library. */
  iat?: number;
  /** Issued-at in milliseconds. `iat` rounds down to the second, which cannot tell a token issued just
   *  before a password change from one issued just after it. */
  iatMs?: number;
};

/** The authenticated user as attached to the request by the JWT guard. */
export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  companyScope: Company | null;
};

/** Refresh tokens carry a token id so a single session can be revoked. */
export type RefreshPayload = {
  sub: string;
  jti: string;
};
