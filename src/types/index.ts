// ─── Search ──────────────────────────────────────────────────────────────────

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
  provider: string;          // always "AniVerse"
  headers?: Record<string, string>;
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

// ─── Genre ────────────────────────────────────────────────────────────────────

export interface Genre {
  id: string;   // slug used in the URL, e.g. "action"
  name: string; // display name, e.g. "Action"
  url: string;  // full URL to the genre page
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
  ttl: number; // seconds
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
