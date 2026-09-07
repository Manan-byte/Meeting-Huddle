# Huddle — Deployment

Huddle berjalan **seluruhnya di Cloudflare** (Worker + Durable Object + D1). Deployment
adalah `wrangler deploy` — tidak ada server Node, VPS, Docker, atau Render/Railway.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | ≥ 18.x | Runtime untuk tooling (pnpm, wrangler) |
| pnpm | ≥ 9.x | Package manager + workspace orchestration |
| Cloudflare account | — | Worker + D1 (atau D1 terpisah per project) |
| LiveKit Cloud | — | SFU media (gratis tier tersedia) |

## Local Development

### 1. Install Dependencies

```bash
cd meet-app
pnpm install
```

### 2. Jalankan Worker & Web (dev, hot reload)

```bash
# Terminal 1 — Worker lokal (wrangler dev, port 8787)
cd apps/worker
npx wrangler dev

# Terminal 2 — Frontend (Vite dev, port 5173)
pnpm dev:web
```

Vite mem-proxy `/ws` ke `http://localhost:8787`, jadi koneksi WebSocket mengarah ke worker
lokal. Buka **http://localhost:5173**.

> `wrangler dev` membutuhkan login (`npx wrangler login`) dan D1 binding yang valid
> (`wrangler.toml`). Untuk pengembangan tanpa D1, komentari binding D1 — fitur
> auth/dashboard tidak akan persist, tapi room/chat/video tetap jalan.

## Konfigurasi Cloudflare

### 1. D1 Database

Buat database D1 (sekali):

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

Tabel dibuat otomatis saat pertama koneksi (`CREATE TABLE IF NOT EXISTS` di
`src/database.ts:ensureSchema`). D1 punya dashboard di
https://dash.cloudflare.com → Workers & Pages → D1.

### 2. Secrets (wajib untuk video)

```bash
cd apps/worker
npx wrangler secret put LIVEKIT_API_SECRET
```

Secret yang didukung:

| Secret | Wajib? | Deskripsi |
|--------|--------|-----------|
| `LIVEKIT_API_SECRET` | Ya (untuk video) | LiveKit API secret (LiveKit Cloud → project → API keys) |
| `GITHUB_CLIENT_ID` | Opsional | GitHub OAuth app client id |
| `GITHUB_CLIENT_SECRET` | Opsional | GitHub OAuth app client secret |
| `GOOGLE_CLIENT_ID` | Opsional | Google OAuth client id ("Sign in with Google") |
| `GOOGLE_CLIENT_SECRET` | Opsional | Google OAuth client secret |

### 3. Vars (non-secret, di `wrangler.toml` `[vars]`)

```toml
[vars]
LIVEKIT_URL = "wss://<your-project>.livekit.cloud"
LIVEKIT_API_KEY = "API<...>"
CLIENT_URL = "https://<worker>.workers.dev"
```

| Var | Wajib? | Deskripsi |
|-----|--------|-----------|
| `LIVEKIT_URL` | Ya (video) | LiveKit server URL |
| `LIVEKIT_API_KEY` | Ya (video) | LiveKit API key |
| `CLIENT_URL` | Opsional | Base URL untuk invite links & OAuth callback (GitHub/Google); default folder |

## Build & Deploy

```bash
# 1. Build frontend (akan di-upload sebagai static assets worker)
pnpm --filter @meet-app/web build

# 2. Deploy worker + assets + D1 binding
cd apps/worker
npx wrangler deploy
```

Output:

```
Uploaded huddle (12.26 sec)
  https://huddle.<subdomain>.workers.dev
```

Buka URL tersebut. Worker menyajikan **semuanya** di satu origin:

- Frontend (build `apps/web/dist`, via `assets` binding)
- `GET /health` → `{"ok":true}`
- `GET /api/livekit/token?room=&name=` → JWT LiveKit
- `GET /auth/github/callback` → GitHub OAuth callback
- `GET /auth/google/callback` → Google OAuth callback
- `GET /ws` → WebSocket realtime (Durable Object)

## Env untuk GitHub OAuth (opsional)

1. Buat OAuth App di GitHub (Settings → Developer settings → OAuth Apps):
   - **Homepage URL**: `https://<worker>.workers.dev`
   - **Callback URL**: `https://<worker>.workers.dev/auth/github/callback`
2. Set `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` sebagai secrets worker.
3. Set `CLIENT_URL=https://<worker>.workers.dev` di `[vars]`.

Tanpa konfigurasi ini, tombol GitHub di sign-in menampilkan toast "belum dikonfigurasi".

## Env untuk Google OAuth / "Sign in with Google" (opsional)

1. Buka **https://console.cloud.google.com/apis/credentials** → **Create Credentials →
   OAuth client ID → Web application**.
   - **Authorized redirect URIs**: `https://<worker>.workers.dev/auth/google/callback`
2. Set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` sebagai secrets worker.
3. Set `CLIENT_URL=https://<worker>.workers.dev` di `[vars]`.
4. Buat `apps/web/.env` (gitignored):
   ```
   VITE_GOOGLE_CLIENT_ID=<client_id>
   ```
   lalu `pnpm --filter @meet-app/web build` + `npx wrangler deploy` — sehingga tombol
   "Continue with Google" ter-bundle dengan client id.

Tanpa langkah 4, tombol tetap tampil tapi menampilkan toast "belum dikonfigurasi".
Tanpa step 1–3, callback `/auth/google/callback` menampilkan error "Google OAuth is not
configured".

## Custom Domain (opsional, permanen)

URL `*.workers.dev` gratis tapi tidak permanen (bisa berubah). Untuk URL permanen:

1. Daftarkan domain di registrar mana pun (Namecheap, Cloudflare Registrar, dll).
2. Di Cloudflare dashboard: **Workers & Pages → huddle → Settings → Domains & Routes → Add**
   — tambahkan `meet.domainmu.com` dan ikuti instruksi CNAME ke
   `<worker>.<subdomain>.workers.dev`.
3. Update `CLIENT_URL` di `[vars]` → deploy ulang.

Biaya: hanya biaya domain (~$10/tahun); Cloudflare Tunnel/Worker tetap gratis.

## Verifikasi Deploy

```bash
# Health
curl https://<worker>.workers.dev/health
# → {"ok":true}

# LiveKit token (harus 200, bukan 503)
curl "https://<worker>.workers.dev/api/livekit/token?room=demo&name=T"
# → {"token":"...","url":"wss://..."}

# Frontend
curl -I https://<worker>.workers.dev/
# → HTTP 200
```

Smoke test WebSocket penuh (create room → guest join → chat broadcast) bisa dijalankan
dengan skrip Node singkat — lihat riwayat commit "Cloudflare Workers rewrite" untuk
contoh, atau verifikasi manual di browser: buka URL, **New meeting**, izinkan mic/kamera.

## Rollback

`wrangler deploy` membuat versi baru tiap rilis. Untuk rollback:

```bash
cd apps/worker
npx wrangler deployments list
npx wrangler rollback <deployment-id>
```

## Scaling (skala kecil → menengah)

Arsitektur saat ini: **satu Durable Object global** untuk semua room — sangat cukup untuk
skala kecil/menengah (puluhan hingga ratusan meeting aktif bersamaan). D1 + LiveKit Cloud
menangani beban data + media.

Ketika melebihi kapasitas satu DO (ribuan koneksi simultan), langkah berikut:

1. **DO per-room**: hash room code → DO instance (`idFromName(code)`), bukan satu DO global
   — memecah beban dan memanfaatkan isolasi per-ruangan.
2. **D1 tetap** untuk metadata/users (sudah benar — D1 bukan hot path realtime).
3. **LiveKit Cloud** scaling: naikkan plan / gunakan multi-region LiveKit.

## Limitations

- **Room state in-memory per DO**: live rooms/participants/chat hidup di Durable Object
  (memori + DO storage). Restart/deploy DO mengakhiri meeting aktif. Data durable
  (accounts, sessions, history, schedule) di **D1**.
- **Media requires LiveKit**: video/audio hanya berfungsi saat `LIVEKIT_URL`/
  `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` terisi. Tanpa itu, fitur non-video tetap jalan
  (endpoint token mengembalikan 503).
- **Anyone with a room code can join** — joining tidak butuh akun (akun meng-gate
  dashboard & Schedule, bukan panggilan).
- **Max participants per room**: `ROOM_CONFIG.MAX_PARTICIPANTS` (10); naikkan untuk
  meeting lebih besar — LiveKit SFU menangani banyak peserta.
- **HTTPS**: Worker menyediakan HTTPS otomatis (WebRTC aman) tanpa konfigurasi.
- **GitHub OAuth**: diimplementasikan di Worker (callback + token exchange); butuh
  `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` + `CLIENT_URL`. Password reset belum
  diimplementasikan.
- **AI Companion**: handler keyword-extraction ada di Worker, tapi **tidak disurface di
  web UI** (dihapus di v0.2).
- **Live Captions**: tergantung dukungan Web Speech API browser (Chrome/Edge terutama).
- **CORS**: Worker mengembalikan `Access-Control-Allow-Origin: *` (cocok untuk domain
  apa pun / trycloudflare). Untuk produksi dengan domain tetap, bisa diperketat ke
  origin spesifik di `src/index.ts`.