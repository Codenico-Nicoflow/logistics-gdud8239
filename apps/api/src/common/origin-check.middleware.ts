import type { NextFunction, Request, Response } from 'express';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Refuses a state-changing request that a browser says came from some other site. Cookies are
 * SameSite=Strict already; this is the second lock, for browsers and setups where that is not
 * enough. A request with no Origin header (curl, server-to-server, the test client) is left
 * alone: it cannot be a forged form post from a victim's browser, which always sends one.
 */
export function originCheck(allowedOrigin: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const origin = request.headers.origin;
    if (STATE_CHANGING.has(request.method) && origin && origin !== allowedOrigin) {
      response.status(403).json({ statusCode: 403, message: 'הבקשה נחסמה: מקור לא מורשה' });
      return;
    }
    next();
  };
}
