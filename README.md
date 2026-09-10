# Huddle — Video Meeting Platform

> Aplikasi **video conference berbasis browser** (ala Google Meet) — berjalan **100% di Cloudflare edge**.
> Tanpa server Node/VPS, tanpa instalasi, tanpa biaya server. Cukup buka URL di browser.

**Produksi live:** https://huddle.abdmanan513.workers.dev

| Komponen | Teknologi |
|---|---|
| Frontend | React 19 + Vite (`apps/web`) |
| Realtime | Cloudflare Worker + Durable Object (WebSocket native) |
| Media | LiveKit SFU (Selective Forwarding Unit) |
| Database | Cloudflare D1 (SQLite serverless) |
| Otentikasi | Email/password + sesi token (tanpa OAuth) |

---

## Daftar Isi

- [Apa ini?](#apa-ini)
- [Fitur](#fitur)
- [Akun & Otentikasi](#akun--otentikasi)
- [Arsitektur](#arsitektur)
- [Quick Start (Development)](#quick-start-development)
- [Deploy ke Produksi](#deploy-ke-produksi)
- [Scripts](#scripts)
- [Testing](#testing)
- [Struktur Repo](#struktur-repo)
- [Dokumentasi](#dokumentasi)

---

## Apa ini?

Huddle memungkinkan siapa pun membuat atau bergabung rapat **hanya dengan browser** — tanpa
instalasi atau akun. Cukup:

1. Buka URL, isi nama.
2. **New meeting** (buat rapat baru) atau masukkan **kode 6 karakter** dari undangan.
3. Izinkan kamera/mikrofon — rapat langsung jalan.

Rapat mendukung video HD, berbagi layar, chat realtime, polling, angkat tangan, reaksi emoji,
live captions, dan perekaman. Rapat bisa dijadwalkan dan diundangkan lewat email.

## Fitur

| Area | Detail |
|---|---|
| 🎥 **Video/Audio** | LiveKit SFU — mute, kamera on/off, indikator berbicara, hingga 10 peserta/ruang (dapat dinaikkan). Error kamera/mik (izin ditolak, device dipakai, server media mati) ditampilkan jelas di layar |
| 🔊 **Anti-noise** | Toggle noise suppression — filter noise latar (AC, keyboard) sebelum dikirim ke peserta lain (RNNoise browser-native, zero dependency) |
| 🔇 **Moderasi mute (host)** | Mute per-peserta (klik ikon mic di daftar peserta) + **Mute all** (Discord-style) — host mematikan mikrofon peserta lain dari jarak jauh |
| 🖥️ **Screen share** | Bagikan layar dengan preview sendiri sebelum mulai |
| 💬 **Chat & reaksi** | Chat realtime antar peserta + reaksi emoji |
| 🙋 **Engage** | Angkat tangan, polling, live captions (Web Speech API), push-to-talk |
| 📋 **Pre-join lobby** | Preview kamera/mikrofon + pilih perangkat sebelum masuk ruang |
| 🎨 **Layout** | Auto / Tiled / Spotlight / Sidebar + slider ukuran tile |
| ⏱️ **Ruang rapat** | Timer, judul rapat, kode ruang, daftar peserta, ruang tunggu (waiting room) untuk ruang terkunci |
| 📅 **Schedule** | Atur jadwal rapat (kalender + jam), undang tamu via `mailto:` (email client apa pun — tanpa SMTP) |
| 📜 **History** | Riwayat rapat yang pernah diikuti/ dibuat (perlu akun) |
| 🔐 **Auth** | Email/password: daftar (`Sign up`), masuk (`Sign in`), lupa password (reset code on-screen) |
| 🗄️ **Data** | Cloudflare D1 — users, sesi, riwayat, jadwal (persisten) |
| 🌗 **UI** | Light SaaS modern, glassmorphism, dark-mode-friendly, responsif |

## Akun & Otentikasi

Huddle memakai **email/password** (tanpa OAuth Google/GitHub).

| Status | Kemampuan |
|---|---|
| Tanpa akun | ✅ Buat/join rapat, video, chat, polling — semua fitur panggilan |
| Dengan akun | ✅ + **Dashboard**, **Schedule** (jadwal rapat), dan **History** (riwayat) |

- **Membuat akun** → klik tombol **Sign up** di pojok kanan atas (atau "Sign up with email" di
  dalam modal Sign in). Isi nama, email, password (min. 6 karakter) → langsung masuk.
- **Masuk** → klik **Sign in**, isi email + password.
- **Lupa password** → "Forgot password?" → server mengeluarkan **reset code** yang ditampilkan
  di layar (30 menit) → ketik kode + password baru. *(Karena free tier tanpa SMTP, kode belum
  dikirim lewat email — ditampilkan langsung di layar.)*
- **Sesi** disimpan di `localStorage` — refresh/reload tidak mengeluarkan Anda.
- **Join rapat tidak wajib akun** — akun hanya meng-gate dashboard, schedule, dan history.
  Aplikasi lain hanya butuh kode ruang.
- **Nama wajib diisi** sebelum buat/join rapat — kalau kosong, tombol menampilkan pesan
  "Please enter your name first…". Saat sudah login, nama akun terisi otomatis.

## Arsitektur

```
┌──────────────────┐        ┌──────────────────────────────────────────┐        ┌───────────────┐
│  React 19 + Vite │   WS   │  Cloudflare Worker (apps/worker)         │   D1   │  Cloudflare D1│
│   (apps/web)     │───────▶│  • index.ts   — entry & routing          │────────▶│  users/sesi   │
│  livekit-client  │        │  • huddleDO.ts — Durable Object:         │        │  history/jadwal│
└────────┬─────────┘        │      room state, chat, polls, auth,      │        └───────────────┘
         │ publish/         │      signaling (WebSocket native)        │
         │ subscribe        │  • livekit.ts — token HS256 JWT          │
         ▼                 │  • static assets (web build)              │
┌──────────────────┐        └──────────────────────────────────────────┘
│   LiveKit SFU    │◀───────
│  (media server)  │   Selective Forwarding Unit — 1 upload per peserta,
└──────────────────┘   server forward selektif (bukan P2P mesh)
```

- **Monorepo pnpm + Turborepo**: `apps/web` (React), `apps/worker` (Cloudflare), `packages/shared` (types/constants).
- **Realtime** ditangani **Durable Object** (`HuddleDO`) — WebSocket native di edge; selalu-on, gratis, tanpa maintenance.
- **Media** lewat **LiveKit SFU**: setiap peserta publish 1× ke server, server meneruskan secara selektif → skala lebih besar daripada P2P.
- **Data** di **D1** (serverless SQLite) — tabel dibuat otomatis saat koneksi pertama (`CREATE TABLE IF NOT EXISTS`).
- **Frontend & worker satu origin**: build web di-upload sebagai static assets worker; koneksi WS ke `/ws` di origin yang sama (tanpa CORS issue).

> Detail lengkap: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Quick Start (Development)

> Prasyarat: **Node.js ≥ 18** dan **pnpm ≥ 9** (`corepack enable` atau `npm i -g pnpm`).

```bash
# 1. Install dependencies
pnpm install

# 2. Jalankan worker lokal (Terminal 1) — port 8787
cd apps/worker
npx wrangler dev

# 3. Jalankan frontend (Terminal 2) — port 5173
pnpm dev:web
```

Buka **http://localhost:5173** → isi nama → **New meeting** → izinkan kamera/mikrofon.

- Vite mem-proxy `/ws` ke `http://localhost:8787`, jadi WebSocket mengarah ke worker lokal.
- `wrangler dev` butuh `npx wrangler login` dan D1 binding valid (lihat [DEPLOYMENT.md](docs/DEPLOYMENT.md)).
- **Tanpa D1**: komentari binding D1 di `wrangler.toml` — room/chat/video tetap jalan, tapi auth/dashboard tidak persisten.
- **Tanpa LiveKit** (`LIVEKIT_*`): semua fitur non-video tetap jalan; endpoint token mengembalikan 503.

## Deploy ke Produksi

Deployment satu perintah (build web + upload worker):

```bash
pnpm deploy
```

atau manual:

```bash
pnpm --filter @meet-app/web build   # frontend → apps/web/dist
cd apps/worker
npx wrangler deploy                 # worker + assets + D1 binding
```

Setelah sukses, seluruh aplikasi tersaji di **satu URL**: `https://<nama-worker>.workers.dev`.
Buka URL → **Sign up** untuk daftar akun, atau langsung buat/join rapat tanpa akun.

> Konfigurasi lengkap (D1, secrets, vars, custom domain, rollback, troubleshooting):
> [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

## Scripts

| Perintah | Fungsi |
|---|---|
| `pnpm dev:web` | Frontend dev (Vite, hot reload, port 5173) |
| `pnpm --filter @meet-app/web build` | Build frontend statis → `apps/web/dist` |
| `pnpm deploy` | Build web + deploy worker ke Cloudflare (one command) |
| `cd apps/worker && npx wrangler dev` | Worker lokal (dev, port 8787) |
| `cd apps/worker && npx wrangler deploy` | Deploy worker + assets + D1 binding |
| `pnpm build` | Build semua paket (turbo) |
| `pnpm test` | Jalankan seluruh test (Vitest) |
| `pnpm typecheck` | Type-check semua workspace |

## Testing

- **Web** (`apps/web`): test komponen (ControlBar, TimePicker, VideoPlayer, buildInviteMailto) + hook (usePushToTalk) via Vitest + Testing Library.
- **Worker** (`apps/worker`): belum ada unit test terpisah — verifikasi via smoke test.
- Menjalankan: `pnpm test`.

**Smoke test produksi** (setelah deploy):

```bash
curl https://<worker>.workers.dev/health                          # → {"ok":true}
curl -I https://<worker>.workers.dev/                             # → HTTP 200
curl -s -o /dev/null -w "%{http_code}" \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  https://<worker>.workers.dev/ws                                 # → 101 (handshake ok)
```

Verifikasi manual di browser: buka URL (hard refresh `Ctrl+F5`), klik **New meeting**,
izinkan mic/kamera, pastikan masuk ruang dengan kode 6 karakter.

## Struktur Repo

```
meet-app/
├─ apps/
│  ├─ web/                         # React 19 + Vite + livekit-client (SPA frontend)
│  │  └─ src/
│  │     ├─ pages/
│  │     │  ├─ HomePage.tsx        # Landing/dashboard/schedule/history + join flow
│  │     │  ├─ home/styles.ts      # Styles HomePage (dipisah agar file ringkas)
│  │     │  ├─ RoomPage.tsx        # View video meeting (orchestrates all panels)
│  │     │  └─ room/styles.ts      # Styles RoomPage
│  │     ├─ components/            # AuthModal, PreJoinScreen, ControlBar, VideoGrid, dll
│  │     ├─ hooks/                 # useLiveKit, usePushToTalk, useSpeakingLevel
│  │     ├─ contexts/              # Socket, Auth, Room context
│  │     └─ lib/wsSocket.ts        # WebSocket adapter (Socket.IO-compatible)
│  └─ worker/     # Cloudflare Worker + Durable Object (realtime, auth, LiveKit token, static assets)
├─ packages/
│  └─ shared/     # Types & constants bersama (SOCKET_EVENTS, DASH_EVENTS, dll)
├─ docs/          # Dokumentasi teknis (lihat di bawah)
├─ vitest.workspace.ts
├─ turbo.json     # Turborepo pipeline
└─ package.json   # pnpm workspace root
```

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arsitektur sistem, alur data, task graph |
| [docs/COMPONENTS.md](docs/COMPONENTS.md) | Dokumentasi setiap komponen React + perilaku |
| [docs/API.md](docs/API.md) | Protokol WebSocket, event client↔server, endpoint HTTP |
| [docs/FEATURES.md](docs/FEATURES.md) | Riwayat/changelog fitur lengkap |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Setup Cloudflare, D1, secrets, vars, deploy, rollback |
| [docs/CODE_GUIDE.md](docs/CODE_GUIDE.md) | Panduan struktur kode per file |

---

## Lisensi

Proyek pribadi. Dibangun di atas LiveKit SFU · Cloudflare Workers · React.