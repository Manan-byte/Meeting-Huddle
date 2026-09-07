# Huddle — Video Meeting Platform

> Real-time video meetings in the browser — deployed entirely on **Cloudflare**.
> **LiveKit (SFU)** handles media, **Cloudflare Workers + Durable Objects** handle
> realtime signaling/state, and **Cloudflare D1** stores data. No server, no VPS,
> no PC required to keep it running — everything is always-on and free-tier friendly.

## Apa ini?

**Huddle** adalah aplikasi **video conference berbasis browser** ala Google Meet/Zoom. Pengguna
bisa membuat/bergabung meeting dengan kode 6 karakter, berbagi layar, chat, polling, mengangkat
tangan, menjadwalkan meeting (dengan undangan email via mail client sendiri), dan login via
email/password atau GitHub.

Tidak ada unduhan/instalasi — cukup browser (WebRTC).

## Fitur

| Area | Fitur |
|---|---|
| 🎥 **Video/Audio** | LiveKit SFU — skala puluhan peserta/ruangan; mute, kamera on/off, speaking indicator |
| 🖥️ **Screen share** | Bagikan layar via track LiveKit, preview sendiri |
| 💬 **Chat & reaksi** | Chat realtime, emoji reactions |
| 🙋 **Engage** | Angkat tangan, polling, live captions (Web Speech API), push-to-talk |
| 📅 **Schedule** | Kalender + jam digital AM/PM, undang tamu via `mailto:` (provider email apa pun) |
| 🔐 **Auth** | Email/password atau GitHub OAuth; **Schedule & History (admin)** gated login |
| 🗄️ **Data** | Cloudflare D1 (serverless SQLite) — users, sesi, history, jadwal |
| 🎨 **UI** | Light SaaS, dark-mode, layout grid/speaker/sidebar, pre-join lobby |

## Arsitektur

```
┌─────────────────┐        ┌──────────────────────────────────────┐        ┌──────────────┐
│  React + Vite   │  WS    │  Cloudflare Worker                   │  D1    │  SQLite (D1) │
│  (apps/web)     │───────▶│  • Worker entry (fetch handler)      │────────▶│ users/session│
│  useLiveKit     │        │  • HuddleDO (Durable Object)         │        │ history/sched│
└────────┬────────┘        │    - WebSocket realtime (rooms, chat,│        └──────────────┘
         │ publish/        │      polls, reactions, signaling)    │
         │ subscribe       │    - Auth (email/GitHub)             │
         ▼                 │    - LiveKit token (HS256 JWT)       │
┌─────────────────┐        │    - Serve frontend (static assets)  │
│   LiveKit SFU   │◀───────┘                                      │
│ (media server)  │  Selective Forwarding Unit — forwards media   │
└─────────────────┘  selectively; scales to many participants     │
```

- **Monorepo pnpm + Turborepo**: `apps/web` (React), `apps/worker` (Cloudflare Worker + Durable Object), `packages/shared` (types/constants).
- **Realtime = Cloudflare Durable Objects**: setiap room/state dipegang `HuddleDO` (WebSocket native di edge). Bukan server Node — selalu-on, gratis, tanpa maintenance.
- **Media = LiveKit (SFU)**: setiap peserta publish 1× ke server; server forward selektif — bukan P2P mesh, jadi skala puluhan peserta/ruang.
- **Data = Cloudflare D1** via binding (bukan file `db.json`); tabel dibuat otomatis saat pertama koneksi.

> Detail lengkap: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/COMPONENTS.md`](docs/COMPONENTS.md),
> [`docs/API.md`](docs/API.md), [`docs/FEATURES.md`](docs/FEATURES.md), [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Setup & Run (development)

```bash
# 1. Install dependencies (pnpm required: corepack enable / npm i -g pnpm)
pnpm install

# 2. Worker config — salin & isi
#    apps/worker/wrangler.toml: pastikan D1 binding "DB" menunjuk database Anda
#    (sesuaikan database_id). Set secret:
npx wrangler login                     # login akun Cloudflare
cd apps/worker
npx wrangler secret put LIVEKIT_API_SECRET
npx wrangler secret put GITHUB_CLIENT_ID      # opsional, untuk GitHub OAuth
npx wrangler secret put GITHUB_CLIENT_SECRET  # opsional
#    Vars (non-secret, di wrangler.toml [vars] atau dashboard):
#    LIVEKIT_URL, LIVEKIT_API_KEY, CLIENT_URL

# 3. Build & deploy ke Cloudflare
pnpm --filter @meet-app/web build      # frontend → apps/web/dist
cd apps/worker
npx wrangler deploy                    # upload worker + assets + D1 binding

# 4. Dev lokal (hot reload)
pnpm dev:web                           # Vite :5173, proxy /ws → wrangler dev :8787
cd apps/worker && npx wrangler dev     # jalankan worker lokal
```

Buka **http://localhost:5173** (dev) atau **https://<worker>.workers.dev** (produksi) →
isi nama → **New meeting** → izinkan mic/kamera.

> Tanpa `LIVEKIT_*`, fitur non-video tetap jalan; video menunggu kredensial LiveKit.
> Tanpa D1 binding, server boot tapi auth/data tidak persisten.

## Scripts

| Perintah | Fungsi |
|---|---|
| `pnpm dev:web` | Jalankan frontend (Vite, dev hot reload) |
| `pnpm --filter @meet-app/web build` | Build frontend statis |
| `cd apps/worker && npx wrangler dev` | Jalankan worker lokal (dev) |
| `cd apps/worker && npx wrangler deploy` | Deploy worker + assets ke Cloudflare Cloudflare |
| `pnpm build` | Build semua paket |
| `pnpm test` | Test (Vitest) semua workspace |
| `pnpm typecheck` | Type-check semua workspace |

## Testing

- **Web**: komponen (ControlBar, TimePicker, VideoPlayer, buildInviteMailto) + hook (usePushToTalk).
- **Worker**: tidak ada unit test terpisah saat ini; verifikasi dilakukan via smoke test WebSocket
  (create room → join → chat broadcast) dan endpoint HTTP (`/health`, `/api/livekit/token`).
- Menjalankan: `pnpm test`.

## Deploy

- **Cloudflare Workers** (`apps/worker/wrangler.toml`) — worker menyajikan web build + WebSocket
  realtime (Durable Object) + LiveKit token + auth + D1 pada satu URL `https://<name>.workers.dev`.
- Lihat [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) untuk env vars, D1 setup, dan platform notes.

## Repo layout

```
meet-app/
├─ apps/
│  └─ worker/   # Cloudflare Worker + Durable Object (realtime, auth, LiveKit token, static)
│  └─ web/      # React + Vite + livekit-client (SPA)
├─ packages/
│  └─ shared/   # Types & constants bersama (SOCKET_EVENTS, dll)
├─ docs/        # Arsitektur, komponen, API, fitur, deployment
└─ package.json # pnpm workspace + turbo
```

## Lisensi

Proyek pribadi.