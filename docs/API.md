# AniVerse API

A production-grade anime streaming REST API built with Fastify, TypeScript, Redis caching, and Docker.

---

## Base URL

```
http://localhost:5000
```

Interactive Swagger docs → `http://localhost:5000/docs`

---

## Authentication

No authentication required. Rate limiting applies: **100 requests / minute / IP**.

---

## Streaming & Downloading

The API resolves **M3U8 stream URLs** and returns them to your client. It does not proxy video — your player hits the CDN directly using the URL and headers from the response.

**Stream in VLC / mpv:**
```bash
# Use the Referer value from the stream's headers field
vlc "https://cdn.example.com/ep1.m3u8" --http-referrer "https://cdn.example.com"
mpv "https://cdn.example.com/ep1.m3u8" --referrer "https://cdn.example.com"
```

**Download with ffmpeg:**
```bash
# Replace <referer> with the value from stream.headers.Referer
ffmpeg -headers "Referer: <referer>" \
       -i "https://cdn.example.com/ep1.m3u8" \
       -c copy episode-1.mp4
```

---

## Endpoints

### Health

#### `GET /health`

```json
{
  "status": "ok",
  "uptime": 12345,
  "redis": "ok",
  "version": "1.0.0",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

### Search

#### `GET /api/v1/search`

| Param   | Type    | Required | Description                    |
|---------|---------|----------|--------------------------------|
| `q`     | string  | ✅       | Search keyword                 |
| `limit` | integer | ❌       | Max results (1–100, default 50)|

```json
{
  "success": true,
  "results": [
    {
      "id": "naruto-123",
      "title": "Naruto",
      "image": "https://cdn.example.com/naruto.jpg",
      "url": "/api/v1/anime/naruto-123"
    }
  ],
  "total": 1,
  "cached": false
}
```

---

### Anime Details

#### `GET /api/v1/anime/:id`

```json
{
  "success": true,
  "anime": {
    "title": "Naruto",
    "description": "A young ninja who seeks recognition from his peers.",
    "aliases": "NARUTO",
    "aired": "2002-10-03",
    "image": "https://cdn.example.com/naruto.jpg",
    "genres": ["Action", "Adventure"],
    "status": "Finished Airing",
    "rating": "8.1"
  },
  "cached": false
}
```

---

### Episodes

#### `GET /api/v1/anime/:id/episodes`

```json
{
  "success": true,
  "episodes": [
    { "number": 1, "url": "/api/v1/anime/naruto-123/episodes/1/streams" },
    { "number": 2, "url": "/api/v1/anime/naruto-123/episodes/2/streams" }
  ],
  "total": 220,
  "cached": false
}
```

---

### Anime Info (details + episodes combined)

#### `GET /api/v1/anime/:id/info`

Single request that returns full metadata **and** the complete episode list together.

```json
{
  "success": true,
  "info": {
    "id": "naruto-123",
    "title": "Naruto",
    "description": "A young ninja who seeks recognition from his peers.",
    "aliases": "NARUTO",
    "aired": "2002-10-03",
    "image": "https://cdn.example.com/naruto.jpg",
    "genres": ["Action", "Adventure"],
    "status": "Finished Airing",
    "rating": "8.1",
    "totalEpisodes": 220,
    "episodes": [
      { "number": 1, "url": "/api/v1/anime/naruto-123/episodes/1/streams" },
      { "number": 2, "url": "/api/v1/anime/naruto-123/episodes/2/streams" }
    ]
  },
  "cached": false
}
```

---

### Stream Sources

#### `GET /api/v1/anime/:id/episodes/:episode/streams`

| Param     | Type    | Description                                      |
|-----------|---------|--------------------------------------------------|
| `id`      | string  | Anime slug                                       |
| `episode` | integer | Episode number (≥ 1)                             |
| `type`    | string  | `sub` · `dub` · `all` (default: `all`)           |

The `type` query param filters which stream types are returned. Every stream includes a `provider` field set to **AniVerse**.

**`GET /api/v1/anime/naruto-123/episodes/1/streams`** — both streams:
```json
{
  "success": true,
  "provider": "AniVerse",
  "streams": [
    {
      "type": "SUB",
      "url": "https://cdn.example.com/sub/master.m3u8",
      "provider": "AniVerse",
      "headers": { "Referer": "https://cdn.example.com" }
    },
    {
      "type": "DUB",
      "url": "https://cdn.example.com/dub/master.m3u8",
      "provider": "AniVerse",
      "headers": { "Referer": "https://cdn.example.com" }
    }
  ],
  "cached": false
}
```

**`?type=sub`** — SUB only:
```json
{
  "success": true,
  "provider": "AniVerse",
  "streams": [
    {
      "type": "SUB",
      "url": "https://cdn.example.com/sub/master.m3u8",
      "provider": "AniVerse",
      "headers": { "Referer": "https://cdn.example.com" }
    }
  ],
  "cached": false
}
```

---

### Discovery

#### `GET /api/v1/trending`
#### `GET /api/v1/recent`
#### `GET /api/v1/popular`

```json
{
  "success": true,
  "items": [
    {
      "id": "one-piece-100",
      "title": "One Piece",
      "image": "https://cdn.example.com/one-piece.jpg",
      "url": "/api/v1/anime/one-piece-100",
      "episodes": 1100
    }
  ],
  "cached": false
}
```

---

### Genres

#### `GET /api/v1/genres`

```json
{
  "success": true,
  "genres": [
    { "id": "action",  "name": "Action",  "url": "/api/v1/genres/action" },
    { "id": "romance", "name": "Romance", "url": "/api/v1/genres/romance" }
  ],
  "total": 30,
  "cached": false
}
```

#### `GET /api/v1/genres/:genre?page=:page`

| Param   | Type    | Description                           |
|---------|---------|---------------------------------------|
| `genre` | string  | Genre slug (e.g. `action`, `romance`) |
| `page`  | integer | Page number (default 1)               |

```json
{
  "success": true,
  "genre": "action",
  "page": 1,
  "hasNextPage": true,
  "items": [
    {
      "id": "naruto-123",
      "title": "Naruto",
      "image": "https://cdn.example.com/naruto.jpg",
      "url": "/api/v1/anime/naruto-123",
      "episodes": 220,
      "type": "TV"
    }
  ],
  "cached": false
}
```

---

## Error Responses

```json
{
  "success": false,
  "error": {
    "code": "ANIME_NOT_FOUND",
    "message": "Anime not found"
  }
}
```

| Code                | HTTP | Description                        |
|---------------------|------|------------------------------------|
| `INVALID_PARAMS`    | 400  | Validation / bad request           |
| `ANIME_NOT_FOUND`   | 404  | Anime slug not found               |
| `EPISODE_NOT_FOUND` | 404  | Episode not found                  |
| `STREAM_NOT_FOUND`  | 404  | No streams resolved (or no match for selected type) |
| `RATE_LIMITED`      | 429  | Too many requests                  |
| `SCRAPER_ERROR`     | 502  | Upstream fetch failed              |
| `INTERNAL_ERROR`    | 500  | Unexpected server error            |

---

## Caching

| Endpoint        | TTL        |
|-----------------|------------|
| Search          | 10 minutes |
| Anime details   | 30 minutes |
| Anime info      | 30 minutes |
| Episodes        | 30 minutes |
| Streams         | 1 hour     |
| Discovery pages | 15 minutes |
| Genre list      | 6 hours    |
| Genre browse    | 15 minutes |

The `cached` field in every response tells you if the result came from cache.

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
# start Redis separately, then:
npm run dev
```

### Build & start production

```bash
npm run build
npm start
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
| `PORT`               | `3000`                   | HTTP port                           |
| `HOST`               | `0.0.0.0`                | Bind address                        |
| `REDIS_URL`          | `redis://localhost:6379` | Redis connection string             |
| `RATE_LIMIT_MAX`     | `100`                    | Requests per minute per IP          |
| `REQUEST_TIMEOUT_MS` | `15000`                  | Scraper HTTP timeout (ms)           |
| `LOG_LEVEL`          | `info`                   | Pino log level                      |
| `ALLOWED_ORIGINS`    | *(all)*                  | Comma-separated CORS allowed origins|
