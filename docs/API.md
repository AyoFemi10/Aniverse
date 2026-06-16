# AniVerse API

Production-grade anime streaming REST API. Built with Fastify, TypeScript, Redis, and Docker.

**Base URL:** `https://apis.ayohost.site`  
**Interactive Docs:** `https://apis.ayohost.site/docs`  
**Rate Limit:** 100 requests / minute / IP

---

## Table of Contents

1. [Health](#health)
2. [Search](#search)
3. [Anime](#anime)
4. [Streams](#streams)
5. [Quality Levels](#quality-levels)
6. [Download](#download)
7. [Stream Proxy](#stream-proxy)
8. [Discovery](#discovery)
9. [Genres](#genres)
10. [A-Z Browse](#a-z-browse)
11. [Error Responses](#error-responses)
12. [Caching](#caching)
13. [Running Locally](#running-locally)

---

## Health

### `GET /health`

```json
{
  "status": "ok",
  "uptime": 12345,
  "redis": "ok",
  "version": "1.0.0",
  "timestamp": "2025-06-16T12:00:00.000Z"
}
```

---

## Search

### `GET /api/v1/search`

| Param   | Type    | Required | Description                     |
|---------|---------|----------|---------------------------------|
| `q`     | string  | ✅       | Search keyword                  |
| `limit` | integer | ❌       | Max results (1–100, default 50) |

```
GET /api/v1/search?q=naruto
GET /api/v1/search?q=one+piece&limit=10
```

```json
{
  "success": true,
  "results": [
    {
      "id": "naruto-76396",
      "title": "Naruto",
      "image": "https://static.aniwaves.ru/resources/thumbnails/...",
      "url": "/api/v1/anime/naruto-76396"
    }
  ],
  "total": 12,
  "cached": false
}
```

---

## Anime

### `GET /api/v1/anime/:id`

Full metadata for a single anime.

```
GET /api/v1/anime/naruto-76396
```

```json
{
  "success": true,
  "anime": {
    "title": "Naruto",
    "description": "A young ninja who seeks recognition...",
    "aliases": "NARUTO",
    "aired": "2002-10-03",
    "image": "https://static.aniwaves.ru/...",
    "genres": ["Action", "Adventure"],
    "status": "Finished Airing",
    "rating": "8.1"
  },
  "cached": false
}
```

### `GET /api/v1/anime/:id/info`

Details + full episode list in one call. Best for detail pages.

```json
{
  "success": true,
  "info": {
    "id": "naruto-76396",
    "title": "Naruto",
    "description": "...",
    "aliases": "NARUTO",
    "aired": "2002-10-03",
    "image": "https://static.aniwaves.ru/...",
    "genres": ["Action", "Adventure"],
    "status": "Finished Airing",
    "rating": "8.1",
    "totalEpisodes": 220,
    "episodes": [
      { "number": 1, "url": "/api/v1/anime/naruto-76396/episodes/1/streams" }
    ]
  },
  "cached": false
}
```

### `GET /api/v1/anime/:id/episodes`

Episode list only.

```json
{
  "success": true,
  "episodes": [
    { "number": 1, "url": "/api/v1/anime/naruto-76396/episodes/1/streams" }
  ],
  "total": 220,
  "cached": false
}
```

---

## Streams

### `GET /api/v1/anime/:id/episodes/:episode/streams`

Resolve M3U8 stream URLs for an episode.

| Param     | Type    | Description                            |
|-----------|---------|----------------------------------------|
| `id`      | string  | Anime slug                             |
| `episode` | integer | Episode number                         |
| `type`    | string  | `sub` · `dub` · `all` (default: `all`) |

```
GET /api/v1/anime/naruto-76396/episodes/1/streams
GET /api/v1/anime/naruto-76396/episodes/1/streams?type=sub
GET /api/v1/anime/naruto-76396/episodes/1/streams?type=dub
```

```json
{
  "success": true,
  "provider": "AniVerse",
  "streams": [
    {
      "type": "SUB",
      "url": "https://hlsxst1.burntburst45.store/naruto/1/master.m3u8",
      "provider": "AniVerse"
    },
    {
      "type": "DUB",
      "url": "https://hlsxst1.burntburst45.store/naruto-dub/1/master.m3u8",
      "provider": "AniVerse"
    }
  ],
  "cached": false
}
```

> ⚠️ Raw M3U8 URLs require a `Referer` header to play. Use the **Stream Proxy** endpoint or the **qualities endpoint** to get browser-safe proxied URLs.

---

## Quality Levels

### `GET /api/v1/anime/:id/episodes/:episode/qualities`

Parses the HLS master playlist and returns all available quality variants. Each quality includes a proxied stream URL ready for HLS.js and a direct download URL.

| Param     | Type    | Description                   |
|-----------|---------|-------------------------------|
| `id`      | string  | Anime slug                    |
| `episode` | integer | Episode number                |
| `type`    | string  | `sub` · `dub` (default: `sub`) |

```
GET /api/v1/anime/naruto-76396/episodes/1/qualities?type=sub
```

```json
{
  "success": true,
  "type": "SUB",
  "qualities": [
    {
      "label": "720p",
      "height": 720,
      "bandwidth": 573467,
      "streamUrl": "/api/v1/stream-proxy?url=aHR0cHM6...&referer=aHR0cHM6...",
      "downloadUrl": "/api/v1/anime/naruto-76396/episodes/1/download?type=sub&quality=720p&variantUrl=aHR0cHM6..."
    },
    {
      "label": "480p",
      "height": 480,
      "bandwidth": 300000,
      "streamUrl": "/api/v1/stream-proxy?url=...",
      "downloadUrl": "/api/v1/anime/naruto-76396/episodes/1/download?type=sub&quality=480p&variantUrl=..."
    }
  ],
  "cached": false
}
```

**Usage pattern:**
1. Fetch `/qualities` when the watch page loads
2. Show quality labels in a selector UI (720p, 480p, etc.)
3. When user picks a quality, load its `streamUrl` into HLS.js
4. When user clicks download for a quality, open its `downloadUrl`

---

## Download

### `GET /api/v1/anime/:id/episodes/:episode/download`

Downloads the episode as an MP4. Uses ffmpeg server-side to mux HLS segments — the upstream CDN domain is never exposed.

| Param        | Type    | Description                                                          |
|--------------|---------|----------------------------------------------------------------------|
| `type`       | string  | `sub` · `dub` (default: `sub`)                                      |
| `quality`    | string  | Label for filename, e.g. `720p`                                     |
| `title`      | string  | Anime title for filename                                             |
| `variantUrl` | string  | base64url-encoded variant playlist URL from `/qualities` — use this to download a specific quality |

```
# Download best available quality (SUB)
GET /api/v1/anime/naruto-76396/episodes/1/download

# Download DUB
GET /api/v1/anime/naruto-76396/episodes/1/download?type=dub

# Download specific quality (use variantUrl from /qualities endpoint)
GET /api/v1/anime/naruto-76396/episodes/1/download?type=sub&quality=720p&title=Naruto&variantUrl=<base64url>
```

Response: binary MP4 stream with headers:
```
Content-Type: video/mp4
Content-Disposition: attachment; filename="Naruto_Episode_1_SUB_720p.mp4"
X-Powered-By: AniVerse
```

**Frontend usage:**

```javascript
// Simple download button
const url = `https://apis.ayohost.site/api/v1/anime/${id}/episodes/${ep}/download?type=sub&title=${title}`;
window.open(url);

// Quality-specific download (use downloadUrl from /qualities response)
window.open(quality.downloadUrl);
```

---

## Stream Proxy

### `GET /api/v1/stream-proxy`

Proxies M3U8 manifests and TS segments through the server. Rewrites relative URIs in manifests so HLS.js can follow the full playlist chain. Required for browser playback.

| Param     | Type   | Description                               |
|-----------|--------|-------------------------------------------|
| `url`     | string | base64url-encoded upstream M3U8/TS URL    |
| `referer` | string | base64url-encoded Referer value (optional)|

```
GET /api/v1/stream-proxy?url=<base64url>&referer=<base64url>
```

The `streamUrl` from the `/qualities` endpoint is already a ready-to-use stream-proxy URL — use it directly in HLS.js without any additional encoding.

**Encoding:**
```javascript
const enc = (s) => btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const proxyUrl = `https://apis.ayohost.site/api/v1/stream-proxy?url=${enc(m3u8Url)}&referer=${enc('https://apis.ayohost.site')}`;
```

---

## Discovery

### `GET /api/v1/trending`
### `GET /api/v1/popular?page=`
### `GET /api/v1/recent`
### `GET /api/v1/newest?page=`
### `GET /api/v1/added?page=`
### `GET /api/v1/completed?page=`

All return:
```json
{
  "success": true,
  "items": [
    {
      "id": "one-piece-81553",
      "title": "One Piece",
      "image": "https://static.aniwaves.ru/...",
      "url": "/api/v1/anime/one-piece-81553",
      "episodes": 1100,
      "type": "TV"
    }
  ],
  "page": 1,
  "cached": false
}
```

### `GET /api/v1/latest-episodes`

Latest episode updates filtered by type.

| Param    | Type   | Values                                          |
|----------|--------|-------------------------------------------------|
| `filter` | string | `all` · `sub` · `dub` · `chinese` · `trending` · `random` |

```
GET /api/v1/latest-episodes?filter=sub
```

### `GET /api/v1/top`

Top-rated anime by time period.

| Param    | Type   | Values                        |
|----------|--------|-------------------------------|
| `period` | string | `day` · `week` · `month` (default: `week`) |

```json
{
  "success": true,
  "period": "week",
  "items": [
    {
      "rank": 1,
      "id": "fullmetal-alchemist-brotherhood-421",
      "title": "Fullmetal Alchemist: Brotherhood",
      "image": "https://static.aniwaves.ru/...",
      "url": "/api/v1/anime/fullmetal-alchemist-brotherhood-421",
      "score": "9.1",
      "type": "TV"
    }
  ],
  "cached": false
}
```

### `GET /api/v1/schedule`

7-day airing schedule starting from today.

```json
{
  "success": true,
  "schedule": [
    {
      "day": "Monday",
      "date": "2025-06-16",
      "entries": [
        {
          "id": "one-piece-81553",
          "title": "One Piece",
          "image": "https://static.aniwaves.ru/...",
          "url": "/api/v1/anime/one-piece-81553",
          "episode": 1101,
          "airingAt": "02:30 PM"
        }
      ]
    }
  ],
  "cached": false
}
```

---

## Genres

### `GET /api/v1/genres`

```json
{
  "success": true,
  "genres": [
    { "id": "action", "name": "Action", "url": "/api/v1/genres/action" }
  ],
  "total": 30,
  "cached": false
}
```

### `GET /api/v1/genres/:genre?page=`

Browse anime by genre. Paginated.

```
GET /api/v1/genres/action
GET /api/v1/genres/romance?page=2
```

```json
{
  "success": true,
  "genre": "action",
  "page": 1,
  "hasNextPage": true,
  "items": [...],
  "cached": false
}
```

---

## A-Z Browse

### `GET /api/v1/az?letter=&page=`

Browse all anime alphabetically.

| Param    | Type    | Description                          |
|----------|---------|--------------------------------------|
| `letter` | string  | A–Z, `0-9`, or `#` for other        |
| `page`   | integer | Page number (default 1)              |

```
GET /api/v1/az?letter=N
GET /api/v1/az?letter=0-9&page=2
```

---

## Error Responses

All errors use the same envelope:

```json
{
  "success": false,
  "error": {
    "code": "ANIME_NOT_FOUND",
    "message": "Anime not found"
  }
}
```

| Code                | HTTP | Description                                      |
|---------------------|------|--------------------------------------------------|
| `INVALID_PARAMS`    | 400  | Validation / bad request                         |
| `ANIME_NOT_FOUND`   | 404  | Anime slug not found                             |
| `STREAM_NOT_FOUND`  | 404  | No streams for that episode / type               |
| `FORBIDDEN`         | 403  | Proxy host not permitted                         |
| `RATE_LIMITED`      | 429  | Over 100 req/min per IP                          |
| `SCRAPER_ERROR`     | 502  | Upstream fetch failed                            |
| `INTERNAL_ERROR`    | 500  | Unexpected server error                          |

---

## Caching

| Endpoint            | TTL        |
|---------------------|------------|
| Search              | 10 minutes |
| Anime details       | 30 minutes |
| Anime info          | 30 minutes |
| Episodes            | 30 minutes |
| Streams             | 1 hour     |
| Qualities           | 1 hour     |
| Discovery pages     | 15 minutes |
| Genre list          | 6 hours    |
| Genre browse        | 15 minutes |
| Schedule            | 30 minutes |
| Top anime           | 15 minutes |
| A-Z list            | 6 hours    |

The `cached` field in every response indicates cache hit/miss.

---

## Running Locally

### Docker Compose (recommended)

```bash
cp .env.example .env
docker compose up --build
```

API → `http://localhost:5000`  
Docs → `http://localhost:5000/docs`

### Without Docker

```bash
npm install
cp .env.example .env
npm run dev
```

### Tests

```bash
npm test
npm run test:coverage
```

---

## Environment Variables

| Variable             | Default                  | Description                         |
|----------------------|--------------------------|-------------------------------------|
| `NODE_ENV`           | `development`            | Runtime environment                 |
| `PORT`               | `5000`                   | HTTP port                           |
| `HOST`               | `0.0.0.0`                | Bind address                        |
| `REDIS_URL`          | `redis://localhost:6379` | Redis connection string             |
| `RATE_LIMIT_MAX`     | `100`                    | Requests per minute per IP          |
| `REQUEST_TIMEOUT_MS` | `15000`                  | Scraper HTTP timeout (ms)           |
| `LOG_LEVEL`          | `info`                   | Pino log level                      |
| `ALLOWED_ORIGINS`    | *(all)*                  | Comma-separated CORS allowed origins|
| `PUBLIC_URL`         | *(empty)*                | Public base URL for proxied image URLs, e.g. `https://apis.ayohost.site` |

---

## Full Endpoint Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/search` | Search anime |
| GET | `/api/v1/anime/:id` | Anime details |
| GET | `/api/v1/anime/:id/info` | Details + episodes combined |
| GET | `/api/v1/anime/:id/episodes` | Episode list |
| GET | `/api/v1/anime/:id/episodes/:ep/streams` | Resolve M3U8 stream URLs |
| GET | `/api/v1/anime/:id/episodes/:ep/qualities` | Available quality levels |
| GET | `/api/v1/anime/:id/episodes/:ep/download` | Download episode as MP4 |
| GET | `/api/v1/stream-proxy` | HLS manifest + segment proxy |
| GET | `/api/v1/trending` | Trending anime |
| GET | `/api/v1/popular` | Most popular anime |
| GET | `/api/v1/recent` | Recently updated |
| GET | `/api/v1/newest` | New releases |
| GET | `/api/v1/added` | Newly added |
| GET | `/api/v1/completed` | Just completed |
| GET | `/api/v1/latest-episodes` | Latest episodes (filterable) |
| GET | `/api/v1/top` | Top anime by period |
| GET | `/api/v1/schedule` | 7-day airing schedule |
| GET | `/api/v1/genres` | All genres |
| GET | `/api/v1/genres/:genre` | Browse anime by genre |
| GET | `/api/v1/az` | A-Z anime browse |
