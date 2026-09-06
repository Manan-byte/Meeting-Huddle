# Huddle — single-process production image (serves API + Socket.IO + the built web client)
#
# Build:        docker build --target server -t huddle .
# Run (persist): docker run -p 3001:3001 -v huddle-data:/app/server/data huddle

FROM node:20-alpine AS base
RUN corepack enable
RUN corepack prepare pnpm@latest --activate

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

# Build (shared → server → web)
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Server: API + Socket.IO + built web client on one port
FROM node:20-alpine AS server
WORKDIR /app
# Keep the apps/* layout so the server resolves apps/web/dist relative to itself
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
# Durable data (accounts, history, schedule) — persist via a named volume
ENV DATA_DIR=/app/server/data
VOLUME ["/app/server/data"]
WORKDIR /app/apps/server
EXPOSE 3001
ENV PORT=3001
CMD ["node", "dist/index.js"]

# Web (optional split deployment; not used by the default single-process run)
FROM nginx:alpine AS web
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
