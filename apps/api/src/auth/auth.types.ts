import { Company, Role } from '@prisma/client';

/** Claims carried in the access token. */
export type JwtPayload = {
  sub: string;
  username: string;
  role: Role;
  companyScope: Company | null;
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
