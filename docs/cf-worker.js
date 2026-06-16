/**
 * AniVerse Scraper Proxy — Cloudflare Worker
 *
 * Deploy this at: https://workers.cloudflare.com (free tier, 100k req/day)
 *
 * Routes HTTP requests from your VPS through Cloudflare's network,
 * bypassing IP-level blocks on the upstream anime site.
 *
 * Usage:
 *   GET https://your-worker.workers.dev?url=https://aniwaves.ru/filter?keyword=naruto
 *
 * After deploying, set in your API's .env:
 *   SCRAPER_PROXY_WORKER=https://your-worker.workers.dev
 */

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get('url');

    if (!target) {
      return new Response(JSON.stringify({ error: 'url param required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Allowlist — only proxy the upstream anime site
    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response(JSON.stringify({ error: 'invalid url' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!targetUrl.hostname.endsWith('aniwaves.ru')) {
      return new Response(JSON.stringify({ error: 'host not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Forward the request with browser headers
    let response;
    try {
      response = await fetch(target, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://aniwaves.ru/',
          'Cache-Control': 'no-cache',
        },
        redirect: 'follow',
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'upstream fetch failed', detail: String(err) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const contentType = response.headers.get('Content-Type') || 'text/html';
    const body = await response.arrayBuffer();

    return new Response(body, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'X-Proxied-By': 'AniVerse-Worker',
      },
    });
  },
};
