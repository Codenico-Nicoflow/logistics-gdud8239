import type { NextFunction, Request, Response } from 'express';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * `https://app.example/` and `https://app.example` are the same origin, but a browser only ever
 * sends the second, while people naturally paste the first into an environment variable. Compared
 * as written, that one slash blocked every login. Reduce both sides to scheme + host + port.
 */
export function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value.trim().replace(/\/+$/, '');
  }
}

/**
 * Refuses a state-changing request that a browser says came from some other site. Cookies are
 * SameSite=Strict already; this is the second lock, for browsers and setups where that is not
 * enough. A request with no Origin header (curl, server-to-server, the test client) is left
 * alone: it cannot be a forged form post from a victim's browser, which always sends one.
 */
export function originCheck(allowedOrigin: string) {
  const allowed = normalizeOrigin(allowedOrigin);
  return (request: Request, response: Response, next: NextFunction): void => {
    const origin = request.headers.origin;
    if (STATE_CHANGING.has(request.method) && origin && normalizeOrigin(origin) !== allowed) {
      response.status(403).json({ statusCode: 403, message: 'הבקשה נחסמה: מקור לא מורשה' });
      return;
    }
    next();
  };
}
