export const ACCESS_COOKIE = 'logistics_access';
export const REFRESH_COOKIE = 'logistics_refresh';

/** Wrong passwords in a row before an account locks. */
export const LOCKOUT_AFTER_FAILURES = 5;
/** First lock lasts this long; each further failure doubles it, up to the cap. */
export const LOCKOUT_BASE_MINUTES = 15;
export const LOCKOUT_MAX_MINUTES = 60;
/** Failed logins from ONE IP in the window below before that IP is refused. The unit shares a single
 *  network address, so this is deliberately high: a few people fumbling passwords must never lock
 *  everyone out, while a script spraying guesses across accounts still hits it within minutes.
 *  Overridable with LOGIN_IP_FAILURES_PER_15MIN. */
export const LOGIN_IP_FAILURES_DEFAULT = 500;
export const LOGIN_IP_FAILURE_WINDOW_MS = 15 * 60_000;
/** A refresh token revoked this recently was most likely rotated by a second tab, not stolen. */
export const REFRESH_REUSE_GRACE_MS = 10_000;

/** bcrypt cost factor. 12 is the project floor; do not lower it. */
export const BCRYPT_ROUNDS = 12;
