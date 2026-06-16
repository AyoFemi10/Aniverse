import { redis } from '../plugins/redis';
import { logger } from './logger';

export const CACHE_TTL = {
  SEARCH: 60 * 10,       // 10 minutes
  DETAILS: 60 * 30,      // 30 minutes
  EPISODES: 60 * 30,     // 30 minutes
  STREAMS: 60 * 60,      // 1 hour
  DISCOVERY: 60 * 15,    // 15 minutes
  GENRES: 60 * 60 * 6,   // 6 hours
  INFO: 60 * 30,         // 30 minutes
  SCHEDULE: 60 * 30,     // 30 minutes
  TOP: 60 * 15,          // 15 minutes
  AZ: 60 * 60 * 6,       // 6 hours
} as const;

export const CACHE_KEYS = {
  search: (query: string) => `search:${query.toLowerCase().trim()}`,
  anime: (id: string) => `anime:${id}`,
  episodes: (id: string) => `episodes:${id}`,
  stream: (id: string, episode: string) => `stream:${id}:${episode}`,
  // discovery
  trending: () => 'discovery:trending',
  recent: () => 'discovery:recent',
  popular: () => 'discovery:popular',
  newest: () => 'discovery:newest',
  added: () => 'discovery:added',
  completed: () => 'discovery:completed',
  latestEpisodes: (filter: string) => `discovery:latest:${filter}`,
  top: (period: string) => `discovery:top:${period}`,
  schedule: (date: string) => `schedule:${date}`,
  azList: (letter: string) => `az:${letter}`,
  // genres
  genres: () => 'genres:all',
  genrePage: (genre: string, page: number) => `genre:${genre}:${page}`,
  info: (id: string) => `info:${id}`,
} as const;

/**
 * Get a cached value. Returns null on miss or Redis unavailability.
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    if (raw) {
      logger.debug({ key }, 'Cache HIT');
      return JSON.parse(raw) as T;
    }
    logger.debug({ key }, 'Cache MISS');
    return null;
  } catch (err) {
    logger.warn({ err, key }, 'Redis GET error – skipping cache');
    return null;
  }
}

/**
 * Store a value in cache with an optional TTL (seconds).
 */
export async function setCache<T>(key: string, value: T, ttl: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttl);
    logger.debug({ key, ttl }, 'Cache SET');
  } catch (err) {
    logger.warn({ err, key }, 'Redis SET error – skipping cache');
  }
}

/**
 * Delete one or more cache keys.
 */
export async function deleteCache(...keys: string[]): Promise<void> {
  try {
    if (keys.length > 0) await redis.del(...keys);
  } catch (err) {
    logger.warn({ err, keys }, 'Redis DEL error');
  }
}

/**
 * Cache-aside helper. Tries cache first; on miss calls loader and stores result.
 */
export async function withCache<T>(
  key: string,
  ttl: number,
  loader: () => Promise<T>,
): Promise<{ data: T; cached: boolean }> {
  const cached = await getCache<T>(key);
  if (cached !== null) return { data: cached, cached: true };

  const data = await loader();
  await setCache(key, data, ttl);
  return { data, cached: false };
}
