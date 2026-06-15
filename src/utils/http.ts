import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { logger } from './logger';

// Rotate through common user-agents to avoid simple bot detection
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
];

let uaIndex = 0;
function nextUserAgent(): string {
  const ua = USER_AGENTS[uaIndex % USER_AGENTS.length];
  uaIndex++;
  return ua;
}

const DEFAULT_TIMEOUT = Number(process.env.REQUEST_TIMEOUT_MS ?? 15_000);
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

const client = axios.create({
  timeout: DEFAULT_TIMEOUT,
  headers: {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
  },
});

/**
 * Fetch a URL with automatic User-Agent rotation and exponential-backoff retry.
 */
export async function fetchHtml(
  url: string,
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  return fetchWithRetry<string>(url, {
    headers: { 'User-Agent': nextUserAgent(), ...extraHeaders },
    responseType: 'text',
  });
}

/**
 * Fetch JSON with retry.
 */
export async function fetchJson<T = unknown>(
  url: string,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  return fetchWithRetry<T>(url, {
    headers: {
      'User-Agent': nextUserAgent(),
      Accept: 'application/json, */*',
      ...extraHeaders,
    },
    responseType: 'json',
  });
}

async function fetchWithRetry<T>(
  url: string,
  config: AxiosRequestConfig,
  attempt = 1,
): Promise<T> {
  try {
    const resp: AxiosResponse<T> = await client.request<T>({ url, ...config });
    return resp.data;
  } catch (err: unknown) {
    const isLast = attempt >= MAX_RETRIES;
    const delay = BASE_BACKOFF_MS * 2 ** (attempt - 1); // 500 ms, 1 s, 2 s

    logger.warn(
      { url, attempt, maxRetries: MAX_RETRIES, err },
      isLast ? 'HTTP request failed (no more retries)' : `HTTP request failed – retrying in ${delay}ms`,
    );

    if (isLast) throw err;

    await sleep(delay);
    return fetchWithRetry<T>(url, config, attempt + 1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
