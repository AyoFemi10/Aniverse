/**
 * AniwaveService – business logic layer.
 *
 * Sits between routes and scrapers. Responsible for:
 * - Resolving slug/id from user-facing params
 * - Cache management (read-through / write-through)
 * - Error normalisation
 */

import {
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeStreams,
  scrapeDiscovery,
  scrapeGenres,
  scrapeGenreAnime,
  scrapeInfo,
} from '../scrapers/aniwave.scraper';
import { withCache, CACHE_TTL, CACHE_KEYS } from '../utils/cache';
import { logger } from '../utils/logger';
import type { SearchResult, AnimeDetails, Episode, Stream, DiscoveryAnime, Genre, GenreAnime, AnimeInfo } from '../types';

export class AniwaveService {
  // ─── Search ─────────────────────────────────────────────────────────────────

  async search(query: string): Promise<{ data: SearchResult[]; cached: boolean }> {
    const key = CACHE_KEYS.search(query);
    logger.info({ query }, 'AniwaveService.search');

    return withCache(key, CACHE_TTL.SEARCH, () => scrapeSearch(query));
  }

  // ─── Details ────────────────────────────────────────────────────────────────

  async details(id: string): Promise<{ data: AnimeDetails; cached: boolean }> {
    const key = CACHE_KEYS.anime(id);
    logger.info({ id }, 'AniwaveService.details');

    return withCache(key, CACHE_TTL.DETAILS, () => scrapeDetails(id));
  }

  // ─── Episodes ───────────────────────────────────────────────────────────────

  async episodes(id: string): Promise<{ data: Episode[]; cached: boolean }> {
    const key = CACHE_KEYS.episodes(id);
    logger.info({ id }, 'AniwaveService.episodes');

    return withCache(key, CACHE_TTL.EPISODES, () => scrapeEpisodes(id));
  }

  // ─── Streams ────────────────────────────────────────────────────────────────

  async stream(
    id: string,
    episode: string,
  ): Promise<{ data: Stream[]; cached: boolean }> {
    const key = CACHE_KEYS.stream(id, episode);
    logger.info({ id, episode }, 'AniwaveService.stream');

    return withCache(key, CACHE_TTL.STREAMS, () => scrapeStreams(id, episode));
  }

  // ─── Discovery ──────────────────────────────────────────────────────────────

  async trending(): Promise<{ data: DiscoveryAnime[]; cached: boolean }> {
    return withCache(CACHE_KEYS.trending(), CACHE_TTL.DISCOVERY, () =>
      scrapeDiscovery('trending'),
    );
  }

  async recent(): Promise<{ data: DiscoveryAnime[]; cached: boolean }> {
    return withCache(CACHE_KEYS.recent(), CACHE_TTL.DISCOVERY, () =>
      scrapeDiscovery('recent'),
    );
  }

  async popular(): Promise<{ data: DiscoveryAnime[]; cached: boolean }> {
    return withCache(CACHE_KEYS.popular(), CACHE_TTL.DISCOVERY, () =>
      scrapeDiscovery('popular'),
    );
  }

  // ─── Genres ─────────────────────────────────────────────────────────────────

  async genres(): Promise<{ data: Genre[]; cached: boolean }> {
    logger.info('AniwaveService.genres');
    return withCache(CACHE_KEYS.genres(), CACHE_TTL.GENRES, () => scrapeGenres());
  }

  async genreAnime(
    genre: string,
    page = 1,
  ): Promise<{ data: { items: GenreAnime[]; hasNextPage: boolean }; cached: boolean }> {
    logger.info({ genre, page }, 'AniwaveService.genreAnime');
    return withCache(
      CACHE_KEYS.genrePage(genre, page),
      CACHE_TTL.DISCOVERY,
      () => scrapeGenreAnime(genre, page),
    );
  }

  // ─── Info ────────────────────────────────────────────────────────────────────

  async info(id: string): Promise<{ data: AnimeInfo; cached: boolean }> {
    logger.info({ id }, 'AniwaveService.info');
    return withCache(CACHE_KEYS.info(id), CACHE_TTL.INFO, () => scrapeInfo(id));
  }
}

// Export a singleton instance
export const aniwaveService = new AniwaveService();
