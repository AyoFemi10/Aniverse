/**
 * HLS manifest utilities.
 * Parses M3U8 master playlists server-side to extract quality levels.
 */

import axios from 'axios';
import { logger } from './logger';

export interface QualityLevel {
  label: string;         // "1080p", "720p", etc.
  height: number;        // pixel height
  bandwidth: number;     // bits per second
  url: string;           // absolute URL to the quality variant playlist
}

const UPSTREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Referer': 'https://aniwaves.ru',
  'Origin': 'https://aniwaves.ru',
};

/**
 * Fetch and parse a master M3U8 playlist.
 * Returns quality levels sorted highest → lowest.
 */
export async function parseM3u8Qualities(masterUrl: string): Promise<QualityLevel[]> {
  let manifest: string;
  try {
    const resp = await axios.get<string>(masterUrl, {
      responseType: 'text',
      timeout: 10_000,
      headers: UPSTREAM_HEADERS,
    });
    manifest = resp.data;
  } catch (err) {
    logger.error({ err, masterUrl }, 'parseM3u8Qualities: fetch failed');
    throw new Error('Failed to fetch HLS manifest');
  }

  const levels: QualityLevel[] = [];
  const lines = manifest.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;

    // Parse BANDWIDTH and RESOLUTION from the tag
    const bwMatch  = line.match(/BANDWIDTH=(\d+)/);
    const resMatch = line.match(/RESOLUTION=\d+x(\d+)/);

    const bandwidth = bwMatch  ? parseInt(bwMatch[1], 10)  : 0;
    const height    = resMatch ? parseInt(resMatch[1], 10) : 0;

    // Next non-empty line is the variant playlist URI
    let uri = '';
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim();
      if (next && !next.startsWith('#')) { uri = next; break; }
    }

    if (!uri) continue;

    // Resolve relative URIs against the master URL base
    const absoluteUri = uri.startsWith('http')
      ? uri
      : new URL(uri, masterUrl).toString();

    const label = height ? `${height}p` : `${Math.round(bandwidth / 1000)}k`;

    levels.push({ label, height, bandwidth, url: absoluteUri });
  }

  // Sort highest quality first
  return levels.sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);
}

/** Fetch the upstream headers needed for CDN access */
export function getUpstreamHeaders() {
  return { ...UPSTREAM_HEADERS };
}
