/**
 * AniVerse API – Scraper layer (internal only, never exposed to clients).
 *
 * All functions return plain data objects. Source URLs are normalised to
 * AniVerse API paths before leaving this layer – upstream origin is never
 * disclosed in public responses.
 */

import * as cheerio from 'cheerio';
import { fetchHtml, fetchJson } from '../utils/http';
import { logger } from '../utils/logger';
import { ScraperError, NotFoundError } from '../utils/errors';
import { proxyImageUrl } from '../utils/image';
import type { SearchResult, AnimeDetails, Episode, Stream, DiscoveryAnime, Genre, GenreAnime, AnimeInfo } from '../types';

/** Upstream base – internal use only, never returned to clients */
const _UPSTREAM = 'https://aniwaves.ru';
const _EMBED = 'https://play.echovideo.ru';

/** AniVerse public brand name injected into every stream response */
export const BRAND = 'AniVerse';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a relative /watch/slug path to a slug id */
export function hrefToId(href: string): string {
  const m = href.match(/\/watch\/([^/?#]+)/);
  if (m) return m[1];
  return href.replace(/^\/+|\/+$/g, '');
}

/** Internal upstream URL – never returned to clients */
function upstreamUrl(slug: string): string {
  return `${_UPSTREAM}/watch/${slug}`;
}

/** Public AniVerse episode URL (no upstream domain exposed) */
function publicEpisodeUrl(slug: string, ep: number): string {
  return `/api/v1/anime/${slug}/episodes/${ep}/streams`;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function scrapeSearch(keyword: string): Promise<SearchResult[]> {
  const url = `${_UPSTREAM}/filter?keyword=${encodeURIComponent(keyword)}`;

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    logger.error({ err }, 'scrapeSearch: network error');
    throw new ScraperError(`Failed to fetch search results for "${keyword}"`);
  }

  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $('div.item').each((_, el) => {
    const anchor = $(el).find('a').first();
    const nameAnchor = $(el).find('a.name.d-title, a.d-title').first();
    const img = $(el).find('img').first();

    const href = anchor.attr('href') ?? '';
    const title = (nameAnchor.text() || $(el).find('.d-title').text()).trim();
    const image = img.attr('src') ?? img.attr('data-src') ?? '';

    if (!href || !title || title === 'Omiai Aite Wa Oshiego Tsuyokina Mondaiji') return;

    const id = hrefToId(href);

    results.push({
      id,
      title,
      image: proxyImageUrl(image),
      // Public URL points to AniVerse API, not upstream
      url: `/api/v1/anime/${id}`,
    });
  });

  return results;
}

// ─── Anime Details ────────────────────────────────────────────────────────────

export async function scrapeDetails(slug: string): Promise<AnimeDetails> {
  const url = upstreamUrl(slug);

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    logger.error({ err }, 'scrapeDetails: network error');
    throw new ScraperError(`Failed to fetch details for "${slug}"`);
  }

  const $ = cheerio.load(html);

  // Title
  const title =
    $('h2.film-name').text().trim() ||
    $('h1.film-name').text().trim() ||
    $('title').text().replace(/[-|].*$/, '').trim();

  if (!title) {
    throw new NotFoundError('ANIME_NOT_FOUND', `Anime not found: ${slug}`);
  }

  // Description
  let description =
    $('.synopsis .content').first().text().trim() ||
    $('.synopsis').text().trim() ||
    'No description available';
  // Strip "Aired, ..." prefix sometimes injected into description
  description = description.replace(/^Aired,\s+[^,]+,\s*/i, '').trim();

  // Aliases / alternative titles
  const aliases =
    $('.names.font-italic').text().trim() ||
    $('[class*="alias"]').text().trim() ||
    'No aliases available';

  // Air date – prefer meta data attributes then text match
  let aired = 'Unknown';
  const airdateText = html.match(/Date aired:\s*<span><span[^>]*>(.*?)<\/span>/);
  if (airdateText) {
    aired = airdateText[1].trim();
  } else {
    $('[class*="aired"], .fd-item').each((_, el) => {
      const text = $(el).text();
      if (text.toLowerCase().includes('aired') || text.toLowerCase().includes('date')) {
        const val = $(el).find('span').last().text().trim();
        if (val) { aired = val; return false; }
      }
    });
  }

  // Cover image
  const image =
    $('.film-poster img').attr('src') ||
    $('img.film-poster-img').attr('src') ||
    $('meta[property="og:image"]').attr('content') ||
    '';

  // Genres
  const genres: string[] = [];
  $('a[href*="/genre/"]').each((_, el) => {
    const g = $(el).text().trim();
    if (g) genres.push(g);
  });

  // Status
  const status =
    $('.item-list .item:contains("Status") .name').text().trim() ||
    $('[class*="status"]').last().text().trim() ||
    '';

  // Rating
  const rating =
    $('[class*="rating"]').first().text().trim() ||
    $('span.item-head:contains("Score")').next().text().trim() ||
    '';

  return { title, description, aliases, aired, image: proxyImageUrl(image ?? ''), genres, status, rating };
}

// ─── Episodes ─────────────────────────────────────────────────────────────────

export async function scrapeEpisodes(slug: string): Promise<Episode[]> {
  const url = upstreamUrl(slug);

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    logger.error({ err }, 'scrapeEpisodes: network error');
    throw new ScraperError(`Failed to fetch episodes for "${slug}"`);
  }

  const $ = cheerio.load(html);

  let episodeCount = 0;
  const epText = html.match(/Episodes:\s*<span>(\d+)/);
  if (epText) {
    episodeCount = parseInt(epText[1], 10);
  }

  if (!episodeCount) {
    episodeCount = $('a[href*="/episode/"]').length;
  }

  if (!episodeCount) {
    const firstWord = slug.split('-')[0];
    try {
      const searchHtml = await fetchHtml(`${_UPSTREAM}/filter?keyword=${encodeURIComponent(firstWord)}`);
      const re = new RegExp(
        `<a\\s+[^>]*href="\\/watch\\/${slug}"[^>]*>[\\s\\S]*?<span>Ep:\\s*(\\d+)<\\/span>`,
        'i',
      );
      const m = searchHtml.match(re);
      if (m) episodeCount = parseInt(m[1], 10);
    } catch {
      // ignore fallback error
    }
  }

  if (!episodeCount) return [];

  const episodes: Episode[] = [];
  for (let i = 1; i <= episodeCount; i++) {
    // Episode URL points to AniVerse streams endpoint, not upstream
    episodes.push({ number: i, url: publicEpisodeUrl(slug, i) });
  }
  return episodes;
}

// ─── Streams ──────────────────────────────────────────────────────────────────

interface ServerListJson {
  result: string; // HTML string
}

interface SourceJson {
  result?: { url?: string };
}

interface GetSourcesJson {
  sources?: string;
}

export async function scrapeStreams(slug: string, episode: string): Promise<Stream[]> {
  const episodeUrl = `${_UPSTREAM}/watch/${slug}/episode/${episode}`;

  const idMatch = slug.match(/(\d+)$/);
  if (!idMatch) throw new ScraperError(`Cannot extract show ID from slug: ${slug}`);
  const showId = idMatch[1];

  const refererHeaders = { Referer: episodeUrl };

  // Step 1 – Get server list HTML
  const listUrl = `${_UPSTREAM}/ajax/server/list?servers=${showId}&eps=${episode}`;
  let serverHtml: string;
  try {
    const json = await fetchJson<ServerListJson>(listUrl, refererHeaders);
    serverHtml = json.result ?? '';
  } catch (err) {
    logger.error({ err }, 'scrapeStreams: server list fetch failed');
    throw new ScraperError('Failed to fetch server list');
  }

  if (!serverHtml) throw new NotFoundError('STREAM_NOT_FOUND', `No servers for ${slug} ep ${episode}`);

  const $srv = cheerio.load(serverHtml);

  const subLinkId = $srv('[data-link-id]').first().attr('data-link-id');
  const dubLinkId = $srv('[data-type="dub"] [data-link-id]').first().attr('data-link-id');

  logger.debug({ subLinkId, dubLinkId }, 'scrapeStreams: resolved link IDs');

  const streams: Stream[] = [];

  async function resolveM3u8(linkId: string, type: 'SUB' | 'DUB'): Promise<void> {
    try {
      // Step 2 – get embed URL
      const srcUrl = `${_UPSTREAM}/ajax/sources?id=${encodeURIComponent(linkId)}&asi=0&autoPlay=0`;
      const srcData = await fetchJson<SourceJson>(srcUrl, refererHeaders);
      const embedUrl = srcData?.result?.url;
      if (!embedUrl) {
        logger.warn({ linkId, type }, 'No embed URL returned');
        return;
      }

      // Step 3 – fetch embed page, extract data-id
      const embedHtml = await fetchHtml(embedUrl, refererHeaders);
      const $embed = cheerio.load(embedHtml);
      const sourceId =
        $embed('[data-id]').first().attr('data-id') ||
        embedHtml.match(/data-id="([^"]+)"/)?.[1];

      if (!sourceId) {
        logger.warn({ linkId, type }, 'No data-id in embed page');
        return;
      }

      // Step 4 – getSources
      const getSrcUrl = `${_EMBED}/embed-1/getSources?id=${sourceId}`;
      const getSrcData = await fetchJson<GetSourcesJson>(getSrcUrl, refererHeaders);
      const m3u8 = getSrcData?.sources;

      if (!m3u8) {
        logger.warn({ linkId, type }, 'No sources in getSources response');
        return;
      }

      streams.push({
        type,
        url: m3u8,
        provider: BRAND,
        // Referer is required by the CDN – clients must forward it
        headers: { Referer: episodeUrl },
      });
    } catch (err) {
      logger.error({ err, linkId, type }, 'resolveM3u8 error');
    }
  }

  const tasks: Promise<void>[] = [];
  if (subLinkId) tasks.push(resolveM3u8(subLinkId, 'SUB'));
  if (dubLinkId) tasks.push(resolveM3u8(dubLinkId, 'DUB'));

  await Promise.all(tasks);

  return streams;
}

// ─── Discovery (Trending / Recent / Popular) ──────────────────────────────────

export async function scrapeDiscovery(page: 'trending' | 'recent' | 'popular'): Promise<DiscoveryAnime[]> {
  const urlMap: Record<string, string> = {
    trending: `${_UPSTREAM}/trending`,
    recent: `${_UPSTREAM}/recently-updated`,
    popular: `${_UPSTREAM}/most-popular`,
  };

  const url = urlMap[page] ?? _UPSTREAM;

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    logger.error({ err }, `scrapeDiscovery(${page}): network error`);
    throw new ScraperError(`Failed to fetch ${page} list`);
  }

  const $ = cheerio.load(html);
  const results: DiscoveryAnime[] = [];

  $('div.item, .flw-item, .film_list-wrap .item').each((_, el) => {
    const anchor = $(el).find('a').first();
    const nameAnchor = $(el).find('a.name.d-title, a.d-title, .film-name').first();
    const img = $(el).find('img').first();
    const epText = $(el).find('[class*="ep"], .fd-infor span').text().trim();

    const href = anchor.attr('href') ?? '';
    const title = (nameAnchor.text() || $(el).find('.d-title').text()).trim();
    const image = img.attr('src') ?? img.attr('data-src') ?? '';

    if (!href || !title) return;

    const id = hrefToId(href);
    const epMatch = epText.match(/(\d+)/);

    results.push({
      id,
      title,
      image: proxyImageUrl(image),
      url: `/api/v1/anime/${id}`,
      episodes: epMatch ? parseInt(epMatch[1], 10) : undefined,
    });
  });

  return results;
}

// ─── Genres ───────────────────────────────────────────────────────────────────

/**
 * Scrape the full list of genres from AniWave's filter/genre navigation.
 * The genre list is scraped from the site's genre sidebar or nav section.
 */
export async function scrapeGenres(): Promise<Genre[]> {
  const url = `${_UPSTREAM}/genre`;

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch {
    try {
      html = await fetchHtml(_UPSTREAM);
    } catch (err) {
      logger.error({ err }, 'scrapeGenres: network error');
      throw new ScraperError('Failed to fetch genre list');
    }
  }

  const $ = cheerio.load(html);
  const genres: Genre[] = [];
  const seen = new Set<string>();

  $('a[href*="/genre/"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const name = $(el).text().trim();

    const slugMatch = href.match(/\/genre\/([^/?#]+)/);
    if (!slugMatch || !name || seen.has(slugMatch[1])) return;

    const id = slugMatch[1];
    seen.add(id);
    genres.push({
      id,
      name,
      // Point to AniVerse API genre endpoint
      url: `/api/v1/genres/${id}`,
    });
  });

  return genres;
}

/**
 * Scrape anime belonging to a specific genre, with optional pagination.
 * AniWave genre pages follow: /genre/<slug>?page=N
 */
export async function scrapeGenreAnime(
  genre: string,
  page = 1,
): Promise<{ items: GenreAnime[]; hasNextPage: boolean }> {
  const url = `${_UPSTREAM}/genre/${encodeURIComponent(genre)}?page=${page}`;

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    logger.error({ err }, 'scrapeGenreAnime: network error');
    throw new ScraperError(`Failed to fetch anime for genre "${genre}"`);
  }

  const $ = cheerio.load(html);

  if ($('div.item, .flw-item').length === 0) {
    throw new NotFoundError('ANIME_NOT_FOUND', `No anime found for genre: ${genre}`);
  }

  const items: GenreAnime[] = [];

  $('div.item, .flw-item').each((_, el) => {
    const anchor = $(el).find('a').first();
    const nameAnchor = $(el).find('a.name.d-title, a.d-title').first();
    const img = $(el).find('img').first();
    const epText = $(el).find('[class*="ep"], .fd-infor span').text().trim();
    const type = $(el).find('[class*="type"], .fdi-item').first().text().trim();

    const href = anchor.attr('href') ?? '';
    const title = (nameAnchor.text() || $(el).find('.d-title').text()).trim();
    const image = img.attr('src') ?? img.attr('data-src') ?? '';

    if (!href || !title) return;

    const id = hrefToId(href);
    const epMatch = epText.match(/(\d+)/);

    items.push({
      id,
      title,
      image: proxyImageUrl(image),
      url: `/api/v1/anime/${id}`,
      episodes: epMatch ? parseInt(epMatch[1], 10) : undefined,
      type: type || undefined,
    });
  });

  const hasNextPage =
    $('a[href*="page="]').filter((_, el) => {
      const t = $(el).text().toLowerCase();
      return t.includes('next') || t === '›' || t === '»';
    }).length > 0 ||
    $('ul.pagination .page-item.active').next('.page-item').length > 0;

  return { items, hasNextPage };
}

// ─── Info (details + episodes combined) ──────────────────────────────────────

/**
 * Returns a rich "info" object combining scrapeDetails + scrapeEpisodes in
 * a single network-efficient call. Both fetches hit the same URL so the HTML
 * is fetched once and parsed twice rather than making two round trips.
 */
export async function scrapeInfo(slug: string): Promise<AnimeInfo> {
  const url = upstreamUrl(slug);

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    logger.error({ err }, 'scrapeInfo: network error');
    throw new ScraperError(`Failed to fetch info for "${slug}"`);
  }

  const $ = cheerio.load(html);

  // ── Title ──────────────────────────────────────────────────────────────────
  const title =
    $('h2.film-name').text().trim() ||
    $('h1.film-name').text().trim() ||
    $('title').text().replace(/[-|].*$/, '').trim();

  if (!title) {
    throw new NotFoundError('ANIME_NOT_FOUND', `Anime not found: ${slug}`);
  }

  // ── Description ────────────────────────────────────────────────────────────
  let description =
    $('.synopsis .content').first().text().trim() ||
    $('.synopsis').text().trim() ||
    'No description available';
  description = description.replace(/^Aired,\s+[^,]+,\s*/i, '').trim();

  // ── Aliases ────────────────────────────────────────────────────────────────
  const aliases =
    $('.names.font-italic').text().trim() ||
    $('[class*="alias"]').text().trim() ||
    'No aliases available';

  // ── Air date ───────────────────────────────────────────────────────────────
  let aired = 'Unknown';
  const airdateText = html.match(/Date aired:\s*<span><span[^>]*>(.*?)<\/span>/);
  if (airdateText) {
    aired = airdateText[1].trim();
  }

  // ── Cover image ────────────────────────────────────────────────────────────
  const image =
    $('.film-poster img').attr('src') ||
    $('img.film-poster-img').attr('src') ||
    $('meta[property="og:image"]').attr('content') ||
    '';

  // ── Genres ─────────────────────────────────────────────────────────────────
  const genres: string[] = [];
  $('a[href*="/genre/"]').each((_, el) => {
    const g = $(el).text().trim();
    if (g) genres.push(g);
  });

  // ── Status ─────────────────────────────────────────────────────────────────
  const status =
    $('.item-list .item:contains("Status") .name').text().trim() ||
    $('[class*="status"]').last().text().trim() ||
    '';

  // ── Rating ─────────────────────────────────────────────────────────────────
  const rating =
    $('[class*="rating"]').first().text().trim() ||
    $('span.item-head:contains("Score")').next().text().trim() ||
    '';

  // ── Episodes (same HTML page, no extra fetch) ───────────────────────────────
  let episodeCount = 0;
  const epText = html.match(/Episodes:\s*<span>(\d+)/);
  if (epText) {
    episodeCount = parseInt(epText[1], 10);
  }
  if (!episodeCount) {
    episodeCount = $('a[href*="/episode/"]').length;
  }
  // Fallback: search for episode count via API
  if (!episodeCount) {
    const firstWord = slug.split('-')[0];
    try {
      const searchHtml = await fetchHtml(
        `${_UPSTREAM}/filter?keyword=${encodeURIComponent(firstWord)}`,
      );
      const re = new RegExp(
        `<a\\s+[^>]*href="\\/watch\\/${slug}"[^>]*>[\\s\\S]*?<span>Ep:\\s*(\\d+)<\\/span>`,
        'i',
      );
      const m = searchHtml.match(re);
      if (m) episodeCount = parseInt(m[1], 10);
    } catch {
      // ignore
    }
  }

  const episodes: Episode[] = [];
  for (let i = 1; i <= episodeCount; i++) {
    episodes.push({ number: i, url: publicEpisodeUrl(slug, i) });
  }

  return {
    id: slug,
    title,
    description,
    aliases,
    aired,
    image: proxyImageUrl(image ?? ''),
    genres,
    status,
    rating,
    totalEpisodes: episodeCount,
    episodes,
  };
}
