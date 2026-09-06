# Huddle — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MONOREPO (pnpm + Turborepo)                │
│                                                                     │
│  ┌──────────────────┐  ┌────────────────────┐  ┌────────────────┐  │
│  │  packages/shared  │  │   apps/server      │  │   apps/web     │  │
│  │                   │  │                    │  │                │  │
│  │  TypeScript types │  │  Express + Socket  │  │  React + Vite  │  │
│  │  Constants        │  │  .IO signaling     │  │  LiveKit SFU   │  │
│  │  Shared contracts │  │  Room management   │  │  UI components │  │
│  └──────────────────┘  └────────────────────┘  └────────────────┘  │
│         ▲                        ▲                     ▲            │
│         │                        │                     │            │
│         └────── workspace:* ─────┴─────────────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
```

## Monorepo Structure

The project uses **pnpm workspaces** with **Turborepo** for orchestration:

- **`packages/shared/`** (`@meet-app/shared`) — Pure TypeScript types and constants shared between server and web. No runtime dependencies; built via `tsc`.
- **`apps/server/`** (`@meet-app/server`) — Node.js signaling server. Express HTTP + Socket.IO WebSocket. Manages rooms, relay signals, broadcasts events. Uses in-memory storage (no database).
- **`apps/web/`** (`@meet-app/web`) — React 19 SPA. Vite dev server, WebRTC peer connections, Socket.IO client. 18 components, 2 contexts, 1 hook.

### Turborepo Task Graph

```
build  ← depends on ^build (shared builds first)
dev    ← no cache, persistent
test   ← depends on build
lint   ← standalone
typecheck ← depends on ^build
```

## Data Flow

### Signaling Path (Socket.IO)

```
Client A                   Server                     Client B
   │                         │                          │
   │── CREATE_ROOM ──────────►                          │
   │◄── ROOM_CREATED ────────│                          │
   │                         │                          │
   │                         │◄── JOIN_ROOM ────────────│
   │                         │── ROOM_JOINED ──────────►│
   │                         │── PARTICIPANT_JOINED ───►│
   │                         │── ROOM_STATE ──────────►│ (all)
   │                         │                          │
   │◄── SIGNAL (offer) ──────│◄── SIGNAL (offer) ───────│
   │── SIGNAL (answer) ──────│── SIGNAL (answer) ──────►│
   │◄── SIGNAL (ICE) ────────│◄── SIGNAL (ICE) ────────│
   │                         │                          │
   │════════════════════════════════════════════════════│
   │              WebRTC P2P Media Stream               │
   │════════════════════════════════════════════════════│
```

### Chat & Feature Path

```
Client A                         Server                    All Clients
   │                               │                          │
   │── CHAT_MESSAGE {text} ───────►│                          │
   │                               │── CHAT_MESSAGE (full) ──►│
   │                               │                          │
   │── SEND_REACTION {type} ──────►│                          │
   │                               │── REACTION_BROADCAST ───►│
   │                               │                          │
   │── CREATE_POLL {question,opts}►│                          │
   │                               │── POLL_UPDATE ──────────►│
   │                               │                          │
   │── CAPTION_SEGMENT {text} ────►│                          │
   │                               │── CAPTION_SEGMENT ──────►│ (final only)
```

**Chat notification** (client-side): When a `CHAT_MESSAGE` arrives and the recipient's chat panel is closed, `RoomPage` (a) increments `unreadChat` → red pill badge on the Chat button in `ControlBar`, and (b) shows a floating toast (sender + preview) that auto-dismisses after 4s. Both clear when the panel is opened.

## Media Flow (LiveKit SFU)

The video engine is **LiveKit**, a Selective Forwarding Unit (SFU), which replaced the
old P2P WebRTC mesh. Each participant publishes their local track **once** to the LiveKit
server; the server forwards media **selectively** to the others in the room. This scales
to dozens of participants per meeting and millions of users across distributed servers.

```
Client A (joiner)                 LiveKit SFU                    Client B
      │                                │                              │
      │  1. GET /api/livekit/token     │                              │
      │      (server issues JWT)       │                              │
      │───────────────────────────────►│                              │
      │  2. Room.connect(url, token)   │                              │
      │───────────────────────────────►│                              │
      │  3. publish camera + mic       │                              │
      │────────────── audio+video ────►│                              │
      │                                │  4. forward (selective)     │
      │                                │─────────────────────────────►│
      │  5. subscribe to remote tracks │◄────────────────────────────│
      │◄────────── forwarded ──────────│                              │
      │                                │                              │
      │══════ Media flows via SFU ═════║══════ (not peer-to-peer) ═══│
```

**Token endpoint**: `GET /api/livekit/token?room=&name=` (server, `handlers/liveKit.ts`)
issues a short-lived JWT (`livekit-server-sdk`) scoped to a room with publish/subscribe.
The API secret stays server-side — never sent to the client.

**Client hook**: `useLiveKit` (`hooks/useLiveKit.ts`) connects to the room, publishes
local camera+mic (and screen share), and surfaces remote tracks as `MediaStream`s so
`VideoGrid`/`VideoPlayer`/`SpeakerView` keep working unchanged.

**Mute / push-to-talk**: mic mute calls `LocalAudioTrack.mute()/unmute()` on the LiveKit
track (the SFU stops forwarding when muted). Push-to-talk uses the deterministic
`setMute(muted)` from `useLiveKit` (distinct from `toggleMute`). The `usePushToTalk` hook
owns the hold-state: while its hotkey is held it unmutes, and on release / window blur /
unmount it re-mutes — so a user can never be left broadcasting accidentally.

**Screen share**: `toggleScreenShare()` captures via `getDisplayMedia`, publishes a
screen-share LocalVideoTrack, and surfaces it as `screenStream` for the local preview.

## Room Lifecycle

```
┌──────────┐     ┌──────────┐     ┌──────────────┐     ┌────────────┐
│  Create  │────►│   Join   │────►│   Meeting    │────►│ Leave/End  │
│          │     │          │     │              │     │            │
│ Host gets│     │ Code or  │     │ LiveKit SFU  │     │ Host ends  │
│ room code│     │ URL with │     │ chat, polls  │     │ or user    │
│          │     │ ?join=   │     │ reactions    │     │ leaves     │
└──────────┘     └──────────┘     └──────────────┘     └────────────┘
                       │                 │                    │
                       ▼                 │                    ▼
                 ┌──────────┐            │              ┌──────────┐
                 │ Waiting  │            │              │ Cleanup  │
                 │ Room     │            │              │ room     │
                 │ (locked) │            │              │ removed  │
                 └──────────┘            │              │ if empty │
                                         │              └──────────┘
                                         ▼
                                   ┌──────────┐
                                   │ Host     │
                                   │ transfers│
                                   │ if leave │
                                   └──────────┘
```

### State Details

1. **Create**: `RoomManager.createRoom(hostId, hostName)` → generates 6-char code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, creates `Room` object, initializes empty chat history.
2. **Join**: If room is locked → `addToWaitingRoom()`. Otherwise `joinRoom()` adds `User` to `participants[]`, broadcasts `PARTICIPANT_JOINED` and `ROOM_STATE`.
3. **Meeting**: WebRTC peers negotiate. Chat messages broadcast via `CHAT_MESSAGE`. All feature events flow through Socket.IO.
4. **Leave**: `leaveRoom()` removes participant. If host leaves, first remaining participant becomes host. If room empties, all data is deleted.
5. **End Meeting**: Host emits `END_MEETING`. Server broadcasts `MEETING_ENDED` to all participants and cleans up polls.

## Shared Package Contract

`@meet-app/shared` defines the type-safe interface between server and web:

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
| `LayoutMode` | `"auto" \| "grid" \| "speaker" \| "sidebar"` (Adjust view) |
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
| `ROOM_CONFIG.CODE_CHARS` | `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no ambiguous chars) |
| `RESOLUTION_PRESETS` | 360p, 480p, 720p, 1080p with width/height/frameRate |
| `MEDIA_CONSTRAINTS` | Default: 720p30, echo cancellation, noise suppression |
| `AI_COMPANION_SYSTEM` | System prompt for AI assistant behavior |
| `POLL_MAX_OPTIONS` | `6` |

## Dependency Graph

```
@meet-app/web ──────────┐
  (React, Vite,         │
   socket.io-client,    │
   lucide-react)        │
                        ▼
              @meet-app/shared ◄──── @meet-app/server
                                   (Express, Socket.IO,
                                    uuid, dotenv, cors,
                                    tsx dev runner)
```

Both `web` and `server` depend on `@meet-app/shared` via `"workspace:*"`. The shared package is built first (Turborepo `^build` dependency).

### Key Runtime Dependencies

**Server**: `socket.io@^4`, `express@^4`, `cors@^2.8`, `uuid@^11`, `dotenv@^16`
**Web**: `react@^19`, `react-dom@^19`, `socket.io-client@^4`, `lucide-react@^0.468`
**Dev**: `turbo@^2.4`, `typescript@^5.7`, `vitest@^3`, `vite@^6` (web), `tsx@^4` (server)

## Server Initialization

```typescript
// apps/server/src/index.ts
const io = new Server(httpServer, { cors: { origin: CORS_ORIGIN } });
const roomManager = new RoomManager();

setupRoomHandlers(io, roomManager);        // Room CRUD + disconnect
setupSignalingHandler(io, roomManager);     // WebRTC signal relay
setupChatHandler(io, roomManager);          // Chat messages
setupFeatureHandlers(io, roomManager);      // Hand raise, layout, settings, background, invite
setupMeetingHandlers(io, roomManager);      // Reactions, polls, captions, waiting room, AI, end meeting
```

All handlers share the same `io` and `roomManager` instances. Each `io.on("connection")` registers event listeners per socket. The `RoomManager` is the single source of truth for all room/user state (in-memory `Map`s).

## Client Initialization

```typescript
// App.tsx — view state drives which page renders.
// "home" → HomePage (create/join); "room" → RoomPage (the meeting).
// Invite links (?join=CODE) open HomePage with the code pre-filled;
// the user enters their name and clicks Join — no forced room view.
<SocketProvider>        // Creates Socket.IO connection
  <RoomProvider>        // Room state, participants, messages, layout
    {view === "home"
      ? <HomePage />    // Create/join meeting (prefills code from ?join=CODE)
      : <RoomPage />    // Main meeting view
    }
  </RoomProvider>
</SocketProvider>
```

`RoomPage` wires all 16+ components, 20+ socket event listeners, and the `useLiveKit` hook. The hook manages the LiveKit SFU room connection, publishes local camera/mic, and surfaces remote tracks as `MediaStream`s. Push-to-talk is orchestrated by the `usePushToTalk` hook in `RoomPage`, which drives `useLiveKit.setMute()` and broadcasts the mute state over the existing `TOGGLE_MUTE` event.
