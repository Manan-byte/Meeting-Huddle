# Realtime Events Reference

All event names are defined in `SOCKET_EVENTS` from `@meet-app/shared`.

## Room Events

### `room:create`

| Field | Value |
|-------|-------|
| **Payload** | `{ hostName: string }` |
| **Emitted by** | Client (HomePage) |
| **Listened by** | Worker (HuddleDO) |
| **Response** | `room:created` → `Room` object; `meeting:started` → `{ startedAt }` |
| **Description** | Creates a new room. Caller becomes host. Generates a 6-character room code. |

### `room:created`

| Field | Value |
|-------|-------|
| **Payload** | `Room` |
| **Emitted by** | Worker |
| **Listened by** | Client (HomePage) |
| **Description** | Confirms room creation. Client stores room and navigates to meeting. |

### `room:join`

| Field | Value |
|-------|-------|
| **Payload** | `{ code: string, userName: string }` |
| **Emitted by** | Client (HomePage) |
| **Listened by** | Worker (HuddleDO) |
| **Response** | `room:joined` → `Room`; or `waitingRoom:status` → `{ waiting: true }` if locked; or `room:full`; or `error` |
| **Description** | Joins an existing room by code. If room is locked, user enters waiting room. Max 10 participants. |

### `room:joined`

| Field | Value |
|-------|-------|
| **Payload** | `Room` |
| **Emitted by** | Worker |
| **Listened by** | Client (HomePage, waiting room admit) |
| **Description** | Confirms successful join. Client transitions to RoomPage. |

### `room:leave`

| Field | Value |
|-------|-------|
| **Payload** | `{ code: string }` |
| **Emitted by** | Client (RoomPage handleLeave) |
| **Listened by** | Worker (HuddleDO) |
| **Response** | `participant:left` → `{ userId, participants }`; `room:state` → `RoomState` |
| **Description** | Leaves the room. If host leaves, next participant becomes host. If room empties, room is deleted. |

### `room:state`

| Field | Value |
|-------|-------|
| **Payload** | `RoomState` — `{ room: Room, participants: User[] }` |
| **Emitted by** | Worker |
| **Listened by** | Client (RoomPage) |
| **Description** | Broadcast to all participants when room state changes (join, leave, etc.). |

### `room:full`

| Field | Value |
|-------|-------|
| **Payload** | `{ message: string }` |
| **Emitted by** | Worker |
| **Listened by** | Client |
| **Description** | Room has reached max capacity (10 participants). |

### `room:locked`

| Field | Value |
|-------|-------|
| **Payload** | — |
| **Emitted by** | Worker (defined but not currently emitted) |
| **Description** | Reserved for room lock notification. Use `room:toggleLock` / `room:lockChanged` instead. |

### `room:toggleLock`

| Field | Value |
|-------|-------|
| **Payload (emit)** | `{ roomId: string }` |
| **Emitted by** | Client (RoomPage → ControlBar, host only) |
| **Listened by** | Worker (HuddleDO) |
| **Response** | `room:lockChanged` → `{ isLocked }` |
| **Description** | Host toggles whether the room is locked. While locked, new joiners go to the waiting room. |

### `room:lockChanged`

| Field | Value |
|-------|-------|
| **Payload** | `{ isLocked: boolean }` |
| **Emitted by** | Worker |
| **Listened by** | Client (RoomPage) |
| **Description** | Lock state change broadcast to all participants (host syncs `room.isLocked`). |

### `participant:joined`

| Field | Value |
|-------|-------|
| **Payload** | `{ user: User, participants: User[] }` |
| **Emitted by** | Worker |
| **Listened by** | Client (RoomPage) |
| **Description** | Broadcast when a new participant joins the room (roster update). Video/media is handled by LiveKit (SFU), not this event. |

### `participant:left`

| Field | Value |
|-------|-------|
| **Payload** | `{ userId: string, participants: User[] }` |
| **Emitted by** | Worker |
| **Listened by** | Client (RoomPage) |
| **Description** | Broadcast when a participant leaves or disconnects (roster update). LiveKit removes the media tracks. |

### `toggle:mute`

| Field | Value |
|-------|-------|
| **Payload** | `{ isMuted: boolean }` |
| **Emitted by** | Client (RoomPage) |
| **Listened by** | Client (RoomPage — updates participant state) |
| **Description** | Notifies room of mute state change. Actual audio mute is applied on the LiveKit track via `useLiveKit.setMute()`. |

### `toggle:video`

| Field | Value |
|-------|-------|
| **Payload** | `{ isVideoOff: boolean }` |
| **Emitted by** | Client (RoomPage) |
| **Listened by** | Client (RoomPage — updates participant state) |
| **Description** | Notifies room of video state change. Actual video mute is applied on the LiveKit camera track. |

## Media Token (LiveKit)

### `GET /api/livekit/token?room=&name=`

| Field | Value |
|-------|-------|
| **Returns** | `{ token: string, url: string }` (JWT scoped to the room) |
| **Emitted by** | Client (`useLiveKit`) |
| **Handled by** | Worker (`src/livekit.ts`, WebCrypto HS256) |
| **Description** | Issues a short-lived LiveKit access token (publish + subscribe). Requires `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`; returns 503 if unconfigured. Replaces the old per-peer WebRTC `signal` exchange. |

## Chat Events

### `chat:message`

| Field | Value |
|-------|-------|
| **Payload (emit)** | `{ text: string }` |
| **Payload (receive)** | `ChatMessage` — `{ id, senderId, senderName, text, timestamp }` |
| **Emitted by** | Client (RoomPage → ChatPanel) |
| **Listened by** | Worker (HuddleDO); Client (RoomPage) |
| **Description** | Sends a chat message. Worker creates `ChatMessage` with UUID, stores in history, broadcasts to room. |

### `chat:history`

| Field | Value |
|-------|-------|
| **Payload** | `ChatMessage[]` |
| **Emitted by** | Worker |
| **Listened by** | Client (RoomPage) |
| **Description** | Chat history (not currently emitted on join; messages accumulate in memory). |

## Screen Sharing Events

### `screen:started` / `screen:stopped`

| Field | Value |
|-------|-------|
| **Payload** | — |
| **Defined in** | `SOCKET_EVENTS` |
| **Description** | Reserved events for screen sharing notifications. Currently handled client-side via `RTCRtpSender.replaceTrack()`. |

## Hand Raise Events

### `hand:raise`

| Field | Value |
|-------|-------|
| **Payload (emit)** | `{ roomId: string }` |
| **Payload (receive)** | `{ userId: string, isHandRaised: boolean }` |
| **Emitted by** | Client (RoomPage) |
| **Listened by** | Worker (HuddleDO); Client (RoomPage) |
| **Description** | Toggles hand raise state. Worker broadcasts updated state to room. |

### `hand:lower`

| Field | Value |
|-------|-------|
| **Payload** | — |
| **Emitted by** | Client (RoomPage — emitted when lowering hand) |
| **Listened by** | Client (RoomPage — handled same as `hand:raise`) |
| **Description** | Synonym event for hand lower, handled identically to `hand:raise` on the client. |

## Recording Events

### `recording:toggle`

| Field | Value |
|-------|-------|
| **Payload (emit)** | `{ roomId: string }` |
| **Payload (receive)** | `RecordingState` — `{ isRecording, startedBy, startedAt }` |
| **Emitted by** | Client (RoomPage, host only) |
| **Listened by** | Worker (HuddleDO) |
| **Description** | Toggles recording state. Only host can toggle. Broadcasts state to room. |

### `recording:state`

| Field | Value |
|-------|-------|
| **Payload** | `RecordingState` |
| **Emitted by** | Worker |
| **Listened by** | Client (RoomPage) |
| **Description** | Current recording state broadcast to all participants. |

## Meeting Title Events

### `meeting:setTitle`

| Field | Value |
|-------|-------|
| **Payload (emit)** | `{ roomId: string, title: string }` |
| **Emitted by** | Client (RoomPage → MeetingTitle) |
| **Listened by** | Worker (HuddleDO) |
| **Description** | Sets meeting title. Only host can set. Broadcasts update. |

### `meeting:titleUpdated`

| Field | Value |
|-------|-------|
| **Payload** | `{ meetingTitle: string }` |
| **Emitted by** | Worker |
| **Listened by** | Client (RoomPage) |
| **Description** | Updated meeting title broadcast to all participants. |

## Layout Events

### `layout:set`

| Field | Value |
|-------|-------|
| **Payload (emit)** | `{ roomId: string, layout: string }` |
| **Emitted by** | Client (RoomPage → LayoutToggle) |
| **Listened by** | Worker (HuddleDO) |
| **Description** | Requests layout change (grid/speaker). Worker broadcasts to room. |

### `layout:changed`

| Field | Value |
|-------|-------|
| **Payload** | `{ layout: string }` |
| **Emitted by** | Worker |
| **Listened by** | Client (RoomPage) |
| **Description** | Layout change broadcast to all participants. |

## Settings Events

### `settings:update`

| Field | Value |
|-------|-------|
| **Payload (emit)** | `{ roomId: string, settings: Record<string, unknown> }` |
| **Emitted by** | Client (RoomPage → SettingsPanel) |
| **Listened by** | Worker (HuddleDO) |
| **Description** | Broadcasts settings update to room. Actual media changes happen client-side via `applySettings()`. |

### `settings:updated`

| Field | Value |
|-------|-------|
| **Payload** | `{ settings: Record<string, unknown> }` |
| **Emitted by** | Worker |
| **Listened by** | Client (RoomPage) |
| **Description** | Settings update broadcast to all participants. |

## Background Events

### `background:set`

| Field | Value |
|-------|-------|
| **Payload (emit)** | `{ roomId: string, background: string \| null }` |
| **Emitted by** | Client (RoomPage → SettingsPanel) |
| **Listened by** | Worker (HuddleDO) |
| **Description** | Sets virtual background. `null` = no background. |

### `background:updated`

| Field | Value |
|-------|-------|
| **Payload** | `{ background: string \| null }` |
| **Emitted by** | Worker |
| **Listened by** | Client (RoomPage) |
| **Description** | Background update broadcast to room. |

## Invite Events

### `invite:get`

| Field | Value |
|-------|-------|
| **Payload (emit)** | `{ roomId: string }` |
| **Emitted by** | Client (RoomPage → InviteModal) |
| **Listened by** | Worker (HuddleDO) |
| **Response** | `invite:link` → `InviteLink` |
| **Description** | Requests invite link for current room. |

### `invite:link`

| Field | Value |
|-------|-------|
| **Payload** | `{ code: string, url: string }` |
| **Emitted by** | Worker |
| **Listened by** | Client |
| **Description** | Returns room invite URL. |

## AI Companion Events

> **Note**: The AI Companion was **removed from the web UI** (v0.2). These events are
> wired **server-side only** — the server handlers exist for API compatibility, but no
> client component emits or listens to them anymore. The server generates summaries via
> keyword/word-frequency extraction (no real LLM).

### `ai:generateSummary`

| Field | Value |
|-------|-------|
| **Payload (emit)** | — |
| **Payload (receive)** | `MeetingSummary` — `{ notes, actionItems, keyTopics, generatedAt }` |
| **Emitted by** | Worker only (previously Client AICompanion) |
| **Listened by** | Worker (HuddleDO) |
| **Description** | Generates meeting summary from chat history. Worker does word-frequency analysis and action item extraction. |

### `ai:summaryReady`

| Field | Value |
|-------|-------|
| **Payload** | `MeetingSummary` |
| **Emitted by** | Worker |
| **Listened by** | Client (unused — no UI listener) |
| **Description** | Generated summary delivered to requesting client. |

### `ai:addNote`

| Field | Value |
|-------|-------|
| **Payload (emit)** | `{ text: string }` |
| **Payload (receive)** | `MeetingNote` — `{ id, text, timestamp, author }` |
| **Emitted by** | Worker only (previously Client AICompanion) |
| **Listened by** | Worker (HuddleDO) |
| **Description** | Adds a meeting note. Broadcast to room. |

### `ai:noteAdded`

| Field | Value |
|-------|-------|
| **Payload** | `MeetingNote` |
| **Emitted by** | Worker |
| **Listened by** | Client (unused — no UI listener) |
| **Description** | New note broadcast to all participants. |

### `ai:actionItem`

| Field | Value |
|-------|-------|
| **Payload (emit)** | `{ text: string, assignee: string \| null }` |
| **Payload (receive)** | `ActionItem` — `{ id, text, assignee, done }` |
| **Emitted by** | Worker only (previously Client AICompanion) |
| **Listened by** | Worker (HuddleDO) |
| **Description** | Adds an action item. Broadcast to room. |

### `ai:actionItemUpdated`

| Field | Value |
|-------|-------|
| **Payload** | `ActionItem` |
| **Emitted by** | Worker |
| **Listened by** | Client (unused — no UI listener) |
| **Description** | New action item broadcast to all participants. |

## Reaction Events

### `reaction:send`

| Field | Value |
|-------|-------|
| **Payload (emit)** | `{ type: string }` — one of the `ReactionType` values |
| **Payload (receive)** | `Reaction` — `{ id, userId, userName, type, timestamp }` |
| **Emitted by** | Client (RoomPage → ReactionBar) |
| **Listened by** | Worker (HuddleDO) |
| **Description** | Sends an emoji reaction. Worker creates `Reaction` and broadcasts. |

### `reaction:broadcast`

| Field | Value |
|-------|-------|
| **Payload** | `Reaction` |
| **Emitted by** | Worker |
| **Listened by** | Client (RoomPage) |
| **Description** | Reaction broadcast to all participants for floating animation display. |

## Poll Events

### `poll:create`

| Field | Value |
|-------|-------|
| **Payload (emit)** | `{ question: string, options: string[] }` |
| **Emitted by** | Client (PollModal) |
| **Listened by** | Worker (HuddleDO) |
| **Response** | `poll:update` → `Poll` |
| **Description** | Creates a new poll. Max 6 options (`POLL_MAX_OPTIONS`). |

### `poll:update`

| Field | Value |
|-------|-------|
| **Payload** | `Poll` |
| **Emitted by** | Worker |
| **Listened by** | Client (PollModal) |
| **Description** | Active poll broadcast to room. |

### `poll:vote`

| Field | Value |
|-------|-------|
| **Payload (emit)** | `{ pollId: string, optionId: string }` |
| **Emitted by** | Client (PollModal) |
| **Listened by** | Worker (HuddleDO) |
| **Response** | `poll:result` → `Poll` |
| **Description** | Casts a vote. Removes previous vote from other options (one vote per user per poll). |

### `poll:close`

| Field | Value |
|-------|-------|
| **Payload (emit)** | `{ pollId: string }` |
| **Emitted by** | Client (PollModal, poll creator only) |
| **Listened by** | Worker (HuddleDO) |
| **Response** | `poll:result` → `Poll` |
| **Description** | Closes poll. Only the poll creator can close. |

### `poll:result`

| Field | Value |
|-------|-------|
| **Payload** | `Poll` (with `isActive: false` when closed) |
| **Emitted by** | Worker |
| **Listened by** | Client (PollModal) |
| **Description** | Updated poll with votes or closed state. |

## Live Caption Events

### `caption:segment`

| Field | Value |
|-------|-------|
| **Payload (emit)** | `{ text: string, isFinal: boolean }` |
| **Payload (receive)** | `CaptionSegment` — `{ id, userId, userName, text, timestamp, isFinal }` |
| **Emitted by** | Client (LiveCaptions via Web Speech API) |
| **Listened by** | Worker (HuddleDO); Client (RoomPage) |
| **Description** | Speech-to-text segment. Non-final segments are echoed only to sender. Final segments are broadcast to room. |

### `caption:toggle`

| Field | Value |
|-------|-------|
| **Payload** | — |
| **Emitted by** | Client (LiveCaptions) |
| **Listened by** | Worker (HuddleDO) |
| **Response** | `captions:enabled` → `{ enabled: true }` |
| **Description** | Enables live captions for the room. |

### `captions:enabled`

| Field | Value |
|-------|-------|
| **Payload** | `{ enabled: boolean }` |
| **Emitted by** | Worker |
| **Listened by** | Client (RoomPage) |
| **Description** | Notifies room that captions are enabled. |

## Waiting Room Events

### `waitingRoom:join`

| Field | Value |
|-------|-------|
| **Payload** | — |
| **Defined in** | `SOCKET_EVENTS` |
| **Description** | Reserved event name. Actual waiting room join is handled via `room:join` when room is locked. |

### `waitingRoom:status`

| Field | Value |
|-------|-------|
| **Payload** | `{ waiting: boolean }` |
| **Emitted by** | Worker |
| **Listened by** | Client (RoomPage) |
| **Description** | Tells the joining client they are in the waiting room. Client shows waiting screen. |

### `waitingRoom:update`

| Field | Value |
|-------|-------|
| **Payload** | `WaitingUser[]` — `{ socketId, name, requestedAt }[]` |
| **Emitted by** | Worker |
| **Listened by** | Client (RoomPage → WaitingRoom) |
| **Description** | Updated waiting room list for host (full `WaitingUser` objects, not raw socket IDs). |

### `waitingRoom:admit`

| Field | Value |
|-------|-------|
| **Payload (emit)** | `{ socketId: string }` |
| **Emitted by** | Client (RoomPage → WaitingRoom, host only) |
| **Listened by** | Worker (HuddleDO) |
| **Response** | `room:joined` → `Room` (to admitted user); `participant:joined` + `room:state` (to room) |
| **Description** | Host admits a user from waiting room. User becomes a full participant. |

### `waitingRoom:reject`

| Field | Value |
|-------|-------|
| **Payload (emit)** | `{ socketId: string }` |
| **Emitted by** | Client (RoomPage → WaitingRoom, host only) |
| **Listened by** | Worker (HuddleDO) |
| **Response** | Error message to rejected user; `waitingRoom:update` to room |
| **Description** | Host rejects a user from waiting room. |

## End Meeting Events

### `meeting:end`

| Field | Value |
|-------|-------|
| **Payload** | — |
| **Emitted by** | Client (RoomPage, host only) |
| **Listened by** | Worker (HuddleDO) |
| **Response** | `meeting:ended` → `{ roomId, code }` to all participants |
| **Description** | Host ends meeting for all participants. Cleans up polls. |

### `meeting:ended`

| Field | Value |
|-------|-------|
| **Payload** | `{ roomId: string, code: string }` |
| **Emitted by** | Worker |
| **Listened by** | Client (RoomPage) |
| **Description** | Meeting ended notification. Client shows "Meeting Has Ended" screen. |

### `meeting:started`

| Field | Value |
|-------|-------|
| **Payload** | `{ startedAt: number }` |
| **Emitted by** | Worker (on room create) |
| **Listened by** | Client (RoomPage → MeetingTimer) |
| **Description** | Meeting start timestamp for timer display. |

## Error Events

### `error`

| Field | Value |
|-------|-------|
| **Payload** | `{ message: string }` |
| **Emitted by** | Worker |
| **Listened by** | Client |
| **Description** | Generic error response. Used for permission violations, not found, rejected, etc. |

## Event Summary Table

| Category | Events | Count |
|----------|--------|-------|
| Room | create, created, join, joined, leave, state, full, locked, toggleLock, lockChanged, participant joined/left, toggle mute/video | 14 |
| WebRTC | signal | 1 |
| Chat | message, history | 2 |
| Screen | started, stopped | 2 |
| Hand Raise | raise, lower | 2 |
| Recording | toggle, state | 2 |
| Meeting Title | setTitle, titleUpdated | 2 |
| Layout | set, changed | 2 |
| Settings | update, updated | 2 |
| Background | set, updated | 2 |
| Invite | get, link | 2 |
| AI Companion | generateSummary, summaryReady, addNote, noteAdded, actionItem, actionItemUpdated | 6 |
| Reactions | send, broadcast | 2 |
| Polls | create, vote, close, update, result | 5 |
| Captions | segment, toggle, enabled | 3 |
| Waiting Room | join, status, update, admit, reject | 5 |
| End Meeting | end, ended, started | 3 |
| Error | error | 1 |
| **Total** | | **~46** |
