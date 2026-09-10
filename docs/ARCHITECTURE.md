# Huddle — Architecture

## System Overview

Huddle berjalan **seluruhnya di Cloudflare**. Tidak ada server Node/VPS/PC — semua
realtime, data, dan media di-edge/serverless.

```
┌──────────────────────────────────────────────────────────────────────┐
│                         MONOREPO (pnpm + Turborepo)                 │
│                                                                      │
│  ┌──────────────────┐   ┌────────────────────┐   ┌────────────────┐  │
│  │  packages/shared  │   │  apps/worker       │   │  apps/web      │  │
│  │  TypeScript types │   │  Cloudflare Worker │   │  React + Vite  │  │
│  │  Constants        │   │  + Durable Object  │   │  LiveKit SFU   │  │
│  │  Shared contracts │   │  (realtime + auth) │   │  UI components │  │
│  └──────────────────┘   └────────────────────┘   └────────────────┘  │
│         ▲                        ▲                     ▲              │
│         │                        │                     │              │
│         └────── workspace:* ─────┴─────────────────────┘              │
└──────────────────────────────────────────────────────────────────────┘
         │ deploy (wrangler)                    ▲ serve static build
         ▼                                      │
┌─────────────────────────────────────────────────────────────┐
│                 Cloudflare Edge                              │
│  Worker (apps/worker)  →  https://<name>.workers.dev         │
│   • fetch handler: /health, /api/livekit/token, /auth/github,│
│     static assets (web build), /ws → HuddleDO                │
│   • HuddleDO (Durable Object): semua room/chat/poll/auth     │
│     dashboard state + WebSocket connections                  │
│   • D1 binding "DB": users, sessions, history, schedule      │
└─────────────────────────────────────────────────────────────┘
                              │
                 LiveKit Cloud (SFU) — media video/audio
```

## Monorepo Structure

The project uses **pnpm workspaces** with **Turborepo** for orchestration:

- **`packages/shared/`** (`@meet-app/shared`) — Pure TypeScript types and constants shared between worker and web. No runtime dependencies; built via `tsc`.
- **`apps/worker/`** (`@meet-app/worker`) — Cloudflare Worker backend. One Worker entry (`index.ts`) + one Durable Object (`HuddleDO`) that owns every WebSocket connection and all room/chat/poll/auth/dashboard state. Uses the D1 binding for persistence.
- **`apps/web/`** (`@meet-app/web`) — React 19 SPA. Vite build output is uploaded as Worker static assets. Talks to the Worker over a raw WebSocket via a Socket.IO-compatible adapter (`src/lib/wsSocket.ts`).

### Turborepo Task Graph

```
build  ← depends on ^build (shared builds first)
dev    ← no cache, persistent
test   ← depends on build
typecheck ← depends on ^build
```

## Data Flow

### Realtime Path (WebSocket → Durable Object)

Client opens a WebSocket to `/ws` on the Worker; the Worker forwards it to the
single global `HuddleDO` Durable Object (`idFromName("global")`). The DO owns all
connections and routes events between them.

```
Client A                 Worker (HuddleDO)                Client B
   │                           │                            │
   │── room:create ───────────►│                            │
   │◄── room:created ──────────│                            │
   │◄── meeting:started ──────►│                            │
   │                           │◄── room:join ─────────────│
   │                           │── room:joined ───────────►│
   │                           │── participant:joined ────►│
   │                           │── room:state ────────────►│ (all)
   │◄── signal (offer) ────────│◄── signal (offer) ────────│
   │── signal (answer) ────────│── signal (answer) ───────►│
   │◄── signal (ICE) ──────────│◄── signal (ICE) ──────────│
   │                           │                            │
   │════════════════════════════════════════════════════════│
   │              WebRTC P2P Media Stream                   │
   │════════════════════════════════════════════════════════│
```

**Wire protocol** (JSON over WebSocket):

```
client → server: { e: event, d: data, ack?: number }
server → client: { e: event, d: data, ack?: number }
```

- `ack` present → resolves the matching pending `emit(cb)` (used by auth/dashboard).
- no `ack` → normal event dispatch to registered listeners.
- On connect the server sends `{ e: "connect", d: { id } }` so the client learns its
  socket id and marks the connection live.

### Auth & Dashboard (ack-based)

Register/login/logout/me and schedule/history use the same WebSocket with ack
callbacks (matches the old Socket.IO ack pattern). Passwords hashed with **PBKDF2**
(Web Crypto, 100k iterations); sessions stored in D1.

### Chat & Feature Path

```
Client A                    Worker (HuddleDO)                All Clients
   │                               │                            │
   │── chat:message {text} ───────►│                            │
   │                               │── chat:message (full) ────►│
   │── reaction:send {type} ──────►│                            │
   │                               │── reaction:broadcast ─────►│
   │── poll:create {question,opts}►│                            │
   │                               │── poll:update ────────────►│
   │── caption:segment {text} ────►│                            │
   │                               │── caption:segment ────────►│ (final only)
```

**Chat notification** (client-side): When a `CHAT_MESSAGE` arrives and the recipient's
chat panel is closed, `RoomPage` (a) increments `unreadChat` → red pill badge on the
Chat button in `ControlBar`, and (b) shows a floating toast that auto-dismisses after 4s.

## Media Flow (LiveKit SFU)

The video engine is **LiveKit**, a Selective Forwarding Unit (SFU). Each participant
publishes their local track **once** to the LiveKit server; the server forwards media
**selectively**. This scales to dozens of participants per meeting.

```
Client A (joiner)                 LiveKit SFU                    Client B
      │                                │                              │
      │  1. GET /api/livekit/token     │                              │
      │      (Worker issues HS256 JWT) │                              │
      │───────────────────────────────►│                              │
      │  2. Room.connect(url, token)   │                              │
      │───────────────────────────────►│                              │
      │  3. publish camera + mic       │                              │
      │────────────── audio+video ────►│                              │
      │                                │  4. forward (selective)     │
      │                                │─────────────────────────────►│
      │  5. subscribe to remote tracks │◄────────────────────────────│
      │◄────────── forwarded ──────────│                              │
```

**Token endpoint**: `GET /api/livekit/token?room=&name=` (Worker, `src/livekit.ts`)
issues a short-lived HS256 JWT signed with the LiveKit API secret via Web Crypto
(`crypto.subtle`), scoped to a room with publish/subscribe. The API secret stays as a
Worker secret — never sent to the client.

**Client hook**: `useLiveKit` (`hooks/useLiveKit.ts`) connects to the room, publishes
local camera+mic (and screen share), and surfaces remote tracks as `MediaStream`s.

## Room Lifecycle

```
┌──────────┐     ┌──────────┐     ┌──────────────┐     ┌────────────┐
│  Create  │────►│   Join   │────►│   Meeting    │────►│ Leave/End  │
│  Host    │     │ Code/URL │     │ LiveKit SFU  │     │ Host ends  │
│  gets    │     │ ?join=   │     │ chat, polls  │     │ or user    │
│  code    │     │          │     │ reactions    │     │ leaves     │
└──────────┘     └──────────┘     └──────────────┘     └────────────┘
                       │                 │                    │
                       ▼                 │                    ▼
                 ┌──────────┐            │              ┌──────────┐
                 │ Waiting  │            │              │ Cleanup  │
                 │ Room     │            │              │ room     │
                 │ (locked) │            │              │ removed  │
                 └──────────┘            │              │ if empty │
                                         ▼              └──────────┘
                                   ┌──────────┐
                                   │ Host     │
                                   │ transfers│
                                   │ if leave │
                                   └──────────┘
```

### State Details (in `HuddleDO`)

1. **Create**: `createRoom(hostId, hostName)` → generates 6-char code, creates `Room`, initializes chat history.
2. **Join**: If locked → waiting room. Otherwise adds `User` to `participants[]`, broadcasts `participant:joined` and `room:state` (+ `chat:history`).
3. **Meeting**: WebRTC peers negotiate via LiveKit. Chat/polls/reactions flow through the DO.
4. **Leave**: `leaveRoom()` removes participant. If host leaves, first remaining becomes host. If room empties, all room data is deleted.
5. **End Meeting**: Host emits `meeting:end`. DO broadcasts `meeting:ended` to all, records history to D1, cleans up polls.

> **State persistence**: Durable Object state is stored in Cloudflare's SQLite-backed
> DO storage (`new_sqlite_classes`), so room/chat state survives request routing and
> DO migration — unlike the old in-memory Node maps.

## Shared Package Contract

`@meet-app/shared` defines the type-safe interface between worker and web.

### Types (19 interfaces/types)

| Type | Purpose |
|------|---------|
| `User` | Participant: id, name, isHost, isMuted, isVideoOff, isHandRaised, joinedAt |
| `Room` | Room state: id, code, hostId, participants, isLocked, meetingTitle, recording, waitingRoom, startedAt, createdAt |
| `CreateRoomRequest` | `{ hostName, meetingTitle? }` |
| `JoinRoomRequest` | `{ code, userName }` |
| `ChatMessage` | `{ id, senderId, senderName, text, timestamp }` |
| `ICECandidate` | `{ candidate, sdpMid, sdpMLineIndex }` |
| `SignalPayload` | `{ type, from, to, data }` — WebRTC signaling envelope |
| `RoomState` | `{ room, participants }` |
| `MeetingSettings` | `{ title, resolution, audioDevice, videoDevice, backgroundBlur, virtualBackground }` |
| `RecordingState` | `{ isRecording, startedBy, startedAt }` |
| `LayoutMode` | `"auto" \| "grid" \| "speaker" \| "sidebar"` |
| `InviteLink` | `{ code, url }` |
| `MeetingNote` | `{ id, text, timestamp, author }` |
| `ActionItem` | `{ id, text, assignee, done }` |
| `MeetingSummary` | `{ notes, actionItems, keyTopics, generatedAt }` |
| `ReactionType` | `"👍" \| "❤️" \| "😂" \| "🎉" \| "👏" \| "🤔" \| "❌" \| "✅"` |
| `Reaction` | `{ id, userId, userName, type, timestamp }` |
| `Poll` / `PollOption` | Poll with options, votes, active state |
| `CaptionSegment` | `{ id, userId, userName, text, timestamp, isFinal }` |
| `WaitingUser` | `{ socketId, name, requestedAt }` |

### Constants

| Constant | Value |
|----------|-------|
| `SOCKET_EVENTS` | 40+ event name strings (see [API.md](./API.md)) |
| `ROOM_CONFIG.MAX_PARTICIPANTS` | `10` |
| `ROOM_CONFIG.CODE_LENGTH` | `6` |
| `ROOM_CONFIG.CODE_CHARS` | `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` |
| `RESOLUTION_PRESETS` | 360p, 480p, 720p, 1080p |
| `MEDIA_CONSTRAINTS` | Default 720p30, echo cancellation, noise suppression |
| `AI_COMPANION_SYSTEM` | System prompt for AI assistant |
| `POLL_MAX_OPTIONS` | `6` |

## Dependency Graph

```
@meet-app/web ──────────┐
  (React, Vite,         │
   livekit-client,      │
   lucide-react)        │
                        ▼
              @meet-app/shared ◄──── @meet-app/worker
                                   (wrangler, @cloudflare/workers-types)
```

Both `web` and `worker` depend on `@meet-app/shared` via `"workspace:*"`.

### Key Runtime Dependencies

**Worker**: `wrangler@^3`, `@cloudflare/workers-types` (build only), `@meet-app/shared`
**Web**: `react@^19`, `react-dom@^19`, `livekit-client@^2`, `lucide-react@^0.468`

## Worker Initialization

```typescript
// apps/worker/src/index.ts — ExportedHandler
export default {
  async fetch(request, env) {
    if (path === "/health") return json({ ok: true });
    if (path === "/api/livekit/token") return json({ token, url });   // HS256 JWT
    if (path === "/auth/github/callback") return handleGithubCallback(request, env);
    if (path === "/ws") return env.HUDDLE_DO.get(idFromName("global")).fetch(request);
    return env.ASSETS.fetch(request);                                  // web build
  },
};
```

```typescript
// apps/worker/src/huddleDO.ts — DurableObject
export class HuddleDO implements DurableObject {
  async fetch(request) {
    // accept WebSocket, register socket id, route events to this.handle()
  }
  private async handle(ws, event, data, ack) {
    switch (event) {
      case "room:create": /* ... */ break;
      case "chat:message": /* store + broadcast */ break;
      // ... every SOCKET_EVENTS handler
    }
  }
}
```

`HuddleDO` is the single source of truth for all room/user/chat/poll state (in-memory
`Map`s + DO storage). It also owns the `DB` wrapper over the D1 binding for
users/sessions/history/schedule.

## Client Initialization

```typescript
// App.tsx — "home" → HomePage; "room" → RoomPage.
<SocketProvider>        // Creates WsSocket (raw WebSocket → /ws, Socket.IO-compatible)
  <RoomProvider>        // Room state, participants, messages, layout
    {view === "home"
      ? <HomePage />
      : <RoomPage />
    }
  </RoomProvider>
</SocketProvider>
```

`SocketContext` uses `WsSocket` (`src/lib/wsSocket.ts`), a minimal Socket.IO-compatible
adapter over a raw WebSocket. It exposes `on/off/once/emit(id, data, ack)/close`, `.id`,
`connect`/`disconnect` events, auto-reconnect with backoff, and re-emits
`room:create`/`room:join` on reconnect so the DO re-syncs room state + chat history.

`RoomPage` wires all 16+ components, 20+ socket event listeners, and the `useLiveKit` hook.

### Frontend source layout (refactored)

```
apps/web/src/
├─ pages/
│  ├─ HomePage.tsx        # landing/dashboard/schedule/history + join flow (~730 baris)
│  ├─ home/styles.ts      # inline-style HomePage (diekstrak — file halaman jadi ringkas)
│  ├─ RoomPage.tsx        # view meeting: orchestrates semua panel + 20 listener (~861 baris)
│  └─ room/styles.ts      # inline-style RoomPage
├─ components/            # AuthModal, PreJoinScreen, ControlBar, VideoGrid, VideoPlayer, dll.
├─ hooks/                 # useLiveKit (media + noise suppression + mediaError), usePushToTalk, useSpeakingLevel
├─ contexts/              # SocketContext, AuthContext, RoomContext
└─ lib/wsSocket.ts        # adapter WebSocket Socket.IO-compatible
```

- **AuthModal self-contained**: state form (mode/email/password/nama/error/reset-code)
  dipindah ke dalam komponen; HomePage hanya memegang `authModal: "email" | "register" |
  "forgot" | null`.
- **Media error surfaced**: `useLiveKit.mediaError` membawa pesan ramah per penyebab
  (izin ditolak, device dipakai, server media mati) → RoomPage menampilkan banner di atas
  video. Error livekit tidak lagi hanya di console.
