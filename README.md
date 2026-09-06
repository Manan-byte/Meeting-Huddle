# Huddle — Video Meeting Platform

> Real-time video meetings in the browser — built to scale to many participants per room
> and millions of users, with **LiveKit (SFU)** for media and **Cloudflare D1** for data.

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
┌─────────────────┐        ┌──────────────────────────────┐        ┌──────────────┐
│  React + Vite   │  WS    │  Node.js (Express + Socket.IO)│  HTTP  │ Cloudflare D1│
│  (apps/web)     │───────▶│  (apps/server)                │────────▶│ (SQLite)     │
│  useLiveKit     │        │  • Socket.IO signaling        │        │ users/session│
└────────┬────────┘        │  • Auth (email/GitHub)        │        │ history/sched│
         │ publish/        │  • LiveKit token (JWT)        │        └──────────────┘
         │ subscribe       │  • Room management            │
         ▼                 └──────────────┬─────────────────┘
┌─────────────────┐                       │ LiveKit protocol
│   LiveKit SFU   │◀──────────────────────┘
│ (media server)  │  Selective Forwarding Unit — forwards media
└─────────────────┘  selectively; scales to many participants
```

- **Monorepo pnpm + Turborepo**: `apps/web` (React), `apps/server` (Node), `packages/shared` (types/constants).
- **Media = LiveKit (SFU)**: setiap peserta publish 1× ke server; server forward selektif —
  bukan P2P mesh, jadi skala puluhan peserta/ruang & jutaan user lintas server terdistribusi.
- **Data = Cloudflare D1** via HTTP API (bukan file `db.json`); tabel dibuat otomatis.
- **Realtime = Socket.IO** untuk sinyal room, chat, dan state (media tetap lewat LiveKit).

> Detail lengkap: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/COMPONENTS.md`](docs/COMPONENTS.md),
> [`docs/API.md`](docs/API.md), [`docs/FEATURES.md`](docs/FEATURES.md), [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Setup & Run (development)

```bash
# 1. Install dependencies (pnpm required: corepack enable / npm i -g pnpm)
pnpm install

# 2. Server env — salin & isi
cp apps/server/.env.example apps/server/.env
#   Wajib: CF_ACCOUNT_ID, D1_DATABASE_ID, CF_API_TOKEN  (Cloudflare D1)
#   Agar video aktif: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
#   Opsional: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET

# 3. Web env (opsional, untuk GitHub OAuth)
cp apps/web/.env.example apps/web/.env
#   VITE_GITHUB_CLIENT_ID=<Client ID GitHub OAuth App>

# 4. Jalankan (server :3001 + web :5173)
pnpm dev
```

Buka **http://localhost:5173** → isi nama → **New meeting** → izinkan mic/kamera.

> Tanpa LiveKit credentials, fitur non-video tetap jalan; video menunggu `LIVEKIT_*`.
> Tanpa D1 credentials, server boot tapi auth/data tidak persisten (log warning).

## Scripts

| Perintah | Fungsi |
|---|---|
| `pnpm dev` | Jalankan server + web (dev, hot reload) |
| `pnpm dev:server` / `pnpm dev:web` | Jalankan salah satu |
| `pnpm build` | Build semua paket |
| `pnpm test` | Test (Vitest) semua workspace |
| `pnpm typecheck` / `pnpm lint` | Type-check / lint semua workspace |

## Testing

- **Web**: komponen (ControlBar, TimePicker, VideoPlayer, buildInviteMailto) + hook (usePushToTalk).
- **Server**: RoomManager, meeting handlers, D1 client/database (dengan mocked fetch).
- Menjalankan: `pnpm test`.

## Deploy

- **Docker** (`Dockerfile` + `render.yaml`) untuk Render/Railway — server menyajikan web build + Socket.IO + LiveKit token + D1 pada satu port.
- Lihat [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) untuk env vars, D1 setup, dan platform notes.

## Repo layout

```
meet-app/
├─ apps/
│  ├─ server/   # Express + Socket.IO + LiveKit token + D1 (Node/TS)
│  └─ web/      # React + Vite + livekit-client (SPA)
├─ packages/
│  └─ shared/   # Types & constants bersama (SOCKET_EVENTS, dll)
├─ docs/        # Arsitektur, komponen, API, fitur, deployment
└─ package.json # pnpm workspace + turbo
```

## Lisensi

Proyek pribadi.
