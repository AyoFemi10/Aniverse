/**
 * Image utilities.
 * Images are returned as raw upstream CDN URLs.
 * No proxying — clients load images directly from the CDN.
 */

/** Returns the raw image URL unchanged */
export function proxyImageUrl(rawUrl: string): string {
  return rawUrl ?? '';
}

/** Decode a proxy token (kept for the opt-in proxy route) */
export function decodeProxyUrl(token: string): string {
  return Buffer.from(token, 'base64url').toString('utf8');
}

/** Encode for opt-in proxy use */
export function encodeProxyUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  const token = Buffer.from(rawUrl).toString('base64url');
  return `/api/v1/proxy/${token}`;
}

export const ALLOWED_IMAGE_HOSTS = new Set([
  'aniwaves.ru',
  'cdn.aniwaves.ru',
  'img.aniwaves.ru',
  'static.aniwaves.ru',
  'gogocdn.net',
  'cdn.gogocdn.net',
  'image.tmdb.org',
  'cdn.myanimelist.net',
  'media.kitsu.io',
]);

export function isAllowedImageHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    if (hostname === 'aniwaves.ru' || hostname.endsWith('.aniwaves.ru')) return true;
    return [...ALLOWED_IMAGE_HOSTS].some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}
