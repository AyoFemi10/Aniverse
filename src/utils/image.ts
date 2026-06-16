/**
 * Image utilities.
 *
 * Images are returned as raw upstream URLs (static.aniwaves.ru/...).
 * The image proxy route still exists for opt-in use but is no longer
 * applied automatically — clients load images directly from the CDN.
 */

/** Return the configured public base URL (no trailing slash) */
function publicBase(): string {
  return (process.env.PUBLIC_URL ?? '').replace(/\/+$/, '');
}

/**
 * Returns the image URL for use in API responses.
 * Currently returns the raw upstream URL directly so browsers can load
 * images without going through the proxy.
 */
export function proxyImageUrl(rawUrl: string): string {
  // Return the raw CDN URL — no proxy encoding
  return rawUrl ?? '';
}

/** Encode a raw upstream image URL into an AniVerse proxy URL (opt-in) */
export function encodeProxyUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  if (rawUrl.includes('/api/v1/proxy/')) return rawUrl;
  const token = Buffer.from(rawUrl).toString('base64url');
  return `${publicBase()}/api/v1/proxy/${token}`;
}

/** Decode a proxy token back to the original upstream URL */
export function decodeProxyUrl(token: string): string {
  return Buffer.from(token, 'base64url').toString('utf8');
}

/**
 * Allowlist of upstream image hostnames (used by the opt-in proxy route).
 */
export const ALLOWED_IMAGE_HOSTS = new Set([
  'aniwaves.ru',
  'cdn.aniwaves.ru',
  'img.aniwaves.ru',
  'static.aniwaves.ru',
  'resources.aniwaves.ru',
  'gogocdn.net',
  'cdn.gogocdn.net',
  'img9.9anime.id',
  'image.tmdb.org',
  'cdn.myanimelist.net',
  'media.kitsu.io',
]);

/** Returns true if the hostname is allowed for proxying */
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
