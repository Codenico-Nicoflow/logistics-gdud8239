import zxcvbn from 'zxcvbn';

export const PASSWORD_MIN_LENGTH = 12;
/** bcrypt silently ignores everything past 72 bytes, so a longer password would be a lie. */
export const PASSWORD_MAX_BYTES = 72;
/** zxcvbn scores 0–4; 3 means "safely unguessable with throttling", and a plain English phrase of
 *  common words or a keyboard walk scores below it even when it is long. */
const MIN_SCORE = 3;

/**
 * One rule for every place a password is chosen. Returns the Hebrew reason a password is refused, or
 * null if it is acceptable. Length alone is a poor test ("passwordpassword" is 16 characters), so the
 * strength estimate also knows the usual dictionary words, names, dates, repeats and keyboard
 * patterns, and is told this person's own username and name so those cannot be used either.
 */
export function checkPassword(password: string, own: { username?: string; displayName?: string } = {}): string | null {
  if ([...password].length < PASSWORD_MIN_LENGTH) return `הסיסמה חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים`;
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) return 'הסיסמה ארוכה מדי';

  const lower = password.toLowerCase();
  const username = own.username?.trim().toLowerCase();
  if (username && username.length >= 3 && lower.includes(username)) return 'הסיסמה לא יכולה להכיל את שם המשתמש';

  // Three letters or more: a two-letter name part would match inside half the words in the language.
  const inputs = [own.username, ...(own.displayName?.split(/\s+/) ?? [])].filter((x): x is string => !!x && x.length >= 3);
  const result = zxcvbn(password, inputs);
  if (result.sequence.some((m) => m.pattern === 'dictionary' && m.dictionary_name === 'user_inputs')) {
    return 'הסיסמה לא יכולה להכיל את השם שלך או את שם המשתמש';
  }
  if (result.score < MIN_SCORE) {
    return 'הסיסמה קלה מדי לניחוש. נסו כמה מילים לא קשורות זו לזו, או צירוף ארוך יותר';
  }
  return null;
}
