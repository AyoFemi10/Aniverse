/**
 * Image proxy utilities.
 *
 * proxyImageUrl(rawUrl)
 *   → "https://apis.ayohost.site/proxy/aHR0cHM6Ly9jZG4uYW5pd2F2ZXMucnUv..."
 *
 * The base64url token is opaque to clients — the upstream domain is never exposed.
 * Set PUBLIC_URL in your environment to control the domain prefix.
 * Defaults to an empty string so relative paths work in development.
 *
 * Examples:
 *   PUBLIC_URL=https://apis.ayohost.site  →  https://apis.ayohost.site/proxy/<token>
 *   PUBLIC_URL=(unset)                    →  /proxy/<token>
 */

/** Return the configured public base URL (no trailing slash) */
function publicBase(): string {
  return (process.env.PUBLIC_URL ?? '').replace(/\/+$/, '');
}

/** Encode a raw upstream image URL into an AniVerse proxy URL */
export function proxyImageUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  // Already proxied — don't double-encode
  if (rawUrl.includes('/proxy/')) return rawUrl;
  const token = Buffer.from(rawUrl).toString('base64url');
  return `${publicBase()}/proxy/${token}`;
}

/** Decode the path token back to the original upstream URL */
export function decodeProxyUrl(token: string): string {
  return Buffer.from(token, 'base64url').toString('utf8');
}

/**
 * Allowlist of upstream image hostnames.
 * Only these origins are fetched — anything else gets a 403.
 */
export const ALLOWED_IMAGE_HOSTS = new Set([
  'aniwaves.ru',
  'cdn.aniwaves.ru',
  'img.aniwaves.ru',
  'static.aniwaves.ru',
  'resources.aniwaves.ru',
  // common anime CDN patterns — covers subdomains automatically via endsWith check
  'gogocdn.net',
  'cdn.gogocdn.net',
  'img9.9anime.id',
  'image.tmdb.org',
  'cdn.myanimelist.net',
  'media.kitsu.io',
  // cover any subdomain of aniwaves.ru not explicitly listed
]);

/** Returns true if the decoded URL's hostname is in the allowlist */
export function isAllowedImageHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    // Allow any subdomain of aniwaves.ru (cdn., static., img., etc.)
    if (hostname === 'aniwaves.ru' || hostname.endsWith('.aniwaves.ru')) return true;
    return [...ALLOWED_IMAGE_HOSTS].some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}
