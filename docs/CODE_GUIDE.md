# Huddle — Panduan Kode (Code Guide)

Dokumen ini menjelaskan **setiap file** dalam repo: apa gunanya, bagaimana cara
kerjanya, dan apa yang menghubungkannya. Cocok untuk orientasi cepat atau memulai
kontribusi.

Struktur repo:

```
meet-app/
├─ apps/
│  ├─ worker/        # Backend: Cloudflare Worker + Durable Object (realtime, auth, D1)
│  └─ web/           # Frontend: React SPA (Vite + LiveKit client)
├─ packages/
│  └─ shared/        # Tipe & konstanta bersama (kontrak API antar worker ↔ web)
├─ docs/             # Dokumentasi
└─ package.json      # Root: perintah turbo/pnpm
```

---

## 1. `packages/shared` — kontrak bersama

Tipe dan konstanta yang dipakai KEDUA sisi (worker & web). Karena diketik sekali,
perubahan kontrak otomatis terlihat di semua pemakai.

### `src/types.ts`
Mendefinisikan **19 tipe** yang menjadi "shape data" di seluruh app.

| Tipe | Guna |
|------|------|
| `User` | Satu peserta meeting: id, nama, isHost, isMuted, isVideoOff, isHandRaised, joinedAt. |
| `Room` | Satu ruang meeting: code 6 karakter, hostId, daftar peserta, kuncian, judul, recording, waiting room, timer. |
| `CreateRoomRequest` / `JoinRoomRequest` | Payload saat client membuat / join ruang. |
| `ChatMessage` | Satu pesan chat (id, pengirim, teks, waktu). |
| `ICECandidate` / `SignalPayload` | Envelope signaling WebRTC (offer/answer/ICE) yang di-relay antar peserta lewat DO. |
| `RoomState` | Snapshot ruang + peserta yang disiarkan saat ada perubahan. |
| `MeetingSettings` | Resolusi video, perangkat audio/video, virtual background. |
| `RecordingState` | Status rekaman (aktif/diam, siapa memulai, sejak kapan). |
| `LayoutMode` | Mode tata letak video: auto/grid/speaker/sidebar. |
| `InviteLink` | Kode + URL undangan. |
| `MeetingNote` / `ActionItem` / `MeetingSummary` | Data AI Companion (tidak lagi dipakai UI, dipertahankan untuk kompatibilitas tipe). |
| `ReactionType` / `Reaction` | Emoji reaksi yang dikirim peserta. |
| `Poll` / `PollOption` | Polling dengan opsi + suara. |
| `CaptionSegment` | Segmen teks live captions (Web Speech API). |
| `WaitingUser` | Peserta yang menunggu di waiting room (host lihat daftar ini). |

### `src/constants.ts`
- `SOCKET_EVENTS` — **nama semua event** yang jadi protokol WebSocket antar
  worker ↔ web (mis. `room:create`, `chat:message`). Nilai string, dipakai di
  kedua sisi sehingga typo langsung ketahuan saat typecheck.
- `ROOM_CONFIG` — batas peserta (10), panjang kode (6), alfabet kode.
- `RESOLUTION_PRESETS` / `MEDIA_CONSTRAINTS` — preset resolusi & constraint
  kamera/mikro default (720p30, echo cancellation).
- `POLL_MAX_OPTIONS` — batas opsi polling (6).

### `src/__tests__/constants.test.ts`
Memastikan nilai `SOCKET_EVENTS` dan konstanta tidak berubah tanpa sengaja.

---

## 2. `apps/worker` — backend Cloudflare (semua realtime)

Backend tidak lagi berupa server Node. Satu **Worker** menangani HTTP, dan satu
**Durable Object** (`HuddleDO`) memiliki semua koneksi WebSocket + state ruang.

### `wrangler.toml`
Konfigurasi deploy Cloudflare:
- `assets` → folder build frontend (`../web/dist`) yang otomatis di-serve.
- `[[d1_databases]]` → binding `DB` ke database D1 `huddle`.
- `[[durable_objects.bindings]]` → daftarkan class `HuddleDO`.
- `[[migrations]]` → buat kelas Durable Object versi `v1`.
- `[vars]` → variabel non-rahasia (`LIVEKIT_URL`, `LIVEKIT_API_KEY`).

### `src/index.ts` — Worker entry
Fungsi `fetch(request, env)` routing semua request:
1. `OPTIONS` → balas CORS.
2. `/health` → `{"ok":true}` (probe uptime).
3. `/api/livekit/token?room=&name=` → terbitkan JWT video (lihat `livekit.ts`).
4. `/auth/github/callback` → alur OAuth GitHub (lihat `githubOAuth.ts`).
5. `/auth/google/callback` → alur OAuth Google/Gmail (lihat `googleOAuth.ts`).
6. `/ws` → upgrade WebSocket ke Durable Object `HuddleDO` (satu global).
7. lainnya → `env.ASSETS.fetch` (serve frontend build).

### `src/huddleDO.ts` — Durable Object (inti realtime)
Objek persist yang **memiliki**:
- Semua koneksi WebSocket (`sockets`, `ids` maps).
- Semua state ruang: `rooms`, `chatHistory`, `userRoomMap`, `roomIdToCode`,
  `roomPolls`, waiting-room maps.
- Metode `handle(ws, event, data, ack)` = **router semua event** (switch besar
  atas `SOCKET_EVENTS`): create/join/leave room, chat, signaling, muting,
  hand-raise, layout, settings, background, invite, reactions, polls, captions,
  waiting room, end meeting, auth (`auth:register/login/me/logout`), dan
  dashboard (`dash:getHistory/schedule/getSchedule/cancelSchedule`).

Cara kerja singkat:
- Client kirim JSON `{ e: event, d: data, ack? }`; DO memproses & mengirim
  balasan `{ e, d, ack? }` (ack untuk pola panggil-balik auth/dashboard).
- `broadcast(code, e, d, exceptId)` mengirim event ke semua peserta ruang.
- `handleDisconnect` (saat WS tutup) otomatis melepas peserta → host berpindah
  jika perlu, ruang dibersihkan jika kosong.
- `recordMeeting` ditulis ke D1 saat meeting diakhiri host.

### `src/database.ts` — lapisan D1
Menggantikan D1Client HTTP lama; memakai **binding D1 native** (`env.DB`).
- `ensureSchema(db)` — buat tabel `users`, `sessions`, `meeting_history`,
  `scheduled_meetings` (idempotent).
- `DB` class — CRUD: sesi, user, riwayat meeting, jadwal meeting.

### `src/password.ts` — hashing password
PBKDF2 via WebCrypto (100k iterasi, SHA-256). Format `pbkdf2:iter:salt:hex`.
Workers tidak punya `scrypt` Node, jadi diganti PBKDF2 yang setara aman.

### `src/livekit.ts` — token video LiveKit
Menerbitkan **JWT HS256** (sign via WebCrypto) yang memberi izin join ruang
LiveKit + publish/subscribe. Menggantikan `livekit-server-sdk` (tak jalan di edge).

### `src/githubOAuth.ts` — login GitHub
Callback OAuth: tukar `code` → access token GitHub → ambil profil + email →
find-or-create user di D1 → set session → redirect ke `CLIENT_URL/?auth_token=...`.

### `src/googleOAuth.ts` — "Sign in with Google" (Gmail)
Callback OAuth Google: tukar `code` → access token (endpoint token Google) →
ambil profil (id/name/email via `/oauth2/v2/userinfo`) → find-or-create user di D1
(dengan `google_id`) → set session → redirect ke `CLIENT_URL/?auth_token=...`.
Butuh secret `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + var `CLIENT_URL`.

---

## 3. `apps/web` — frontend React

SPA React 19 (Vite). Komunikasi realtime lewat **WebSocket** ke `/ws` (worker),
dengan adapter yang meniru API socket.io agar komponen tetap sederhana.

### `src/main.tsx` — entry React
Render `App` ke `#root`, import `index.css`.

### `src/App.tsx` — routing sederhana
State `view` ("home" | "room") tanpa library router. Membungkus app dalam
`SocketProvider` → `AuthProvider` → `RoomProvider`.

### `src/lib/wsSocket.ts` — adapter WebSocket
`WsSocket` meniru `socket.io-client` (`.on/.off/.once/.emit/close`, `.id`,
event `connect`/`disconnect`, auto-reconnect dengan backoff).
- Mengirim `{ e, d, ack? }` sesuai protokol worker.
- Buffer event saat offline, flush saat konek.
- Re-emit `room:create`/`room:join` setelah reconnect agar DO menyinkronkan
  ulang state ruang + chat history.

### `src/contexts/SocketContext.tsx`
Provider yang membuat satu `WsSocket` untuk seluruh app; expose
`useSocket()` → `{ socket, isConnected }`.

### `src/contexts/AuthContext.tsx`
State login user + token (localStorage). Fungsi `register/login/logout` pakai
pola ack (`.emit(event, data, callback)`) ke worker.

### `src/contexts/RoomContext.tsx`
State meeting bersama: `room`, `currentUser`, `participants`, `messages`,
`layout`, `recording`, `meetingStartedAt` + setter helper.

### `src/hooks/`
- `useLiveKit.ts` — konek ke LiveKit (SFU): publish kamera/mik/layar, kelola
  track remote sebagai `MediaStream`, mute/video/screen-share toggle.
- `usePushToTalk.ts` — hold-to-talk: hotkey tahan → unmute, lepas → mute, dan
  auto-mute saat blur/unmount.
- `useSpeakingLevel.ts` — deteksi level suara lokal (untuk ring "speaking").

### `src/components/` — UI
| Komponen | Guna |
|----------|------|
| `ChatPanel` | Daftar + kirim pesan chat. |
| `ControlBar` | Bar bawah: mic, kamera, layar, hand-raise, rekam, chat, peserta, invite, layout, setting, end meeting. |
| `InviteModal` | Salin link undangan (kode + URL) + mailto. |
| `LiveCaptions` | Web Speech API → segment streaming ke room. |
| `MeetingTimer` | Timer meeting (startedAt → HH:MM:SS). |
| `MeetingTitle` | Edit judul meeting (host). |
| `ParticipantList` | Daftar peserta dengan status mic/kamera, host crown, "You". |
| `PollModal` | Buat/vote/tutup polling. |
| `PreJoinScreen` | Lobby pre-join: preview kamera, pilih device, nama. |
| `ReactionBar` / `ReactionOverlay` | Pilih emoji + animasi floating. |
| `RecordingIndicator` | Indikator REC/PAUSED + timer. |
| `SchedulePicker` | Kalender custom + time picker AM/PM. |
| `SegmentedVideo` | View video saat meeting (pengganti lama). |
| `SettingsPanel` | Resolusi, device, virtual background (upload gambar). |
| `SpeakerView` | Layout speaker (spotlight + thumbnails samping). |
| `VideoGrid` | Grid responsif video tiles (auto/grid/speaker/sidebar). |
| `VideoPlayer` | Tile video tunggal (stream/off-state, nama, badge). |
| `ViewSettingsModal` | Pilih mode tata letak (Adjust view). |
| `WaitingRoom` | Panel host untuk admit/reject pengunjung. |

### `src/pages/`
| Page | Guna |
|------|------|
| `HomePage` | Landing + dashboard: hero (New meeting / join code), feature strip, sign-in modal (email/GitHub), admin Schedule & History views. |
| `RoomPage` | Tampilan meeting utama: header, video area, sidebar chat/participant, ControlBar, semua modal, listener WebSocket. |

### `src/__tests__/`
Unit test (Vitest + Testing Library): ControlBar, TimePicker, VideoPlayer,
buildInviteMailto, usePushToTalk, App smoke. Menjaga perilaku komponen.
`src/test/setup.ts` menyiapkan jsdom + matchMedia.

### `src/index.css`
Seluruh styling (CSS variables tema light/dark, layout, komponen). ~780 baris,
bagian per fitur dengan komentar header.

---

## 4. Root files

| File | Guna |
|------|------|
| `package.json` | Script turbo: dev/build/test/typecheck/deploy. |
| `pnpm-workspace.yaml` | Workspace `apps/*` + `packages/*`; izinkan build sharp/workerd. |
| `turbo.json` | Task graph (build depends on ^build, dst). |
| `tsconfig.base.json` | Config TS bersama (strict, ESNext). |
| `vitest.workspace.ts` | Vitest memindai config per package. |
| `.gitignore` | Ignore node_modules, dist, .turbo, env, secret. |

---

## 5. Alur data ringkas (end-to-end)

```
[Buka URL] → Worker serve index.html (ASSETS)
[Isi nama → New meeting]
  → HomePage emit {e:'room:create'} → WebSocket → HuddleDO
  → DO buat room + code, balas {e:'room:created'} → masuk RoomPage
  → RoomPage minta token: GET /api/livekit/token → LiveKit JWT
  → useLiveKit connect ke LiveKit SFU → publish kamera/mik
[Peserta lain join kode]
  → {e:'room:join'} → DO tambah peserta → broadcast participant:joined + room:state
  → media video mengalir via LiveKit (SFU), bukan P2P
[Chat]
  → {e:'chat:message'} → DO simpan + broadcast ke room
[Auth / Schedule]
  → emit dengan ack → DO baca/tulis D1 → balas hasil
[Host end meeting]
  → broadcast meeting:ended → DO tulis riwayat ke D1
```

---

## 6. Perintah berguna

```bash
pnpm install                    # pasang semua workspace
pnpm --filter @meet-app/web build   # build frontend → apps/web/dist
cd apps/worker && npx wrangler dev  # backend lokal :8787
pnpm dev:web                    # frontend dev :5173 (proxy /ws → :8787)
pnpm --filter @meet-app/web test   # test frontend
cd apps/worker && npx tsc --noEmit # typecheck backend
pnpm deploy                     # build web + deploy worker ke Cloudflare
```