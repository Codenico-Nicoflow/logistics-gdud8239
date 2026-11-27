export const MAX_LOGO_BYTES = 512 * 1024;

export type LogoMime = 'image/png' | 'image/jpeg';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

const startsWith = (bytes: Uint8Array, magic: number[]): boolean => magic.every((b, i) => bytes[i] === b);

/**
 * What the bytes really are, from their own header. The declared content type is only the client's
 * claim, and SVG is refused on purpose: it can carry script, and the logo is served from our own origin.
 */
export function sniffLogo(bytes: Uint8Array): LogoMime | null {
  if (startsWith(bytes, PNG)) return 'image/png';
  if (startsWith(bytes, JPEG)) return 'image/jpeg';
  return null;
}
