// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  title: string;
  image: string;
  url: string;
}

// ─── Anime Details ────────────────────────────────────────────────────────────

export interface AnimeDetails {
  title: string;
  description: string;
  aliases: string;
  aired: string;
  image?: string;
  genres?: string[];
  status?: string;
  rating?: string;
}

// ─── Episodes ─────────────────────────────────────────────────────────────────

export interface Episode {
  number: number;
  url: string;
}

// ─── Streams ──────────────────────────────────────────────────────────────────

export interface Stream {
  type: 'SUB' | 'DUB';
  url: string;
  provider: string;
}

// ─── Discovery ────────────────────────────────────────────────────────────────

export interface DiscoveryAnime {
  id: string;
  title: string;
  image: string;
  url: string;
  episodes?: number;
  type?: string;
}

// ─── Top Anime ────────────────────────────────────────────────────────────────

export interface TopAnime {
  rank: number;
  id: string;
  title: string;
  image: string;
  url: string;
  score?: string;
  type?: string;
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

export interface ScheduleEntry {
  id: string;
  title: string;
  image: string;
  url: string;
  episode?: number;
  airingAt?: string;
}

export interface ScheduleDay {
  day: string;   // e.g. "Monday"
  date: string;  // ISO date e.g. "2025-06-16"
  entries: ScheduleEntry[];
}

// ─── Genre ────────────────────────────────────────────────────────────────────

export interface Genre {
  id: string;
  name: string;
  url: string;
}

export interface GenreAnime extends DiscoveryAnime {}

// ─── Info (combined details + episodes) ──────────────────────────────────────

export interface AnimeInfo {
  id: string;
  title: string;
  description: string;
  aliases: string;
  aired: string;
  image: string;
  genres: string[];
  status: string;
  rating: string;
  totalEpisodes: number;
  episodes: Episode[];
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
  cached?: boolean;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Cache ────────────────────────────────────────────────────────────────────

export interface CacheOptions {
  ttl: number;
}

// ─── Scraper internals ────────────────────────────────────────────────────────

export interface RawStream {
  title: string;
  streamUrl: string;
  headers: Record<string, string>;
}

export interface RawStreamResult {
  streams: RawStream[] | string;
  subtitles: string;
}
