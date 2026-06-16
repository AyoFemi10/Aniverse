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
import type { SearchResult, AnimeDetails, Episode, Stream, DiscoveryAnime, Genre, GenreAnime, AnimeInfo, TopAnime, ScheduleDay, ScheduleEntry } from '../types';

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
  // Title � extract from <title> tag first (most reliable), then fall back to DOM
  const rawPageTitle = $('title').text().trim();
  const titleFromTag = rawPageTitle.includes(' - ') ? rawPageTitle.split(' - ').slice(1).join(' - ').split(/\s*[��]\s*(?:Watch|Stream|Online)/i)[0].trim() : '';
  const title = (titleFromTag && !titleFromTag.toLowerCase().startsWith('aniwave')) ? titleFromTag :
    $('h2.film-name, h1.film-name, .film-name').filter((_,el) => !$(el).text().trim().toLowerCase().includes('aniwave')).first().text().trim() || titleFromTag;
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

// ─── Discovery (REPLACEMENT — replaces old scrapeDiscovery) ──────────────────

const DISCOVERY_URLS: Record<string, string[]> = {
  trending:  [`${_UPSTREAM}/home`, `${_UPSTREAM}/trending`, `${_UPSTREAM}/top-airing`],
  recent:    [`${_UPSTREAM}/recently-updated`, `${_UPSTREAM}/home`, `${_UPSTREAM}/latest`],
  popular:   [`${_UPSTREAM}/most-popular`, `${_UPSTREAM}/home`, `${_UPSTREAM}/popular`],
  newest:    [`${_UPSTREAM}/newest`],
  added:     [`${_UPSTREAM}/added`],
  completed: [`${_UPSTREAM}/completed`],
};

export async function scrapeDiscovery(
  page: 'trending' | 'recent' | 'popular' | 'newest' | 'added' | 'completed',
  pageNum = 1,
): Promise<DiscoveryAnime[]> {
  const candidates = DISCOVERY_URLS[page] ?? [`${_UPSTREAM}/home`];
  let html = '';
  for (const baseUrl of candidates) {
    const url = pageNum > 1 ? `${baseUrl}?page=${pageNum}` : baseUrl;
    try {
      const fetched = await fetchHtml(url);
      if (fetched.includes('/watch/')) { html = fetched; break; }
    } catch { /* try next */ }
  }
  if (!html) { logger.warn({ page }, `scrapeDiscovery(${page}): all candidates failed`); return []; }
  const $ = cheerio.load(html);
  const results: DiscoveryAnime[] = [];
  const seen = new Set<string>();
  $('div.item, .flw-item, .film_list-wrap .item').each((_, el) => {
    const anchor     = $(el).find('a').first();
    const nameAnchor = $(el).find('a.name.d-title, a.d-title, .film-name').first();
    const img        = $(el).find('img').first();
    const epText     = $(el).find('[class*="ep"], .fd-infor span').text().trim();
    const href  = anchor.attr('href') ?? '';
    const title = (nameAnchor.text() || $(el).find('.d-title').text()).trim();
    const image = img.attr('src') ?? img.attr('data-src') ?? '';
    if (!href || !title || !href.includes('/watch/')) return;
    const id = hrefToId(href);
    if (seen.has(id)) return;
    seen.add(id);
    const epMatch = epText.match(/(\d+)/);
    results.push({ id, title, image: proxyImageUrl(image), url: `/api/v1/anime/${id}`, episodes: epMatch ? parseInt(epMatch[1], 10) : undefined });
  });
  return results;
}

// ─── Latest Episodes (home page tab: all/sub/dub/chinese/trending/random) ─────
//
// AniWave's home page loads the "Latest Episode" section via AJAX.
// The endpoint is /ajax/home/widget/latest-episode?page=1
// with an optional type= param: sub | dub | chinese | trending | random
// Falls back to scraping the home page directly if the AJAX call fails.

interface LatestEpAjax { status: boolean; html: string; }

export async function scrapeLatestEpisodes(
  filter: 'all' | 'sub' | 'dub' | 'chinese' | 'trending' | 'random' = 'all',
): Promise<DiscoveryAnime[]> {
  // Try AJAX endpoint first (what the site actually uses for the tab filter)
  const typeParam = filter === 'all' ? '' : `&type=${filter}`;
  const ajaxUrl = `${_UPSTREAM}/ajax/home/widget/latest-episode?page=1${typeParam}`;

  let html = '';
  try {
    const json = await fetchJson<LatestEpAjax>(ajaxUrl, { Referer: `${_UPSTREAM}/home` });
    if (json?.html) html = json.html;
  } catch { /* fall through to page scrape */ }

  // Fallback: scrape /home directly and use the first card section
  if (!html) {
    try {
      const pageHtml = await fetchHtml(`${_UPSTREAM}/home`);
      if (pageHtml.includes('/watch/')) html = pageHtml;
    } catch { /* give up */ }
  }

  if (!html) return [];

  const $ = cheerio.load(html);
  const results: DiscoveryAnime[] = [];
  const seen = new Set<string>();

  $('div.item, .flw-item, .item').each((_, el) => {
    const anchor     = $(el).find('a').first();
    const nameAnchor = $(el).find('a.name.d-title, a.d-title').first();
    const img        = $(el).find('img').first();
    const epBadge    = $(el).find('[class*="ep"], .tick-eps, .fdi-item').first().text().trim();
    const typeBadge  = $(el).find('[class*="type"], .tick-dub, .tick-sub').first().text().trim();
    const href  = anchor.attr('href') ?? '';
    const title = (nameAnchor.text() || $(el).find('.d-title').text()).trim();
    const image = img.attr('src') ?? img.attr('data-src') ?? '';
    if (!href || !title || !href.includes('/watch/')) return;
    const id = hrefToId(href);
    if (seen.has(id)) return;
    seen.add(id);
    const epMatch = epBadge.match(/(\d+)/);
    results.push({ id, title, image: proxyImageUrl(image), url: `/api/v1/anime/${id}`, episodes: epMatch ? parseInt(epMatch[1], 10) : undefined, type: typeBadge || undefined });
  });

  return results;
}

// ─── Top Anime (day / week / month) ──────────────────────────────────────────
// Scraped from /home — "Top Airing", "Most Popular", "Top Upcoming" sections.
// Each section has a tab for day/week/month powered by an AJAX widget.

interface TopAjax { status: boolean; html: string; }

export async function scrapeTopAnime(period: 'day' | 'week' | 'month' = 'week'): Promise<TopAnime[]> {
  // Try the AJAX widget endpoint
  const ajaxUrl = `${_UPSTREAM}/ajax/home/widget/top-airing?type=${period}`;
  let html = '';
  try {
    const json = await fetchJson<TopAjax>(ajaxUrl, { Referer: `${_UPSTREAM}/home` });
    if (json?.html) html = json.html;
  } catch { /* fall through */ }

  // Fallback: parse home page
  if (!html) {
    try {
      const pageHtml = await fetchHtml(`${_UPSTREAM}/home`);
      if (pageHtml.includes('/watch/')) html = pageHtml;
    } catch { return []; }
  }

  const $ = cheerio.load(html);
  const results: TopAnime[] = [];
  const seen = new Set<string>();

  // Top anime are typically in an ordered list with rank numbers
  $('div.item, .flw-item, .top-item, li[class*="item"]').each((_, el) => {
    const anchor     = $(el).find('a').first();
    const nameAnchor = $(el).find('a.d-title, .film-name, h3, .name').first();
    const img        = $(el).find('img').first();
    const rankEl     = $(el).find('[class*="rank"], .number, span.num').first().text().trim();
    const scoreEl    = $(el).find('[class*="score"], .rate, .rating').first().text().trim();
    const typeEl     = $(el).find('[class*="type"], .fdi-item').first().text().trim();
    const href  = anchor.attr('href') ?? '';
    const title = (nameAnchor.text() || $(el).find('.d-title').text()).trim();
    const image = img.attr('src') ?? img.attr('data-src') ?? '';
    if (!href || !title || !href.includes('/watch/')) return;
    const id = hrefToId(href);
    if (seen.has(id)) return;
    seen.add(id);
    const rankNum = rankEl.match(/\d+/);
    results.push({ rank: rankNum ? parseInt(rankNum[0], 10) : results.length + 1, id, title, image: proxyImageUrl(image), url: `/api/v1/anime/${id}`, score: scoreEl || undefined, type: typeEl || undefined });
  });

  return results;
}

// ─── Schedule ─────────────────────────────────────────────────────────────────
// AniWave shows an airing schedule. The AJAX endpoint is:
// /ajax/home/widget/schedule?day=0 (0=Sunday ... 6=Saturday, or name-based)

interface ScheduleAjax { status: boolean; html: string; }

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export async function scrapeSchedule(): Promise<ScheduleDay[]> {
  const today = new Date();
  const schedule: ScheduleDay[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayIndex = d.getDay(); // 0-6
    const dayName  = DAY_NAMES[dayIndex];
    const dateStr  = d.toISOString().slice(0, 10);

    let html = '';
    try {
      const json = await fetchJson<ScheduleAjax>(
        `${_UPSTREAM}/ajax/home/widget/schedule?day=${dayIndex}`,
        { Referer: `${_UPSTREAM}/home` }
      );
      if (json?.html) html = json.html;
    } catch { /* skip this day */ }

    if (!html) { schedule.push({ day: dayName, date: dateStr, entries: [] }); continue; }

    const $ = cheerio.load(html);
    const entries: import('../types').ScheduleEntry[] = [];

    $('div.item, .flw-item, li, .schedule-item').each((_, el) => {
      const anchor = $(el).find('a').first();
      const title  = $(el).find('a.d-title, .film-name, .name').first().text().trim() || anchor.text().trim();
      const img    = $(el).find('img').first();
      const href   = anchor.attr('href') ?? '';
      const epText = $(el).find('[class*="ep"], .ep-item').text().trim();
      const time   = $(el).find('[class*="time"], .schedule-time, time').text().trim();
      if (!href || !title || !href.includes('/watch/')) return;
      const id = hrefToId(href);
      const epMatch = epText.match(/(\d+)/);
      entries.push({ id, title, image: proxyImageUrl(img.attr('src') ?? img.attr('data-src') ?? ''), url: `/api/v1/anime/${id}`, episode: epMatch ? parseInt(epMatch[1], 10) : undefined, airingAt: time || undefined });
    });

    schedule.push({ day: dayName, date: dateStr, entries });
  }

  return schedule;
}

// ─── A-Z List ─────────────────────────────────────────────────────────────────
// GET /az-list/{LETTER}?page=N  (0-9 for numbers, "other" for #)

export async function scrapeAzList(letter: string, page = 1): Promise<{ items: DiscoveryAnime[]; hasNextPage: boolean }> {
  const letterPath = letter === '0-9' ? '0-9' : letter === '#' ? 'other' : encodeURIComponent(letter.toUpperCase());
  const url = page > 1 ? `${_UPSTREAM}/az-list/${letterPath}?page=${page}` : `${_UPSTREAM}/az-list/${letterPath}`;

  let html = '';
  try { html = await fetchHtml(url); }
  catch (err) { logger.error({ err }, `scrapeAzList(${letter}): network error`); return { items: [], hasNextPage: false }; }

  const $ = cheerio.load(html);
  const items: DiscoveryAnime[] = [];
  const seen = new Set<string>();

  $('div.item, .flw-item').each((_, el) => {
    const anchor     = $(el).find('a').first();
    const nameAnchor = $(el).find('a.name.d-title, a.d-title').first();
    const img        = $(el).find('img').first();
    const href  = anchor.attr('href') ?? '';
    const title = (nameAnchor.text() || $(el).find('.d-title').text()).trim();
    const image = img.attr('src') ?? img.attr('data-src') ?? '';
    if (!href || !title || !href.includes('/watch/')) return;
    const id = hrefToId(href);
    if (seen.has(id)) return;
    seen.add(id);
    items.push({ id, title, image: proxyImageUrl(image), url: `/api/v1/anime/${id}` });
  });

  const hasNextPage = $('a[href*="page="]').filter((_, el) => {
    const t = $(el).text().toLowerCase();
    return t.includes('next') || t === '›' || t === '»';
  }).length > 0 || $('ul.pagination .page-item.active').next('.page-item').length > 0;

  return { items, hasNextPage };
}


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
  // Title � same logic as scrapeDetails
  const rawPageTitle2 = $('title').text().trim();
  const titleFromTag2 = rawPageTitle2.includes(' - ') ? rawPageTitle2.split(' - ').slice(1).join(' - ').split(/\s*[��]\s*(?:Watch|Stream|Online)/i)[0].trim() : '';
  const title = (titleFromTag2 && !titleFromTag2.toLowerCase().startsWith('aniwave')) ? titleFromTag2 :
    $('h2.film-name, h1.film-name, .film-name').filter((_,el) => !$(el).text().trim().toLowerCase().includes('aniwave')).first().text().trim() || titleFromTag2;
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
