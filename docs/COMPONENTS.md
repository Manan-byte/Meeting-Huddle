# Components

## Component Tree

```
<App>
  └─ <SocketProvider>                      // WebSocket (Worker /ws)
       └─ <RoomProvider>                    // Room state management
            │
            ├── <HomePage>                  // SaaS dashboard
            │     ├── Start-a-meeting card (create/join)
            │     ├── Upcoming card (schedule)
            │     └── Recent card (history)
            │
            └── <RoomPage>                  // Main meeting view
                  │
                  ├── Header
                  │     ├── <MeetingTitle>           // Editable title (host only)
                  │     ├── <RecordingIndicator>     // Red REC dot
                  │     ├── <MeetingTimer>           // Elapsed time
                  │     ├── Room code display
                  │     └── Participant count
                  │
                  ├── Content Area
                  │     ├── <VideoGrid>              // Grid/speaker layout switcher
                  │     │     ├── <VideoPlayer>      // Local video tile
                  │     │     └── <VideoPlayer>      // Remote video tiles (N)
                  │     │           └── <SpeakerView>    // Speaker layout mode
                  │     │                 └── <VideoPlayer> (main + thumbnails)
                  │     │
                  │     ├── <ReactionOverlay>        // Floating emoji animations
                  │     ├── <LiveCaptions>           // Web Speech API captions
                  │     ├── <WaitingRoom>            // Host admit/reject panel
                  │     └── <ReactionBar>            // Emoji reaction buttons
                  │
                  ├── Sidebar (right, mutually exclusive)
                  │     ├── <ParticipantList>        // Participant roster
                  │     └── <ChatPanel>              // Chat messages
                  │
                  ├── <ControlBar>                   // Bottom toolbar
                  │     ├── Mic toggle / hold-to-talk (PTT)
                  │     ├── Camera toggle
                  │     ├── Screen share toggle
                  │     ├── Push-to-talk toggle
                  │     ├── Chat toggle
                  │     ├── Participants toggle
                  │     ├── Settings toggle
                  │     ├── Hand raise toggle
                  │     ├── Invite toggle
                  │     ├── Record button (start/pause/resume)
                  │     ├── Layout toggle
                  │     ├── Lock toggle (host only)
                  │     └── More (⋯) menu → Reactions, Polls, Push-to-talk key, Stop & Download Recording
                  │
                  ├── Modals
                  │     ├── <SettingsPanel>          // Resolution/device/background
                  │     ├── <InviteModal>            // Copy invite link
                  │     └── <PollModal>              // Create/vote/view polls
                  │
                  └── End Meeting button (host only)
```

## Context Providers

### `SocketProvider` (`contexts/SocketContext.tsx`)

```typescript
interface SocketContextValue {
  socket: Socket | null;      // WebSocket adapter (WsSocket) instance
  isConnected: boolean;       // Connection status
}
```

- Creates `socket.io-client` connection on mount using WebSocket with polling fallback.
- Auto-connects to same origin (/ws on the Worker; Vite proxies to wrangler dev in local dev).
- Cleans up socket on unmount.
- Exported hook: `useSocket()`.

### `RoomProvider` (`contexts/RoomContext.tsx`)

```typescript
interface RoomContextValue {
  room: Room | null;
  currentUser: User | null;
  participants: User[];
  messages: ChatMessage[];
  layout: LayoutMode;                    // "grid" | "speaker"
  recording: RecordingState | null;
  meetingStartedAt: number;
  setRoom: (room: Room | null) => void;
  setCurrentUser: (user: User | null) => void;
  setParticipants: Dispatch<SetStateAction<User[]>>;
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  updateParticipant: (userId: string, updates: Partial<User>) => void;
  setLayout: Dispatch<SetStateAction<LayoutMode>>;
  setRecording: Dispatch<SetStateAction<RecordingState | null>>;
  setMeetingStartedAt: Dispatch<SetStateAction<number>>;
}
```

- Central state for all room-related data.
- `addMessage()` appends to messages array.
- `updateParticipant()` updates a specific participant and syncs `currentUser` if the update targets the local user.
- Exported hook: `useRoom()`.

## Component Details

### `HomePage` (`pages/HomePage.tsx`)

Modern light SaaS **dashboard**. Top nav (brand + Dashboard / Schedule / History(admin) + Sign in / account) and a main content area:
- **Dashboard view**: hero (tagline + name input + "New meeting" + join-with-code), feature strip, and — admin-only — a **Recent meetings** table
- **Schedule view**: requires sign-in; schedule a meeting (title + custom **calendar** date picker + **time-slot grid** + optional guest emails). On schedule, the user's own mail client opens via `mailto:` to invite guests (any email provider, no server config). Plus an **Upcoming meetings** table showing invited emails as chips
- **History view**: admin-only full meeting records

Hosts both create (CREATE_ROOM) and join (JOIN_ROOM) flows and pre-fills the join code from `?join=CODE`.

| Prop | Type |
|------|------|
| `onJoinRoom` | `() => void` |

**State**: `userName`, `joinCode`, `isCreating`, `error`, `visible` (animation), `previewing` (`"create" | "join" | null`)

**Behavior**:
- "Create meeting" → opens the **PreJoinScreen** (`previewing = "create"`). After the user checks their camera and clicks "Join now", `confirmCreate()` emits `CREATE_ROOM`, listens for `ROOM_CREATED`, sets `room`/`currentUser`/`participants`, calls `onJoinRoom()` → navigates to RoomPage.
- "Join" → opens the **PreJoinScreen** (`previewing = "join"`). After preview, `confirmJoin()` emits `JOIN_ROOM` with `code` + `userName`, listens for `ROOM_JOINED`, sets context, calls `onJoinRoom()` → navigates to RoomPage.
- **Pre-join preview**: both flows show a Google Meet-style lobby (camera preview, device selectors, mic/video toggles, "Join now"/Cancel) before actually entering the room.
- **Invite link prefills code**: On mount, reads `?join=CODE` URL param and sets `joinCode` state. The join code input is shown pre-filled so the user only needs to enter their name and click Join.
- **Disabled button state**: All create/join buttons use `disabled` prop + CSS `.hp-btn:disabled` (opacity 0.5, `cursor: not-allowed`).

### `PreJoinScreen` (`components/PreJoinScreen.tsx`)
| Prop | Type |
|------|------|
| `userName` | `string` |
| `title` | `string` — meeting title (create) or code (join) |
| `isCreating` | `boolean` |
| `onJoin` | `() => void` — proceeds to emit CREATE/JOIN and enter the room |
| `onCancel` | `() => void` |

**Behavior**: Google Meet-style lobby. Acquires camera+mic via `getUserMedia` and shows a live preview. Enumerates devices and renders pill-shaped mic/camera selectors. Toggle buttons mute mic / disable camera. On "Join now" stops the preview stream (RoomPage re-acquires via `useLiveKit`) and calls `onJoin`. Shows initials fallback + error message when no camera is available.

### `SchedulePicker` (`components/SchedulePicker.tsx`)

Two controlled components used by the HomePage **Schedule** view to replace the native date/time inputs:

| Component | Props | Emits |
|-----------|-------|-------|
| `CalendarPicker` | `value: string` (`YYYY-MM-DD` or `""`), `onChange(date: string)` | Selected date as `YYYY-MM-DD` |
| `TimePicker` | `value: string` (`HH:MM`), `onChange(time: string)` | Selected time as `HH:MM` |

Also exports **`buildInviteMailto(invitees, meeting, clientUrl)`** → a `mailto:` compose URL (recipients + subject + body including room code and join link). Used by HomePage after scheduling to open the user's own mail client for the invite.

**`CalendarPicker` behavior**: Monthly calendar with `‹`/`›` month navigation (cannot go before the current month), weekday header (Su–Sa), past dates disabled, today outlined with an accent ring, and the selected day filled with the accent color. Day equality is compared on local dates (no UTC off-by-one).

**`TimePicker` behavior**: Digital clock-style selector with three columns — **Hour** (1–12), **Minute** (5-min steps 00–55), and **Period** (AM/PM). The selected option in each column is filled with the accent color. Emits 24-hour `HH:MM`.

**Contract note**: both emit the same string formats the Worker's `dash:schedule` handler expects (`date: "YYYY-MM-DD"`, `time: "HH:MM"`), so the socket contract is unchanged.

### `RoomPage` (`pages/RoomPage.tsx`)
| Prop | Type |
|------|------|
| `onLeaveRoom` | `() => void` |

**State** (local): `showChat`, `showParticipants`, `showSettings`, `showInvite`, `showReactions`, `showPolls`, `isCaptionEnabled`, `recentReactions`, `captionSegments`, `waitingUsers`, `isMeetingEnded`, `isInWaitingRoom`, `isPushToTalk`, `pushToTalkHotkey`

**Socket listeners**: `ROOM_STATE`, `PARTICIPANT_JOINED`, `PARTICIPANT_LEFT`, `TOGGLE_MUTE`, `TOGGLE_VIDEO`, `CHAT_MESSAGE`, `CHAT_HISTORY`, `HAND_RAISE`, `HAND_LOWER`, `RECORDING_STATE`, `MEETING_TITLE_UPDATED`, `LAYOUT_CHANGED`, `REACTION_BROADCAST`, `CAPTION_SEGMENT`, `CAPTIONS_ENABLED`, `WAITING_ROOM_UPDATE`, `WAITING_ROOM_STATUS`, `LOCK_CHANGED`, `MEETING_ENDED`, `MEETING_STARTED`

**Key handlers**:
- `handleToggleMute/Video` — toggles local track + emits + updates participant
- `handleSendMessage` — emits `CHAT_MESSAGE`
- `handleToggleHandRaise` — emits `HAND_RAISE` or `HAND_LOWER`
- `handleToggleRecord` — emits `TOGGLE_RECORDING` (host only)
- `handleToggleLayout` — emits `SET_LAYOUT`
- `handleRenameTitle` — emits `SET_MEETING_TITLE`
- `handleApplySettings` — calls `applySettings()` + emits `UPDATE_SETTINGS`
- `handleReact` — emits `SEND_REACTION`
- `handlePushToTalkMute` — applies a PTT mute change locally + emits `TOGGLE_MUTE`
- `handleEndMeeting` — emits `END_MEETING` (host only)
- `handleAdmitUser/RejectUser` — emits `ADMIT_USER`/`REJECT_USER`

**Special screens**:
- `isMeetingEnded` → "Meeting Has Ended" screen
- `isInWaitingRoom` → "Waiting Room" screen

### `VideoGrid` (`components/VideoGrid.tsx`)
| `localStream` | `MediaStream \| null` |
| `screenStream` | `MediaStream \| null` |
| `remoteStreams` | `Map<string, MediaStream>` |
| `participants` | `User[]` |
| `currentUser` | `User \| null` |
| `layout` | `LayoutMode` |
**Behavior**: Renders video tiles per the selected layout: `grid`/`auto` (responsive CSS Grid, 1/2/3 columns by participant count), `speaker` (spotlight — delegates to `SpeakerView`), `sidebar` (main speaker fills the area + a 180px side rail of remaining tiles). When alone (1 participant), the grid is capped at `max-width: 660px` and centered. The local tile renders `screenStream` when screen sharing, otherwise `localStream`.

### `VideoPlayer` (`components/VideoPlayer.tsx`)

| Prop | Type |
|------|------|
| `stream` | `MediaStream \| null` |
| `name` | `string` |
| `isMuted` | `boolean` |
| `isVideoOff` | `boolean` |
| `isLocal` | `boolean?` |
| `isHandRaised` | `boolean?` |
| `backgroundBlur` | `boolean?` |
| `virtualBackground` | `string \| null?` |

**Behavior**: Attaches `MediaStream` to `<video>` element via ref. Shows initials avatar when video is off. Displays hand raise badge, name overlay, "You" badge for local. **Background effects** (no ML segmentation): `backgroundBlur` applies a CSS blur to the video; `virtualBackground` (color/image) renders as a semi-transparent overlay above a dimmed video so the selection is clearly visible.

### `SpeakerView` (`components/SpeakerView.tsx`)

| Prop | Type |
|------|------|
| `localStream` | `MediaStream \| null` |
| `remoteStreams` | `Map<string, MediaStream>` |
| `participants` | `User[]` |
| `currentUser` | `User \| null` |

**Behavior**: Shows most recent remote participant as main speaker (or local if alone). Other participants shown as 200px-wide thumbnails in a vertical sidebar.

### `ControlBar` (`components/ControlBar.tsx`)

| Prop | Type |
|------|------|
| `isMuted` | `boolean` |
| `isVideoOff` | `boolean` |
| `isScreenSharing` | `boolean` |
| `showChat` / `showParticipants` / `showReactions` / `showPolls` | `boolean` |
| `isHandRaised` / `isRecording` / `isHost` / `isLocked` | `boolean` |
| `layout` | `LayoutMode` |
| `onToggle*` + `onStopRecord` | callbacks |
| `onLeave` | `() => void` |
| `unreadChat` | `number` — unread chat count shown as a red pill badge on the Chat button |
| `isPushToTalk` | `boolean` — whether push-to-talk mode is active |
| `onTogglePushToTalk` | `() => void` |
| `onPushToTalkStart` / `onPushToTalkStop` | `() => void` — hold-to-talk mic button (mouse hold) |
| `pushToTalkHotkey` | `string` — configured hotkey (raw key value, `" "` for Space) |
| `onPushToTalkHotkeyChange` | `(key: string) => void` — from the More-menu key picker |

**Behavior**: Bottom toolbar with core buttons (mic, camera, share, hand, record, layout, lock-host-only, chat, participants, invite, settings) grouped into a pill container, plus a **More (⋯) dropdown** holding Reactions, Polls, a **Push-to-talk key** picker, and (while recording) **Stop & Download Recording**. Active panels highlighted. Host-only: record, locked toggle, end meeting. The Chat button shows a red count badge when `unreadChat > 0`.

**Push-to-talk**: When `isPushToTalk` is true, the mic button becomes a **hold-to-talk** control (pointer down = `onPushToTalkStart`, up/leave/cancel = `onPushToTalkStop`) and a separate **Push-to-talk toggle** button (Radio icon) sits next to screen share. The More menu exposes a hotkey picker — click the field, then press the desired key.

### `ChatPanel` (`components/ChatPanel.tsx`)

| Prop | Type |
|------|------|
| `messages` | `ChatMessage[]` |
| `onSend` | `(text: string) => void` |
| `currentUserId` | `string \| null` — for styling own messages |

**Behavior**: Scrollable message list with auto-scroll, rendered in the **right sidebar** (shared with the participant list). Own messages align right in an accent bubble; others align left with a sender-avatar initials chip. Input with Enter key support; displays sender name, timestamp (HH:MM), and message text.

### `ParticipantList` (`components/ParticipantList.tsx`)

| Prop | Type |
|------|------|
| `participants` | `User[]` |
| `currentUser` | `User \| null` |

**Behavior**: List with avatar initials, "You" badge, "Host" badge, mute/video indicators.

### `ReactionBar` (`components/ReactionBar.tsx`)

| Prop | Type |
|------|------|
| `onReact` | `(type: ReactionType) => void` |
| `recentReactions` | `Reaction[]` |

**Behavior**: 8 emoji buttons (👍 ❤️ 😂 🎉 👏 🤔 ❌ ✅). Click emits `SEND_REACTION`.

### `ReactionOverlay` (`components/ReactionOverlay.tsx`)

| Prop | Type |
|------|------|
| `reactions` | `Reaction[]` |

**Behavior**: Creates floating emoji at random horizontal position (10-90%). Auto-removes after 2 seconds with CSS animation.

### `PollModal` (`components/PollModal.tsx`)

| Prop | Type |
|------|------|
| `isOpen` | `boolean` |
| `onClose` | `() => void` |
| `socket` | `Socket \| null` |

**State**: `question`, `options` (min 2, max 6), `activePoll`, `pollResult`

**Behavior**: Create view → poll form. Active poll → vote view with progress bars. Closed poll → result view. Listens for `POLL_UPDATE` and `POLL_RESULT`.
### `LiveCaptions` (`components/LiveCaptions.tsx`)

| Prop | Type |
|------|------|
| `isEnabled` | `boolean` |
| `socket` | `Socket \| null` |
| `segments` | `CaptionSegment[]` |
| `onSegment` | `(segment: CaptionSegment) => void` |
| `userName` | `string` |
| `userId` | `string` |

**Behavior**: Uses `webkitSpeechRecognition` / `SpeechRecognition` API. Sends interim + final segments via `CAPTION_SEGMENT`. Shows last 10 segments. Emits `CAPTION_TOGGLE` to enable for room.

**Type declarations**: The Web Speech API types are not in TypeScript's DOM lib. The component declares them locally using a `SpeechRecognitionConstructor` type alias (`new () => SpeechRecognition`) and a `declare global` block for `Window.SpeechRecognition`/`Window.webkitSpeechRecognition`. This avoids TS2693 ("'SpeechRecognition' only refers to a type") by providing a value-level constructor type rather than using `typeof` on an interface.

### `WaitingRoom` (`components/WaitingRoom.tsx`)

| Prop | Type |
|------|------|
| `waitingUsers` | `WaitingUser[]` |
| `onAdmit` | `(socketId: string) => void` |
| `onReject` | `(socketId: string) => void` |

**Behavior**: Shows list of waiting users with Admit/Reject buttons. Only rendered for host when waiting users exist.

### `MeetingTimer` (`components/MeetingTimer.tsx`)

| Prop | Type |
|------|------|
| `startedAt` | `number` |

**Behavior**: Updates every second. Formats as `MM:SS` or `HH:MM:SS` for long meetings.

### `MeetingTitle` (`components/MeetingTitle.tsx`)

| Prop | Type |
|------|------|
| `title` | `string` |
| `isHost` | `boolean` |
| `onRename` | `(title: string) => void` |

**Behavior**: Host can click to edit inline (Enter to commit, Escape to cancel, blur to commit). Non-host sees plain text. Max 80 characters.

### `RecordingIndicator` (`components/RecordingIndicator.tsx`)

| Prop | Type |
|------|------|
| `isRecording` | `boolean` |

**Behavior**: Shows pulsing red dot + "REC" text when recording. Hidden when not recording.

### `SettingsPanel` (`components/SettingsPanel.tsx`)

| Prop | Type |
|------|------|
| `onClose` | `() => void` |
| `onApplySettings` | `(settings: MeetingSettings) => void` |
| `currentSettings` | `MeetingSettings` |

**Behavior**: Clean, no-scroll modal. **Video** section: resolution dropdown (360p/480p/720p/1080p) + camera/mic device selectors (from `navigator.mediaDevices.enumerateDevices()`). **Background** section: a single row of swatches — None / Blur / color (Green, Blue, Red, Purple) / Upload image. Selecting Blur sets `backgroundBlur=true`; a color or image sets `virtualBackground`; None clears both. Footer has Cancel + Apply. Apply re-acquires media and replaces tracks.

### `InviteModal` (`components/InviteModal.tsx`)

| Prop | Type |
|------|------|
| `roomCode` | `string` |
| `onClose` | `() => void` |

**Behavior**: Shows invite URL (`origin/?join=CODE`) and room code. Copy to clipboard button.

### `HandRaiseButton` (`components/HandRaiseButton.tsx`)

| Prop | Type |
|------|------|
| `isHandRaised` | `boolean` |
| `onToggle` | `() => void` |

**Behavior**: Toggles between yellow (raised) and default (lowered) background. Lucide `Hand` icon.

### `ViewSettingsModal` (`components/ViewSettingsModal.tsx`)

| Prop | Type |
|------|------|
| `layout` | `LayoutMode` |
| `onApply` | `(layout: LayoutMode) => void` |
| `onClose` | `() => void` |

**Behavior**: Google Meet-style "Adjust view" picker. Four layout options (Auto / Tiled / Spotlight / Sidebar) as radio-style cards with icons. Includes a tile-size slider (disabled when the selected layout doesn't support resize) and a "Hide tiles without video" toggle (local preference). `onApply` emits `SET_LAYOUT` and updates context.

### `LayoutToggle` (`components/LayoutToggle.tsx`)

| Prop | Type |
|------|------|
| `layout` | `LayoutMode` |
| `onChange` | `(layout: LayoutMode) => void` |

**Behavior**: Toggles between grid/speaker layout. Shows `LayoutGrid` or `LayoutPanelTop` icon. (Not currently used standalone — the Adjust view modal replaces it in the ControlBar layout button.)

## Hooks

### `useLiveKit` (`hooks/useLiveKit.ts`)

```typescript
function useLiveKit({ roomName, identity }: UseLiveKitOptions): {
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  toggleMute: () => void;
  setMute: (muted: boolean) => void;
  toggleVideo: (off: boolean) => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  isScreenSharing: boolean;
  settings: unknown;
  applySettings: (s: unknown) => Promise<void>;
}
```

**Responsibilities** (SFU video engine — replaced `useWebRTC`):
- Requests a short-lived token from `GET /api/livekit/token`, connects to the LiveKit room.
- Publishes local camera + mic (and screen share) via `livekit-client`.
- Surfaces remote tracks as `MediaStream`s in `remoteStreams` so `VideoGrid`/`VideoPlayer` keep working unchanged.
- `toggleMute`/`setMute` → `LocalAudioTrack.mute()/unmute()`; `toggleVideo` → camera track mute; `toggleScreenShare` → `getDisplayMedia` + publish a screen-share track.
- Cleans up (stop tracks + disconnect) on unmount.

### `useSpeakingLevel` (`hooks/useSpeakingLevel.ts`)

Detects audio activity in a `MediaStream` via the Web Audio API; drives the speaking ring.

### `usePushToTalk` (`hooks/usePushToTalk.ts`)

```typescript
function usePushToTalk({ enabled, hotkey, setMute, onMuteChange }: UsePushToTalkOptions): {
  startTalking: () => void;
  stopTalking: () => void;
}
```

**Purpose**: Discord-style hold-to-talk. When `enabled`, the mic stays muted and only unmutes while the hotkey is held (keyboard) or while `startTalking` is in effect (hold-to-talk button / mouse). `stopTalking` mutes again.

**Responsibilities / safety**:
- **Keyboard**: `keydown`/`keyup` on `window` for the configured `hotkey`. `e.preventDefault()` on the hotkey press so Space doesn't scroll/click focused buttons.
- **Editable-target guard**: hotkey ignored while typing in an `input`/`textarea`/`select`/`contenteditable`.
- **Auto-repeat ignored**: `e.repeat` presses are skipped — holding a key talks once, never toggling.
- **Window blur / unmount / mode-change reset**: forces the mic back to a muted baseline so nobody is left broadcasting accidentally.
- **Mode transitions**: entering PTT mutes; leaving it restores an unmuted baseline.

**Constants**: `DEFAULT_PTT_KEY = " "` (Space). Helper `formatHotkey(key)` maps a raw key to a display label (`" "` → `"Space"`, single chars uppercased).

## State Management Flow

```
WebSocket Events ──► RoomPage ──► RoomContext ──► Components
                          │
                          ├──► Local useState (UI state)
                          │
                          └──► useLiveKit (media state)
                                    │
                                    ├── localStream ──► VideoGrid
                                    ├── remoteStreams ──► VideoGrid
                                    └── settings ──► SettingsPanel
```

**Data flow pattern**: Socket events update RoomContext state. Components read from context. User actions emit Socket events. LiveKit media state lives in `useLiveKit` (separate from RoomContext).

### Sidebar Exclusivity

Chat and Participants panels are mutually exclusive — toggling one closes the other:

```typescript
onToggleChat={() => { setShowChat(v => !v); setShowParticipants(false); setShowAI(false); }}
onToggleParticipants={() => { setShowParticipants(v => !v); setShowChat(false); setShowAI(false); }}
onToggleAI={() => { setShowAI(v => !v); setShowChat(false); setShowParticipants(false); }}
```

Reactions and Polls are overlay/modal and don't affect sidebar state.
