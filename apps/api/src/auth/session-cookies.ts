import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import type { TokenPair } from './auth.service';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './auth.constants';

/**
 * Sets and clears the two session cookies. Shared by every route that can start a session (password
 * login, setup link, passkey), so they all hand out the same cookie, flags included.
 *
 * Tokens live in httpOnly cookies so page scripts cannot read them, which removes the XSS-to-token-theft
 * path that localStorage leaves open.
 */
@Injectable()
export class SessionCookies {
  constructor(private readonly config: ConfigService) {}

  private base(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<string>('COOKIE_SECURE') === 'true',
      // Strict: every call is first-party (the SPA and /api share the Vercel origin), so the cookie
      // never has a reason to travel on a cross-site request.
      sameSite: 'strict',
      path: '/',
    };
  }

  set(response: Response, tokens: TokenPair): void {
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL') ?? '15m';
    const accessMinutes = Number(/^(\d+)m$/.exec(accessTtl)?.[1] ?? 15);
    response.cookie(ACCESS_COOKIE, tokens.accessToken, { ...this.base(), expires: new Date(Date.now() + accessMinutes * 60_000) });
    response.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...this.base(), expires: tokens.refreshExpiresAt });
  }

  clear(response: Response): void {
    response.clearCookie(ACCESS_COOKIE, this.base());
    response.clearCookie(REFRESH_COOKIE, this.base());
  }
}
