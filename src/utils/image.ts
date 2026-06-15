/**
 * Image proxy utilities.
 *
 * proxyImageUrl(rawUrl) → "/api/v1/image?url=<base64url-encoded>"
 *
 * The encoded URL is opaque to clients – they never see the upstream domain.
 * The proxy route decodes it, validates the origin, and streams the bytes.
 */

/** Encode a raw upstream image URL into an AniVerse proxy path */
export function proxyImageUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  // Already proxied – don't double-encode
  if (rawUrl.startsWith('/api/v1/image')) return rawUrl;
  const encoded = Buffer.from(rawUrl).toString('base64url');
  return `/api/v1/image?url=${encoded}`;
}

/** Decode the proxy param back to the original URL (used by the route handler) */
export function decodeProxyUrl(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf8');
}

/**
 * Allowlist of upstream image hostnames.
 * Only these origins will be fetched – anything else gets a 403.
 * Add more CDN domains here as needed.
 */
export const ALLOWED_IMAGE_HOSTS = new Set([
  'aniwaves.ru',
  'cdn.aniwaves.ru',
  'img.aniwaves.ru',
  'static.aniwaves.ru',
  // common image CDNs used by anime sites
  'gogocdn.net',
  'cdn.gogocdn.net',
  'img9.9anime.id',
  'image.tmdb.org',
  'cdn.myanimelist.net',
  'media.kitsu.io',
]);

/** Returns true if the decoded URL's hostname is in the allowlist */
export function isAllowedImageHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    // Allow exact match or any subdomain of an allowed host
    return [...ALLOWED_IMAGE_HOSTS].some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}
