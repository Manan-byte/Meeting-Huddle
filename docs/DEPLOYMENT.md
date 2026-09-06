# Huddle — Deployment

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | ≥ 18.x | Runtime (ES2022 target) |
| pnpm | ≥ 9.x | Package manager + workspace orchestration |
| Git | any | Version control |

## Local Development

### 1. Install Dependencies

```bash
cd meet-app
pnpm install
```

This installs all workspace dependencies. pnpm automatically links `@meet-app/shared` between server and web via `workspace:*`.

### 2. Start Development Servers

```bash
# Start both server and web concurrently
pnpm dev

# Or start individually:
pnpm dev:server    # Express + Socket.IO on port 3001
pnpm dev:web       # Vite dev server on port 5173
```

**Dev servers**:
- **Server**: `tsx watch src/index.ts` — auto-restarts on file changes
- **Web**: `vite` — HMR (Hot Module Replacement) enabled

### 3. Open Browser

Navigate to `http://localhost:5173`.

## Environment Variables

### Server (`apps/server/`)

Create `apps/server/.env`:

```env
PORT=3001
CORS_ORIGIN=http://localhost:5173
CLIENT_URL=http://localhost:5173
DATA_DIR=./data
```

| Variable | Default | Description |
|--------|---------|-------------|
| `PORT` | `3001` | Server listen port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin for Socket.IO and Express |
| `CLIENT_URL` | `http://localhost:5173` | Base URL for invite-link generation (used in the mailto: invite body and shareable links) |
| `CF_ACCOUNT_ID` / `D1_DATABASE_ID` / `CF_API_TOKEN` | *(empty — disabled)* | Cloudflare D1 storage credentials (replaces the old `DATA_DIR`/`db.json`). |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | *(empty — disabled)* | GitHub OAuth login ("Continue with GitHub"). Callback URL: `<CLIENT_URL>/auth/github/callback`. |
| `LIVEKIT_URL` | *(empty — disabled)* | LiveKit SFU server URL (e.g. from LiveKit Cloud). |
| `LIVEKIT_API_KEY` | *(empty — disabled)* | LiveKit API key. |
| `LIVEKIT_API_SECRET` | *(empty — disabled)* | LiveKit API secret. |

### Web (`apps/web/`)

`VITE_GITHUB_CLIENT_ID` — optional. When set (in `apps/web/.env`), the **"Continue with GitHub"** button in the Sign-in modal redirects to GitHub OAuth.

No environment variables required. Vite proxies Socket.IO connections to the server automatically.

## Persistence (Cloudflare D1)

Huddle stores durable data — user accounts, sessions, meeting history, and scheduled
meetings — in **Cloudflare D1** (serverless SQLite) via its HTTP API, replacing the old
`db.json` file. Tables are created automatically on first use (`CREATE TABLE IF NOT EXISTS`).

Configure in `apps/server/.env` (see the `.env.example` notes):
- `CF_ACCOUNT_ID` — from `https://dash.cloudflare.com` (Your Profile → Account ID).
- `D1_DATABASE_ID` — Workers & Pages → D1 → your database → database ID.
- `CF_API_TOKEN` — My Profile → API Tokens → create a token with the **"D1 → Edit"** permission (account-scoped).

If D1 is not configured, the server still boots but auth/data features are unavailable
(logs a warning). Passwords are hashed with salted scrypt; login sessions persist so users
stay signed in across restarts.

## Project Structure

```
meet-app/
├── package.json              # Root: turbo scripts, devDependencies
├── pnpm-workspace.yaml       # Workspace: apps/* + packages/*
├── turbo.json                # Turborepo task config
├── tsconfig.base.json        # Shared TypeScript config (ES2022, strict)
├── vitest.workspace.ts       # Vitest workspace config
├── packages/
│   └── shared/
│       ├── package.json      # @meet-app/shared (pure types)
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts      # Re-exports types + constants
│           ├── types.ts      # 19 TypeScript interfaces/types
│           ├── constants.ts  # SOCKET_EVENTS, ROOM_CONFIG, etc.
│           └── __tests__/    # constants.test.ts
├── apps/
│   ├── server/
│   │   ├── package.json      # @meet-app/server
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts      # Express + Socket.IO setup
│   │       ├── services/
│   │       │   └── RoomManager.ts
│   │       └── handlers/
│   │           ├── roomHandlers.ts
│   │           ├── signalingHandler.ts
│   │           ├── chatHandler.ts
│   │           ├── featureHandlers.ts
│   │           └── meetingHandlers.ts
│   └── web/
│       ├── package.json      # @meet-app/web
│       ├── index.html
│       ├── vite.config.ts
│       ├── tsconfig.json
│       └── src/
│           ├── App.tsx
│           ├── main.tsx
│           ├── index.css
│           ├── contexts/
│           ├── pages/
│           ├── components/
│           └── hooks/
└── docs/                     # This documentation
```

## Build

```bash
# Build all packages (shared → server → web)
pnpm build

# Build individually:
pnpm turbo build --filter=@meet-app/shared
pnpm turbo build --filter=@meet-app/server
pnpm turbo build --filter=@meet-app/web
```

Build outputs to `dist/` in each package. Turborepo ensures `shared` builds first.

## Testing

```bash
# Run all tests across all packages
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests for a specific package
pnpm turbo test --filter=@meet-app/shared
pnpm turbo test --filter=@meet-app/server
pnpm turbo test --filter=@meet-app/web
```

Vitest workspace config in `vitest.workspace.ts` discovers test files across all packages.

## Type Checking

```bash
# Type-check all packages
pnpm typecheck
```

## Linting

```bash
pnpm lint
```

## Production Deployment

### Option 1: Manual (single process)

The server serves the built web client (`apps/web/dist`) and the Socket.IO endpoint
(`/socket.io`) together on one port. This matches the client, which connects Socket.IO
to the **same origin** it was loaded from — so there is no CORS and no separate static
server to run.

```bash
# 1. Build everything (web → dist, server → dist)
pnpm build

# 2. Start the single production server (API + Socket.IO + static web)
cd apps/server
node dist/index.js
```

Open `http://localhost:3001`. The server auto-detects `apps/web/dist` and serves it.

> If you'd rather keep the web and server on separate origins, you must configure the
> web client to point Socket.IO at the server origin (see note below) and set
> `CORS_ORIGIN` to the web origin.

### Option 2: Docker

Create `Dockerfile` at project root:

```dockerfile
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

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Server (serves API + Socket.IO + the built web client on one port)
FROM node:20-alpine AS server
WORKDIR /app
# Keep the apps/* layout so the server can resolve apps/web/dist relative to itself
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
WORKDIR /app/apps/server
# Durable data (accounts, history, schedule) lives in Cloudflare D1 — not on a
# container volume. D1 credentials come from env (CF_ACCOUNT_ID/D1_DATABASE_ID/CF_API_TOKEN).
# LiveKit + GitHub credentials are also env-driven (see docs/DEPLOYMENT.md).
EXPOSE 3001
ENV PORT=3001
CMD ["node", "dist/index.js"]

# Web (static) — optional split deployment (serves only the client; Socket.IO
# then needs the client to target the server origin — see CORS section).
FROM nginx:alpine AS web
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
```

Build and run (single process, data in Cloudflare D1):

```bash
docker build --target server -t meet-app-server .
docker run -p 3001:3001 \
  -e CF_ACCOUNT_ID=... -e D1_DATABASE_ID=... -e CF_API_TOKEN=... \
  -e LIVEKIT_URL=... -e LIVEKIT_API_KEY=... -e LIVEKIT_API_SECRET=... \
  meet-app-server
```

Open `http://localhost:3001`. The server image bundles the built web client and serves it
together with Socket.IO — no separate frontend, no CORS needed. Durable data (accounts,
sessions, history, schedule) is stored in **Cloudflare D1** via the HTTP API, so it survives
container restarts and redeploys without a volume.

For a split deployment instead, deploy `apps/web/dist` to static hosting and point the
client's Socket.IO connection at the server origin (see below).

### Option 3: Platform-as-a-Service (recommended — HTTPS + Docker managed)

Both **Render** and **Railway** build the included `Dockerfile`, provide HTTPS
automatically (required for WebRTC), restart the service on crash, and pass env vars.
Durable data lives in **Cloudflare D1** (no disk volume needed).

#### Render

The repo includes `render.yaml`. Push to GitHub, then:

1. In Render dashboard: **New → Blueprint** and select the repo (it reads `render.yaml`).
2. After first deploy, set the two `sync: false` env vars to your URL:
   - `CORS_ORIGIN` = `https://<your-app>.onrender.com`
   - `CLIENT_URL` = same
3. Add the service env vars: `CF_ACCOUNT_ID`, `D1_DATABASE_ID`, `CF_API_TOKEN` (D1),
   plus `LIVEKIT_*` (video) and `GITHUB_*` (OAuth) as needed.

#### Railway

1. **New Project → Deploy from GitHub repo** (Railway auto-detects the Dockerfile).
2. Add env vars: `PORT=3001`, `CORS_ORIGIN=https://<your-app>.up.railway.app`, `CLIENT_URL=same`,
   plus `CF_ACCOUNT_ID`, `D1_DATABASE_ID`, `CF_API_TOKEN`, and `LIVEKIT_*` / `GITHUB_*` as needed.
3. No volume required — data persists in Cloudflare D1.

Health check: the server exposes `GET /health` (used by both platforms' uptime checks).

## CORS Configuration

The server uses Express CORS middleware and Socket.IO CORS config. Both must allow the client origin:

```
CORS_ORIGIN=https://your-deployed-web-url
CLIENT_URL=https://your-deployed-web-url
```

For local development, defaults to `http://localhost:5173`.

## STUN / TURN (LiveKit)

Media flows through the **LiveKit SFU**, not P2P, so NAT/TURN is handled by the LiveKit
server itself (LiveKit Cloud manages TURN automatically). No STUN/TURN config is needed in
the app code. For self-hosted LiveKit, configure TURN on the LiveKit server as needed.

## Limitations

- **Room state is in-memory**: live rooms, participants, and chat are kept in memory (normal for realtime), so a server restart ends active meetings. Durable data (accounts, sessions, history, schedule) is persisted to **Cloudflare D1**.
- **Media requires LiveKit**: video/audio only works when `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` are set. Without them, non-video features still work; the room shows no media (token endpoint returns 503).
- **Anyone with a room code can join** a live room — joining doesn't require an account (accounts gate the dashboard and Schedule, not the call).
- **Max participants per room**: Enforced by `ROOM_CONFIG.MAX_PARTICIPANTS` (10); raise it for larger meetings — LiveKit SFU handles many participants, the limit is a product setting.
- **No HTTPS by default**: WebRTC requires HTTPS in production (except localhost). Use a reverse proxy (nginx, Caddy) or deploy behind a platform that provides TLS.
- **GitHub OAuth**: implemented server-side (callback + token exchange); requires `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` + `VITE_GITHUB_CLIENT_ID`. Password reset is not implemented.
- **AI Companion (server)**: Retained server-side handlers use keyword extraction, not a real LLM. The feature is **not surfaced in the web UI** (removed in v0.2).
- **Live Captions**: Depends on browser Web Speech API support (Chrome/Edge primarily).
