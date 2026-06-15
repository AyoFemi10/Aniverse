# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --frozen-lockfile

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:22-alpine AS production

# Security: run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S anime -u 1001

WORKDIR /app

# Copy only production artifacts
COPY --from=builder --chown=anime:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=anime:nodejs /app/dist ./dist
COPY --from=builder --chown=anime:nodejs /app/package.json ./

# Environment defaults (can be overridden at runtime)
ENV NODE_ENV=production \
    PORT=5000 \
    HOST=0.0.0.0

USER anime

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "dist/server.js"]
