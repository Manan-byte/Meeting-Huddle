# Huddle — Deployment & Operasional

Huddle berjalan **seluruhnya di Cloudflare**: Worker + Durable Object + D1. Deployment
adalah satu perintah `wrangler deploy` — **tidak ada** server Node, VPS, Docker, atau
Render/Railway. Setiap deploy menghasilkan versi baru yang bisa di-rollback.

**Produksi live saat ini:** https://huddle.abdmanan513.workers.dev (worker `huddle`, akun
Cloudflare `abdmanan513@gmail.com`).

---

## Daftar Isi

- [Apa yang Terjadi Saat Deploy](#apa-yang-terjadi-saat-deploy)
- [Prerequisites](#prerequisites)
- [Struktur `wrangler.toml`](#struktur-wranglertoml)
- [Local Development](#local-development)
- [Setup Akun Cloudflare](#setup-akun-cloudflare)
- [1. Database D1](#1-database-d1)
- [2. Secrets (wajib untuk video)](#2-secrets-wajib-untuk-video)
- [3. Vars (non-secret)](#3-vars-non-secret)
- [Build & Deploy Produksi](#build--deploy-produksi)
- [Yang Disajikan Worker](#yang-disajikan-worker)
- [Verifikasi Deploy](#verifikasi-deploy)
- [Update / Redeploy](#update--redeploy)
- [Troubleshooting](#troubleshooting)
- [Custom Domain (opsional)](#custom-domain-opsional)
- [Rollback](#rollback)
- [Scaling](#scaling)
- [Keamanan](#keamanan)
- [Limitations](#limitations)

---

## Apa yang Terjadi Saat Deploy

```bash
pnpm deploy
```

(≈ `pnpm --filter @meet-app/web build && cd apps/worker && wrangler deploy`)

1. **Build frontend** — Vite mengompilasi React SPA → `apps/web/dist`.
2. **Upload assets** — folder `apps/web/dist` di-upload sebagai **static assets** worker
   (hanya file yang berubah yang di-upload ulang).
3. **Upload worker** — `apps/worker/src/index.ts` (+ `huddleDO.ts`, `database.ts`,
   `livekit.ts`, `password.ts`) di-bundle & di-deploy.
4. **Binding** — D1 (`DB`), Durable Object (`HUDDLE_DO`), dan vars dipasang otomatis
   mengikuti `wrangler.toml`.

Hasilnya satu origin yang menyajikan frontend **dan** backend:

> https://huddle.abdmanan513.workers.dev/ — menangani semuanya

## Prerequisites

| Tool | Versi | Fungsi |
|------|-------|--------|
| Node.js | ≥ 18.x | Runtime tooling (pnpm, wrangler) |
| pnpm | ≥ 9.x | Package manager + workspace |
| Akun Cloudflare | — | Worker + D1 |
| LiveKit Cloud | — | SFU media (free tier cukup) |

## Struktur `wrangler.toml`

Lokasi: `apps/worker/wrangler.toml`

```toml
name = "huddle"                       # nama worker → https://huddle.<subdomain>.workers.dev
main = "src/index.ts"                 # entry worker
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]

# Frontend build disajikan sebagai static assets (satu origin).
[assets]
directory = "../web/dist"
binding = "ASSETS"

# D1 — users, sessions, history, schedule.
[[d1_databases]]
binding = "DB"
database_name = "huddle"
database_id = "f0595706-664f-4409-9649-629b94e974cc"

# Durable Object — semua state room + koneksi WebSocket.
[[durable_objects.bindings]]
name = "HUDDLE_DO"
class_name = "HuddleDO"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["HuddleDO"]

# Vars non-secret.
[vars]
LIVEKIT_URL = "wss://huddler-xonlpeio.livekit.cloud"
LIVEKIT_API_KEY = "APICLqCAoWYafBz"
CLIENT_URL = "https://huddle.abdmanan513.workers.dev"
```

> ⚠️ `LIVEKIT_API_SECRET` **tidak** ada di file ini — itu secret, di-set via
> `wrangler secret put` (lihat bagian Secrets).

## Local Development

```bash
# 1. Install dependencies
pnpm install

# 2. Worker lokal (Terminal 1) — port 8787
cd apps/worker
npx wrangler dev

# 3. Frontend (Terminal 2) — port 5173
pnpm dev:web
```

Buka **http://localhost:5173**.

- Vite (vite.config.ts) mem-proxy `/ws` ke `http://localhost:8787`, jadi WebSocket mengarah
  ke worker lokal tanpa CORS.
- `wrangler dev` butuh login (`npx wrangler login`) dan D1 binding valid.
- **Pengembangan tanpa D1**: komentari binding D1 — server tetap boot; fitsur auth/dashboard
  tidak persisten, tapi room/chat/video tetap jalan.
- **Pengembangan tanpa LiveKit**: komentari vars `LIVEKIT_*` — endpoint token mengembalikan
  503; semua fitur non-video tetap jalan.

## Setup Akun Cloudflare

Sekali saja:

```bash
npx wrangler login          # buka browser, authorize akun Cloudflare
npx wrangler whoami         # pastikan login benar
```

Contoh output `whoami`:

```
👋 You are logged in with an OAuth Token, associated with the email abdmanan513@gmail.com.
┌─────────────────────────────────┬──────────────────────────────────┐
│ Account Name                    │ Account ID                       │
```

## 1. Database D1

**Sekali saja** (di produksi saat ini sudah dibuat):

```bash
cd apps/worker
npx wrangler d1 create huddle
```

Salin `database_id` hasilnya ke `apps/worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "huddle"
database_id = "<database_id>"
```

- Tabel dibuat **otomatis** saat koneksi pertama (`CREATE TABLE IF NOT EXISTS` di
  `src/database.ts:ensureSchema`) — tidak ada migrasi manual.
- Dashboard: https://dash.cloudflare.com → Workers & Pages → D1 → `huddle`.
- Data yang disimpan: users, sessions/token, meeting history, scheduled meetings.

## 2. Secrets (wajib untuk video)

```bash
cd apps/worker
npx wrangler secret put LIVEKIT_API_SECRET
```

| Secret | Wajib? | Deskripsi |
|--------|--------|-----------|
| `LIVEKIT_API_SECRET` | Ya (video) | LiveKit API secret (LiveKit Cloud → Project → API keys) |

Secret tersimpan terenkripsi di Cloudflare (tidak di repo). Ganti secret = deploy ulang
bukan diperlukan — secret berlaku di semua versi worker.

## 3. Vars (non-secret)

Di `wrangler.toml` `[vars]` (atau dashboard Workers & Pages → Settings → Variables):

```toml
[vars]
LIVEKIT_URL = "wss://<your-project>.livekit.cloud"
LIVEKIT_API_KEY = "API<...>"
CLIENT_URL = "https://<worker>.workers.dev"
```

| Var | Wajib? | Deskripsi |
|-----|--------|-----------|
| `LIVEKIT_URL` | Ya (video) | Endpoint WebSocket LiveKit project |
| `LIVEKIT_API_KEY` | Ya (video) | LiveKit API key (public, aman di vars) |
| `CLIENT_URL` | Opsional | Base URL untuk invite links (`?join=CODE`) & redirects; default relative path |

Mengganti vars → **perlu deploy ulang** agar efektif.

## Build & Deploy Produksi

**Satu perintah:**

```bash
pnpm deploy
```

**Manual (sama hasilnya):**

```bash
# 1. Build frontend (di-upload sebagai static assets)
pnpm --filter @meet-app/web build

# 2. Deploy worker + assets + D1 binding
cd apps/worker
npx wrangler deploy
```

Output sukses (contoh nyata):

```
🌀 Building list of assets...
🌀 Found 3 new or modified static assets to upload. Proceeding with upload...
✨ Success! Uploaded 3 files (3.74 sec)
Uploaded huddle (16.06 sec)
Deployed huddle triggers (1.58 sec)
  https://huddle.abdmanan513.workers.dev
Current Version ID: 772d8d34-d304-4880-884c-7fc9cb2bbd9c
```

> Deploy **tidak** menghentikan layanan — versi baru menggantikan versi lama secara atomik;
> koneksi WebSocket aktif pada versi lama diputus (lihat Limitations: room state in-memory).

## Yang Disajikan Worker

Satu origin `https://<worker>.workers.dev`:

| Route | Fungsi |
|---|---|
| `/` (asset) | Frontend SPA (build `apps/web/dist`) |
| `GET /health` | Health check → `{"ok":true}` |
| `GET /api/livekit/token?room=&name=` | JWT token LiveKit (HS256) |
| `GET /ws` | WebSocket realtime (Durable Object) — rooms, chat, polls, auth, dashboard |

Frontend **tidak** butuh env `VITE_*` apa pun untuk build — semua komunikasi lewat
WebSocket `/ws` di origin yang sama (lihat `apps/web/.env.example`).

## Verifikasi Deploy

```bash
# 1. Health
curl https://<worker>.workers.dev/health
# → {"ok":true}

# 2. Frontend tersaji
curl -I https://<worker>.workers.dev/
# → HTTP 200

# 3. Token LiveKit (harus 200; 503 = LIVEKIT_* belum terisi)
curl "https://<worker>.workers.dev/api/livekit/token?room=demo&name=T"
# → {"token":"...","url":"wss://..."}

# 4. WebSocket handshake (harus 101)
curl -s -o /dev/null -w "%{http_code}" \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  https://<worker>.workers.dev/ws
# → 101
```

**Verifikasi manual di browser** (paling penting):

1. Buka URL di browser **bersih / mode incognito**.
2. Header kanan-atas harus menampilkan **Sign up · Sign in** (belum login).
3. Klik **Sign up** → modal register (Name / Email / Password / Create account).
4. Klik **Sign in** → masuk, lalu Dashboard/Schedule/History muncul di nav.
5. Keluar. Isi nama → **New meeting** → izinkan mic/kamera → **Join now** → masuk ruang
   dengan kode 6 karakter.
6. Dari browser/device lain, masukkan kode yang sama → ikut rapat.

## Update / Redeploy

Setiap perubahan kode cukup:

```bash
git add -A && git commit -m "..." && git push origin main
pnpm deploy
```

Alur singkat: commit → push ke GitHub (repo `Manan-byte/Meeting-Huddle`) → `pnpm deploy`
untuk update produksi.

> 💡 **Cache browser**: setelah deploy, pengguna dengan tab lama mungkin melihat UI lama.
> Hard refresh: **Ctrl+F5** (Windows/Linux) / **Cmd+Shift+R** (macOS). Untuk pengujian
> sendiri, gunakan mode incognito — dijamin build terbaru.

## Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| UI lama / tombol "Sign up" tidak muncul padahal sudah deploy | Cache browser / build lama | Hard refresh (`Ctrl+F5`) atau incognito |
| Header menampilkan user aneh ("Fresh User" dll.) yang tidak ada di kode | Sesi lama di `localStorage` + build lama | Hard refresh; `localStorage.clear()` via DevTools; log out |
| Tombol "Sign out" muncul padahal belum pernah login | Token lama masih tersimpan | Clear storage → reload |
| Tidak bisa join dari browser lain | Build lama di sisi lain / cache | Pastikan URL benar; hard refresh; buka di incognito |
| Join gagal / tombol "Join" nonaktif | Nama kosong atau WebSocket belum connect | Isi nama; tunggu WS connect (~1 dtk); refresh |
| `curl /ws` bukan 101 | Worker tidak di-deploy / route salah | Cek `wrangler deploy` sukses; cek `wrangler deployments list` |
| Token LiveKit 503 | `LIVEKIT_*` belum terisi | `wrangler secret put LIVEKIT_API_SECRET` + cek vars |
| Auth error di browser console `WebSocket connection failed` | Server lokal mati / proxy salah | Jalankan `wrangler dev`; cek port 8787; cek vite proxy `/ws` |
| Data dashboard kosong | Belum login / token invalid | Sign in ulang; cek D1 database ada isinya |
| Video tidak muncul, audio mati | LiveKit misconfig / browser block kamera | Cek vars LiveKit; izinkan permission; cek console `livekit` errors |
| Perubahan tidak muncul setelah `pnpm deploy` | Build gagal di tengah | Jalankan `pnpm --filter @meet-app/web build` dulu, lihat error |

**Diagnosis cepat** — cek versi deployed & riwayat:

```bash
cd apps/worker
npx wrangler deployments list     # daftar versi + kapan
npx wrangler tail                 # streaming log worker (debug realtime)
```

## Custom Domain (opsional, permanen)

URL `*.workers.dev` gratis tapi kurang permanen. Untuk domain sendiri:

1. Tambahkan domain di registrar mana pun (Namecheap, Cloudflare Registrar, dll).
2. Di Cloudflare dashboard: **Workers & Pages → huddle → Settings → Domains & Routes → Add**
   — tambahkan `meet.domainmu.com`, ikuti instruksi CNAME ke `<worker>.<subdomain>.workers.dev`.
3. Update `CLIENT_URL` di `[vars]` → `https://meet.domainmu.com` → deploy ulang.

Biaya: hanya domain (~$10/tahun); Worker tetap gratis.

## Rollback

Setiap `wrangler deploy` membuat versi baru. Untuk kembali ke versi sebelumnya:

```bash
cd apps/worker
npx wrangler deployments list       # catat deployment-id yang diinginkan
npx wrangler rollback <deployment-id>
```

> Rollback mengembalikan **kode worker & assets**, tapi **bukan** D1 data (data D1 tetap
> apa adanya — itu memang yang diinginkan untuk data pengguna).

## Scaling

Arsitektur saat ini: **satu Durable Object global** (`HuddleDO`) untuk semua room — sangat
cukup untuk skala kecil/menengah (puluhan–ratusan meeting aktif bersamaan). D1 + LiveKit
Cloud menangani data + media terpisah.

Ketika satu DO jadi bottleneck (ribuan koneksi simultan):

1. **DO per-room**: hash room code → `idFromName(code)` — satu instance DO per room,
   memecah beban & isolasi per-ruangan.
2. **D1 tetap** untuk metadata/users — benar, D1 bukan hot path realtime.
3. **LiveKit Cloud**: naikkan plan / multi-region LiveKit untuk media.

## Keamanan

- **Auth**: email/password — password di-hash **PBKDF2 (Web Crypto, 100k iterasi)**;
  sesi token disimpan di D1 (`sessions`) + `localStorage` klien.
- **Akun meng-gate dashboard/schedule/history** — join rapat tidak butuh akun
  (by design, seperti Zoom).
- **Room code 6 karakter** = kunci akses rapat; ruang bisa dikunci host dengan **waiting
  room** (host menyetujui peserta).
- **CORS**: worker mengembalikan `Access-Control-Allow-Origin: *` — cocok untuk dev
  (trycloudflare); untuk produksi dengan domain tetap, perkecil ke origin spesifik di
  `src/index.ts`.
- **HTTPS** otomatis dari Worker (WebRTC aman) — tanpa konfigurasi.
- **Secrets** (`LIVEKIT_API_SECRET`) tidak pernah masuk repo — hanya `wrangler secret put`.

## Limitations

- **Room state in-memory per DO**: room/participants/chat hidup di Durable Object (memori +
  DO storage). Deploy/restart DO mengakhiri meeting aktif. Data durable (account, sesi,
  history, jadwal) di **D1**.
- **Media butuh LiveKit**: tanpa `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`,
  fitur non-video tetap jalan; endpoint token 503.
- **Siapa pun dengan kode room bisa join** — akun tidak menggating panggilan.
- **Maksimal peserta**: `ROOM_CONFIG.MAX_PARTICIPANTS` (10); naikkan untuk ruang lebih besar.
- **Password reset tanpa email**: reset code ditampilkan di layar (free tier tanpa SMTP).
- **AI Companion**: handler keyword-extraction ada di Worker tapi tidak disurface di UI
  (dihapus di v0.2).
- **Live Captions**: butuh Web Speech API (Chrome/Edge terutama).
- **Wrangler versi lama**: versi 3.x terpasang; ada update 4.x — upgrade opsional
  (`npm i -D wrangler@4` di `apps/worker`) jika butuh fitur terbaru.