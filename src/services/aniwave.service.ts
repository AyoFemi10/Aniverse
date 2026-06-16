/**
 * AniwaveService – business logic layer.
 */

import {
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeStreams,
  scrapeDiscovery,
  scrapeLatestEpisodes,
  scrapeTopAnime,
  scrapeSchedule,
  scrapeAzList,
  scrapeGenres,
  scrapeGenreAnime,
  scrapeInfo,
} from '../scrapers/aniwave.scraper';
import { withCache, CACHE_TTL, CACHE_KEYS } from '../utils/cache';
import { logger } from '../utils/logger';
import type {
  SearchResult, AnimeDetails, Episode, Stream,
  DiscoveryAnime, Genre, GenreAnime, AnimeInfo,
  ScheduleDay, TopAnime,
} from '../types';

export class AniwaveService {
  // ─── Search ──────────────────────────────────────────────────────────────────
  async search(query: string): Promise<{ data: SearchResult[]; cached: boolean }> {
    logger.info({ query }, 'service.search');
    return withCache(CACHE_KEYS.search(query), CACHE_TTL.SEARCH, () => scrapeSearch(query));
  }

  // ─── Details ─────────────────────────────────────────────────────────────────
  async details(id: string): Promise<{ data: AnimeDetails; cached: boolean }> {
    logger.info({ id }, 'service.details');
    return withCache(CACHE_KEYS.anime(id), CACHE_TTL.DETAILS, () => scrapeDetails(id));
  }

  // ─── Episodes ────────────────────────────────────────────────────────────────
  async episodes(id: string): Promise<{ data: Episode[]; cached: boolean }> {
    logger.info({ id }, 'service.episodes');
    return withCache(CACHE_KEYS.episodes(id), CACHE_TTL.EPISODES, () => scrapeEpisodes(id));
  }

  // ─── Streams ─────────────────────────────────────────────────────────────────
  async stream(id: string, episode: string): Promise<{ data: Stream[]; cached: boolean }> {
    logger.info({ id, episode }, 'service.stream');
    return withCache(CACHE_KEYS.stream(id, episode), CACHE_TTL.STREAMS, () => scrapeStreams(id, episode));
  }

  // ─── Discovery ───────────────────────────────────────────────────────────────
  async trending(): Promise<{ data: DiscoveryAnime[]; cached: boolean }> {
    return withCache(CACHE_KEYS.trending(), CACHE_TTL.DISCOVERY, () => scrapeDiscovery('trending'));
  }

  async recent(): Promise<{ data: DiscoveryAnime[]; cached: boolean }> {
    return withCache(CACHE_KEYS.recent(), CACHE_TTL.DISCOVERY, () => scrapeDiscovery('recent'));
  }

  async popular(page = 1): Promise<{ data: DiscoveryAnime[]; cached: boolean }> {
    return withCache(CACHE_KEYS.popular() + `:${page}`, CACHE_TTL.DISCOVERY, () => scrapeDiscovery('popular', page));
  }

  async newest(page = 1): Promise<{ data: DiscoveryAnime[]; cached: boolean }> {
    return withCache(CACHE_KEYS.newest() + `:${page}`, CACHE_TTL.DISCOVERY, () => scrapeDiscovery('newest', page));
  }

  async added(page = 1): Promise<{ data: DiscoveryAnime[]; cached: boolean }> {
    return withCache(CACHE_KEYS.added() + `:${page}`, CACHE_TTL.DISCOVERY, () => scrapeDiscovery('added', page));
  }

  async completed(page = 1): Promise<{ data: DiscoveryAnime[]; cached: boolean }> {
    return withCache(CACHE_KEYS.completed() + `:${page}`, CACHE_TTL.DISCOVERY, () => scrapeDiscovery('completed', page));
  }

  // ─── Latest Episodes ─────────────────────────────────────────────────────────
  async latestEpisodes(filter: 'all' | 'sub' | 'dub' | 'chinese' | 'trending' | 'random' = 'all'): Promise<{ data: DiscoveryAnime[]; cached: boolean }> {
    return withCache(CACHE_KEYS.latestEpisodes(filter), CACHE_TTL.DISCOVERY, () => scrapeLatestEpisodes(filter));
  }

  // ─── Top Anime ───────────────────────────────────────────────────────────────
  async topAnime(period: 'day' | 'week' | 'month' = 'day'): Promise<{ data: TopAnime[]; cached: boolean }> {
    return withCache(CACHE_KEYS.top(period), CACHE_TTL.TOP, () => scrapeTopAnime(period));
  }

  // ─── Schedule ────────────────────────────────────────────────────────────────
  async schedule(): Promise<{ data: ScheduleDay[]; cached: boolean }> {
    const today = new Date().toISOString().slice(0, 10);
    return withCache(CACHE_KEYS.schedule(today), CACHE_TTL.SCHEDULE, () => scrapeSchedule());
  }

  // ─── A-Z List ────────────────────────────────────────────────────────────────
  async azList(letter: string, page = 1): Promise<{ data: { items: DiscoveryAnime[]; hasNextPage: boolean }; cached: boolean }> {
    return withCache(CACHE_KEYS.azList(letter) + `:${page}`, CACHE_TTL.AZ, () => scrapeAzList(letter, page));
  }

  // ─── Genres ──────────────────────────────────────────────────────────────────
  async genres(): Promise<{ data: Genre[]; cached: boolean }> {
    return withCache(CACHE_KEYS.genres(), CACHE_TTL.GENRES, () => scrapeGenres());
  }

  async genreAnime(genre: string, page = 1): Promise<{ data: { items: GenreAnime[]; hasNextPage: boolean }; cached: boolean }> {
    return withCache(CACHE_KEYS.genrePage(genre, page), CACHE_TTL.DISCOVERY, () => scrapeGenreAnime(genre, page));
  }

  // ─── Info ─────────────────────────────────────────────────────────────────────
  async info(id: string): Promise<{ data: AnimeInfo; cached: boolean }> {
    return withCache(CACHE_KEYS.info(id), CACHE_TTL.INFO, () => scrapeInfo(id));
  }
}

export const aniwaveService = new AniwaveService();
