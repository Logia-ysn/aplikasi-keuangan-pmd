# ============================================================================
# PMD Finance — Multi-stage Dockerfile
# Builds both client (React/Vite) and server (Express/TypeScript) into a
# single production image. Express serves the API and the static SPA.
# ============================================================================

# ── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Client deps
COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm ci

# Server deps
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci

# ── Stage 2: Build client + server ──────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

# Copy source code
COPY client/ ./client/
COPY server/ ./server/

# Build client (React + Vite → client/dist/)
RUN cd client && npm run build

# Generate Prisma client + build server (TypeScript → server/dist/)
RUN cd server && npx prisma generate && npm run build

# ── Stage 3: Production runner ──────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install only production deps + prisma CLI + tsx (for prisma.config.ts)
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev && npm install prisma tsx

# Copy build artifacts
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/node_modules/.prisma ./server/node_modules/.prisma
COPY --from=builder /app/server/node_modules/@prisma/client ./server/node_modules/@prisma/client
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/server/prisma.config.ts ./server/prisma.config.ts
COPY --from=builder /app/client/dist ./client/dist

# Entrypoint: migrate + auto-seed + start
COPY docker-app-entrypoint.sh /docker-app-entrypoint.sh
RUN chmod +x /docker-app-entrypoint.sh

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

EXPOSE 3001
WORKDIR /app/server

CMD ["/docker-app-entrypoint.sh"]
