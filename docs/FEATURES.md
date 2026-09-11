# Features

## Feature Matrix

| # | Feature | Priority | Complexity | Components | Socket Events | Shared Types |
|---|---------|----------|------------|------------|---------------|--------------|
| 1 | Video/Audio Calls | P0 | High | VideoGrid, VideoPlayer, useLiveKit | (LiveKit SFU) | — |
| 2 | Room Management | P0 | Medium | HomePage, RoomPage | CREATE_ROOM, JOIN_ROOM, LEAVE_ROOM, ROOM_CREATED, ROOM_JOINED, ROOM_STATE | Room, User, RoomState |
| 3 | Chat | P0 | Low | ChatPanel | CHAT_MESSAGE | ChatMessage |
| 4 | Screen Sharing | P0 | Medium | ControlBar, useLiveKit | (LiveKit screen track) | — |
| 5 | Mute/Unmute | P0 | Low | ControlBar, VideoPlayer | TOGGLE_MUTE | User |
| 6 | Camera On/Off | P0 | Low | ControlBar, VideoPlayer | TOGGLE_VIDEO | User |
| 7 | Waiting Room | P1 | Medium | WaitingRoom | JOIN_WAITING_ROOM, ADMIT_USER, REJECT_USER, WAITING_ROOM_UPDATE/STATUS | WaitingUser |
| 8 | Recording Indicator | P1 | Low | RecordingIndicator | TOGGLE_RECORDING, RECORDING_STATE | RecordingState |
| 9 | Meeting Title | P1 | Low | MeetingTitle | SET_MEETING_TITLE, MEETING_TITLE_UPDATED | — |
| 10 | Participant List | P1 | Low | ParticipantList | PARTICIPANT_JOINED/LEFT | User |
| 11 | Hand Raise | P1 | Low | HandRaiseButton, VideoPlayer | HAND_RAISE, HAND_LOWER | User |
| 12 | Layout Toggle | P1 | Low | LayoutToggle, VideoGrid, SpeakerView | SET_LAYOUT, LAYOUT_CHANGED | LayoutMode |
| 13 | Invite Link | P1 | Low | InviteModal | GET_INVITE_LINK, INVITE_LINK | InviteLink |
| 14 | Meeting Timer | P1 | Low | MeetingTimer | MEETING_STARTED | — |
| 15 | Reactions | P2 | Low | ReactionBar, ReactionOverlay | SEND_REACTION, REACTION_BROADCAST | Reaction, ReactionType |
| 16 | Polls | P2 | Medium | PollModal | CREATE_POLL, VOTE_POLL, CLOSE_POLL, POLL_UPDATE, POLL_RESULT | Poll, PollOption |
| 17 | Live Captions | P2 | Medium | LiveCaptions | CAPTION_SEGMENT, CAPTION_TOGGLE, CAPTIONS_ENABLED | CaptionSegment |
| 18 | AI Companion | P2 | Medium | AICompanion | AI_GENERATE_SUMMARY, AI_SUMMARY_READY, AI_ADD_NOTE, AI_NOTE_ADDED, AI_ACTION_ITEM, AI_ACTION_ITEM_UPDATED | MeetingNote, ActionItem, MeetingSummary |
| 19 | Virtual Background | P2 | Medium | SettingsPanel, VideoPlayer | SET_BACKGROUND, BACKGROUND_UPDATED | MeetingSettings |
| 20 | Settings Panel | P2 | Medium | SettingsPanel | UPDATE_SETTINGS, SETTINGS_UPDATED | MeetingSettings |
| 21 | End Meeting | P1 | Low | RoomPage | END_MEETING, MEETING_ENDED | — |
| 22 | Light SaaS Theme | P1 | Low | index.css | — | — |
| 23 | Responsive Video Grid | P1 | Low | VideoGrid | — | — |
| 24 | Disconnect Handling | P0 | Low | HuddleDO (worker) | (disconnect) | — |
| 25 | Push-to-Talk | P2 | Medium | ControlBar, usePushToTalk, useLiveKit | TOGGLE_MUTE | User |

---

## Feature Details

### 1. Video/Audio Calls (P0)

**What it does**: Real-time audio/video via **LiveKit** (an SFU), replacing the old P2P WebRTC mesh — scales to many participants per room.

**Components**:
- `useLiveKit` — connects to the LiveKit room, publishes local camera/mic, surfaces remote tracks
- `VideoGrid` — responsive CSS grid layout (1/2/3 columns based on participant count)
- `VideoPlayer` — attaches `MediaStream` to `<video>` element, shows initials fallback

**Socket/API Events**: `GET /api/livekit/token` (server issues a room JWT); no per-peer signaling

**Shared Types**: `User`

**Implementation**:
- Server issues a short-lived LiveKit token (`livekit-server-sdk`); client connects via `livekit-client`.
- Local camera + mic are published once to the SFU; remote tracks arrive as `MediaStream`s.
- Cleanup stops local tracks and disconnects on unmount.

---

### 2. Room Management (P0)

**What it does**: Create, join, and leave meeting rooms with 6-character codes.

**Components**:
- `HomePage` — create/join forms
- `RoomPage` — main meeting view

**Socket Events**:
- `CREATE_ROOM` → `ROOM_CREATED` + `MEETING_STARTED`
- `JOIN_ROOM` → `ROOM_JOINED` + `PARTICIPANT_JOINED` + `ROOM_STATE` (or `WAITING_ROOM_STATUS` if locked)
- `LEAVE_ROOM` → `PARTICIPANT_LEFT` + `ROOM_STATE`
- `disconnect` → `PARTICIPANT_LEFT`

**Shared Types**: `Room`, `User`, `RoomState`, `CreateRoomRequest`, `JoinRoomRequest`

**Implementation**:
- 6-char codes from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no ambiguous characters)
- Max 10 participants (`ROOM_CONFIG.MAX_PARTICIPANTS`)
- Host transfer on host leave (first remaining participant)
- Room deleted when last participant leaves
- All state in-memory (server-side `Map`s)
- **Invite link flow**: `GET_INVITE_LINK` → server returns `{ origin }/?join=CODE`. Opening that URL lands on `HomePage` with the join code **pre-filled** (read from `?join=CODE` on mount). The visitor enters their name and clicks Join. There is no forced navigation straight to the room — joining only happens through the explicit Join action, so the invite link always works for a fresh visitor.

---

### 3. Chat (P0)

**What it does**: In-meeting text chat with message history.

**Components**:
- `ChatPanel` — message list + input

**Socket Events**: `CHAT_MESSAGE` (emit text, receive full `ChatMessage`)

**Shared Types**: `ChatMessage`

**Implementation**:
- Messages stored server-side in `chatHistory` Map per room
- Each message gets UUID, sender info, timestamp
- Auto-scroll to bottom on new message
- Enter key to send
- Panel renders in the **right sidebar** of the room; own messages align right with accent bubble, others align left with sender avatar initials

---

### 4. Screen Sharing (P0)

**What it does**: Share screen with other participants via a LiveKit screen-share track.

**Components**:
- `ControlBar` — screen share toggle button
- `useLiveKit` — `toggleScreenShare()` function

**Implementation**:
- Calls `navigator.mediaDevices.getDisplayMedia()`
- Publishes a `ScreenShare` track to the LiveKit room (SFU forwards it to others)
- Auto-stops when user clicks the browser's "Stop sharing" button (`onended` callback)
- Unpublishes + stops the track on toggle off

---

### 5-6. Mute/Unmute & Camera On/Off (P0)

**What it does**: Toggle local audio/video tracks and broadcast state.

**Components**:
- `ControlBar` — toggle buttons
- `VideoPlayer` — displays mute/video-off indicators
- `ParticipantList` — shows indicators per participant

**Socket Events**: `TOGGLE_MUTE`, `TOGGLE_VIDEO`

**Implementation**:
- Mute: calls `LocalAudioTrack.mute()/unmute()` on the LiveKit track (SFU stops forwarding)
- Camera off: mutes the LiveKit camera track (video stops; hardware may stay warm — LiveKit handles this)
- Emits state to server, which broadcasts to room
- Updates participant state in `RoomContext`

---

### 5b. Push-to-Talk (P2)

**What it does**: Discord-style hold-to-talk. When enabled, the mic stays muted and only unmutes while a hotkey (default **Space**) is held down, or while the hold-to-talk mic button is held (mouse/pointer). Releasing mutes again.

**Components**:
- `ControlBar` — PTT toggle button (Radio icon) + hold-to-talk mic button + hotkey picker in the More menu
- `usePushToTalk` — new hook: keyboard/mouse hold state, hotkey handling, safety resets
- `useLiveKit` — `setMute(muted)` (deterministic mute, distinct from `toggleMute`)

**Socket Events**: `TOGGLE_MUTE` (reused — PTT sets mute state and broadcasts it)

**Behavior / safety**:
- **Editable-target guard**: the hotkey is ignored while typing in an input/textarea/select/contenteditable, so Space doesn't fight chat entry.
- **Auto-repeat ignored**: holding a key talks once (no toggle loop).
- **Window blur / unmount / mode-change reset**: the mic is forced back to a safe baseline so nobody is left broadcasting accidentally. Entering PTT mutes; leaving it restores an unmuted baseline.
- **Hotkey configurable**: pick a new key in the ControlBar More menu (persisted in `localStorage`).

**Persistence**: chosen hotkey saved as `huddle_ptt_key` in `localStorage`.

---

### 7. Waiting Room (P1)

**What it does**: When room is locked, new joiners enter a waiting room until the host admits or rejects them.

**Components**:
- `WaitingRoom` — host panel with Admit/Reject buttons (only visible when users are waiting)
- `RoomPage` — shows "Waiting Room" screen to waiting users

**Socket Events**:
- `JOIN_WAITING_ROOM` (conceptual; actual join uses `JOIN_ROOM` when locked)
- `WAITING_ROOM_STATUS` → tells joiner they're in waiting room
- `WAITING_ROOM_UPDATE` → updates host's waiting list
- `ADMIT_USER` → host admits user
- `REJECT_USER` → host rejects user

**Shared Types**: `WaitingUser`

**Implementation**:
- Server stores waiting users by socket ID + name
- On admit: user added to `participants[]`, `ROOM_JOINED` sent to admitted user
- On reject: error message sent to rejected user
- Only host can admit/reject

---

### 8. Recording Indicator (P1)

**What it does**: Visual indicator that recording is active.

**Components**:
- `RecordingIndicator` — pulsing red dot + "REC" text
- `ControlBar` — record toggle (host only)

**Socket Events**: `TOGGLE_RECORDING`, `RECORDING_STATE`

**Shared Types**: `RecordingState`

**Implementation**:
- Only host can start/pause/resume/stop recording
- Client-side `MediaRecorder` on the local stream (camera or screen share + mic) captures WebM
- **Stop** (via the More menu → "Stop & Download Recording") assembles chunks into a WebM Blob and triggers a browser download (`Huddle-<timestamp>.webm`)
- Server toggles `room.recording` state and broadcasts `RECORDING_STATE` to all participants for the indicator

---

### 9. Meeting Title (P1)

**What it does**: Editable meeting name, visible to all participants.

**Components**:
- `MeetingTitle` — inline editable text (host only)

**Socket Events**: `SET_MEETING_TITLE`, `MEETING_TITLE_UPDATED`

**Implementation**:
- Host clicks to edit, Enter/blur to commit, Escape to cancel
- Max 80 characters
- Non-host sees plain text

---

### 10. Participant List (P1)

**What it does**: Shows all participants with status indicators.

**Components**:
- `ParticipantList` — scrollable list

**Implementation**:
- Shows avatar initials, "You" badge, "Host" badge
- Mute/video indicators per participant
- Updates on `PARTICIPANT_JOINED`/`PARTICIPANT_LEFT`/`ROOM_STATE`

---

### 11. Hand Raise (P1)

**What it does**: Visual hand raise indicator.

**Components**:
- `HandRaiseButton` — toggle button (yellow when raised)
- `VideoPlayer` — shows hand badge on video tile

**Socket Events**: `HAND_RAISE`, `HAND_LOWER`

**Implementation**:
- Toggle `isHandRaised` on `User` object
- Server broadcasts to room
- Yellow badge appears on video tile

---

### 12. Layout Toggle (P1)

**What it does**: Switch between grid and speaker view.

**Components**:
- `LayoutToggle` — toggle button with icon
- `VideoGrid` — switches rendering mode
- `SpeakerView` — speaker-focused layout with thumbnails

**Socket Events**: `SET_LAYOUT`, `LAYOUT_CHANGED`

**Shared Types**: `LayoutMode`

**Implementation**:
- Grid: CSS Grid with adaptive columns (1/2/3 based on count)
- Speaker: Main speaker (most recent remote, or local) + 200px sidebar thumbnails
- Layout change broadcast to all participants

---

### 13. Invite Link (P1)

**What it does**: Generate and copy a shareable invite link.

**Components**:
- `InviteModal` — shows URL + copy button

**Socket Events**: `GET_INVITE_LINK`, `INVITE_LINK`

**Shared Types**: `InviteLink`

**Implementation**:
- URL format: `{origin}/?join={roomCode}`
- Copy to clipboard via `navigator.clipboard.writeText()`
- Also displays raw room code

---

### 14. Meeting Timer (P1)

**What it does**: Elapsed time display.

**Components**:
- `MeetingTimer` — updates every second

**Socket Events**: `MEETING_STARTED` (provides `startedAt` timestamp)

**Implementation**:
- `setInterval` every 1 second
- Formats as `MM:SS` or `HH:MM:SS`

---

### 15. Reactions (P2)

**What it does**: Send emoji reactions that float up on screen.

**Components**:
- `ReactionBar` — 8 emoji buttons
- `ReactionOverlay` — floating emoji animations

**Socket Events**: `SEND_REACTION`, `REACTION_BROADCAST`

**Shared Types**: `ReactionType`, `Reaction`

**Supported reactions**: 👍 ❤️ 😂 🎉 👏 🤔 ❌ ✅

**Implementation**:
- Random horizontal position (10-90%)
- Auto-remove after 2 seconds
- CSS animation for floating effect

---

### 16. Polls (P2)

**What it does**: Create, vote on, and view polls during meetings.

**Components**:
- `PollModal` — create/vote/result views

**Socket Events**: `CREATE_POLL`, `VOTE_POLL`, `CLOSE_POLL`, `POLL_UPDATE`, `POLL_RESULT`

**Shared Types**: `Poll`, `PollOption`

**Implementation**:
- 2-6 options per poll (`POLL_MAX_OPTIONS`)
- One vote per user per poll (switching removes previous vote)
- Only poll creator can close
- Progress bars show vote distribution
- Server stores polls in `roomPolls` Map per room

---

### 17. Live Captions (P2)

**What it does**: Real-time speech-to-text captions using Web Speech API.

**Components**:
- `LiveCaptions` — recognition + display

**Socket Events**: `CAPTION_SEGMENT`, `CAPTION_TOGGLE`, `CAPTIONS_ENABLED`

**Shared Types**: `CaptionSegment`

**Implementation**:
- Uses `webkitSpeechRecognition` / `SpeechRecognition` API
- Non-final (interim) segments echoed only to sender
- Final segments broadcast to room
- Shows last 10 segments
- Browser support: Chrome/Edge primarily

---

### 18. AI Companion (P2) — REMOVED from UI

**Status**: The AI Companion panel has been **removed from the web UI** (no `AICompanion` component, no AI button in the control bar, no AI sidebar/state/listeners in `RoomPage`). The server-side AI handlers and shared types remain for API compatibility but are no longer surfaced in the client.

**Socket Events** (server only): `AI_GENERATE_SUMMARY`, `AI_SUMMARY_READY`, `AI_ADD_NOTE`, `AI_NOTE_ADDED`, `AI_ACTION_ITEM`, `AI_ACTION_ITEM_UPDATED`

**Shared Types**: `MeetingNote`, `ActionItem`, `MeetingSummary`

**Previous implementation (server-side, retained)**:
- Server does word-frequency analysis + action item extraction from chat history. No real LLM integration.

---

### 19. Virtual Background (P2)

**What it does**: Apply background blur or solid color background.

**Components**:
- `SettingsPanel` — blur toggle + color picker
- `VideoPlayer` — applies CSS `background-blur` or color

**Socket Events**: `SET_BACKGROUND`, `BACKGROUND_UPDATED`

**Implementation**:
- Background blur: CSS `blur(8px)` filter on the video element
- Virtual background: solid color / uploaded image rendered as a **semi-transparent overlay above a dimmed video** (video `opacity` reduced so the background shows through clearly). No ML-based person segmentation — this is a tint/overlay effect, not a true behind-the-person cutout.
- Settings: Background section with a single row of swatches — None / Blur / color (Green, Blue, Red, Purple) / Upload image. Blur sets `backgroundBlur=true`; a color/image sets `virtualBackground`; None clears both.

---

### 20. Settings Panel (P2)

**What it does**: Configure resolution, devices, and background.

**Components**:
- `SettingsPanel` — modal with dropdowns and toggles

**Socket Events**: `UPDATE_SETTINGS`, `SETTINGS_UPDATED`

**Shared Types**: `MeetingSettings`

**Resolution presets**:
| Preset | Resolution | Frame Rate |
|--------|-----------|------------|
| 360p | 640×360 | 24 fps |
| 480p | 854×480 | 24 fps |
| 720p | 1280×720 | 30 fps |
| 1080p | 1920×1080 | 30 fps |

**Implementation**:
- Device enumeration via `navigator.mediaDevices.enumerateDevices()`
- Apply re-acquires media with new constraints
- Replaces tracks on all `RTCPeerConnection`s

---

### 21. End Meeting (P1)

**What it does**: Host can end the meeting for all participants.

**Components**:
- `RoomPage` — "End Meeting" button (host only)
- "Meeting Has Ended" screen

**Socket Events**: `END_MEETING`, `MEETING_ENDED`

**Implementation**:
- Only host can end
- Broadcasts `MEETING_ENDED` to all participants
- Cleans up server-side polls
- Client shows ended screen with "Return to Lobby" button

---

### 22. Light SaaS Theme (P1)

**What it does**: Consistent light (white) SaaS UI across the application.

**Implementation**:
- CSS custom properties in `index.css`
- All components use inline styles referencing CSS variables
- Color palette: white/light backgrounds (`#f8fafc` base), dark slate text, lime accent
- HomePage is a dashboard with a light sidebar; the room view and video tiles also use the light theme (video tiles themselves stay dark for contrast)

---

### 23. Responsive Video Grid (P1)

**What it does**: Automatically adapts grid columns based on participant count.

**Implementation**:
- 1 participant: 1 column
- 2-4 participants: 2 columns
- 5+ participants: 3 columns
- CSS Grid with `gap: 8px`

---

### 24. Disconnect Handling (P0)

**What it does**: Clean up when a participant loses connection.

**Implementation**:
- Server `disconnect` event in `roomHandlers.ts`
- Calls `leaveRoom()` to remove from participants
- Broadcasts `PARTICIPANT_LEFT` to remaining participants
- Client `onconnectionstatechange` in `useWebRTC` cleans up peer connection and removes remote stream

---

## Feature Categories

### Core (P0) — 6 features
Video/Audio, Room Management, Chat, Screen Sharing, Mute/Video, Disconnect Handling

### Standard (P1) — 10 features
Waiting Room, Recording Indicator, Meeting Title, Participant List, Hand Raise, Layout Toggle, Invite Link, Meeting Timer, End Meeting, Light SaaS Theme, Responsive Grid

### Enhanced (P2) — 4 features
Reactions, Polls, Live Captions, AI Companion, Virtual Background, Settings Panel
---

## Changelog — Recent Fixes & Improvements

### Virtual background fix + landing footer revamp + adaptive audio
- **Virtual background tidak lagi menutupi wajah**: `VideoPlayer` mengoper `style` (width/height 100%) ke `SegmentedVideo` sehingga menimpa inset video — latar malah tertutup penuh oleh video (tampak tidak berfungsi). Kini `SegmentedVideo` memakai layout-nya sendiri: latar (blur/color/image) tampil sebagai frame utuh di belakang, video jernih full-opacity di tengah — wajah selalu terlihat.
  - Catatan: tanpa model ML (tetap zero-dependency), background ditampilkan sebagai **frame** di sekeliling video, bukan pengganti latar penuh ala Google.
- **Footer landing page dirombak**: tema adaptif (bukan hitam keras), padding lebih besar, brand 26px dengan mark gradient + glow, judul kolom aksen, link 14px hover aksen, chip glass, bottom bar dengan separator aksen.
- **Adaptive audio kini berfungsi**: toggle di Settings → Audio menambahkan echo cancellation + auto gain ke track mic (re-acquire via `applyAdaptiveAudio`, skip on mount).

### Room UI overhaul — Google Meet-style
- **ControlBar** ditulis ulang mengikuti layout Meet: mic · kamera + chevron tab (→ Settings Video) · layar · reaksi · captions · angkat tangan · `⋮` More options (menu tunggal) · end call. Rail vertikal kanan: **Chat** (badge unread) + **People**. Semua chrome gelap permanen (independen dari tema).
- **Menu ⋯**: blok recording (host: start/pause/stop; non-host: "Recording unavailable"), Adjust view, Full screen (activeElement fullscreen), Picture-in-picture (kamera lokal), Backgrounds and effects, Report a problem, Report abuse, Troubleshooting & help, Settings; plus invite/polls/theme dan (host) lock room + Mute all.
- **Voice menu mic dihapus** — seluruh kontrol audio (Studio sound = noise suppression, push-to-talk + hotkey, mute) dan "Mute all" pindah ke **Settings → Audio** dan menu ⋯; file `VoiceMenu.tsx` dihapus.
- **Settings jadi dialog 5 tab** (putih, sidebar kiri): Audio (device mic/speaker + Test beep via `setSinkId`, studio sound, push-to-talk, adaptive audio, volume) · Video (kamera, send/receive resolution, backgrounds & effects + upload) · General (diagnostic info, auto-PiP, desktop notifications — request permission + notifikasi chat masuk, leave empty calls — prompt keluar setelah 2 menit sendirian, only contacts) · Captions (bahasa meeting = bahasa recognizer, No/Live/Translated, font size & font diterapkan ke overlay) · Reactions (show from others, animation, sound — chime WebAudio, accessibility). Semua instant-apply; pref persist di `localStorage` (`huddle_meet_prefs`).
- **People panel** ala Meet: ringkasan "N joined" + thumbnail avatar, search, "IN THE MEETING" → Contributors (collapsible), avatar berwarna, "(You)", badge "Meeting host", tombol mute per baris (host) + menu `⋮` per-user (self: mic/kamera; host: mute), Mute all.
- **Chat panel** gelap: judul + X, input pill "Send a message" dengan tombol kirim di dalam.
- **LiveCaptions**: bahasa recognition bisa diatur + font size/family dari Settings → Captions.
- Test `ControlBar.test.tsx` ditulis ulang mengikuti desain baru (24 test).

### Voice menu terpadu (noise suppression + push-to-talk + mute) — Discord-style
- **Satu menu Voice**: klik chevron di samping tombol mic membuka popover dengan 3 section:
  **Microphone** (Mute microphone, Noise suppression + hint RNNoise), **Push to talk**
  (enable + capture hotkey "Hold key"), **Moderation** (Mute all participants, host only).
- **Bar lebih bersih**: tombol standalone push-to-talk & noise suppression dihapus dari
  control bar — semua kontrol audio kini satu tempat (komponen baru `VoiceMenu.tsx`).
- **Hotkey capture**: klik "Hold key" → tekan tombol apa pun → tersimpan (Escape untuk
  batal); dipakai `usePushToTalk` untuk hold-to-talk.
- **Terverifikasi**: 4 test baru (buka menu, toggle PTT, toggle noise, Mute all host) —
  total 50 test lulus.

### Host moderation: mute per-user & mute all (Discord-style)
- **Mute per-peserta**: di panel **Participants**, host melihat ikon mic di tiap baris peserta
  non-host (muncul saat hover) → klik mematikan mikrofon peserta itu dari jarak jauh.
- **Mute all**: tombol **"Mute all"** di header panel Participants (host only) mematikan
  mikrofon semua peserta sekaligus (kecuali host sendiri) — seperti Discord mute room.
- **Event baru** (`shared/constants.ts`): `host:mute-user`, `host:unmute-user`,
  `host:mute-all` (client→server), `force:mute`, `force:unmute` (server→client).
- **Server** (`huddleDO.ts`): verifikasi sender adalah host; set `isMuted` target;
  broadcast `toggle:mute` ke semua + kirim `force:mute`/`force:unmute` ke socket target
  agar **track mikrofon lokal** benar-benar dibisukan (bukan sekadar badge).
- **Client** (`RoomPage`, `ParticipantList`): listener `force:mute`/`force:unmute` memanggil
  `setMute` (LiveKit) + sinkron state; UI moderasi hanya tampil untuk host.
- **Terverifikasi E2E**: host mute Budi → mic Budi bisu (tombol "Unmute"); host "Mute all"
  → Budi & Citra keduanya bisu.

### Refactor arsitektur + cleanup UI + feedback error media
- **File raksasa dipecah**: `HomePage.tsx` (1865 → ~730 baris) & `RoomPage.tsx` (1064 →
  861 baris) dengan mengekstrak seluruh inline-style ke `src/pages/home/styles.ts` dan
  `src/pages/room/styles.ts` — struktur jauh lebih mudah dibaca.
- **`AuthModal` komponen mandiri**: modal sign-in/register/forgot dipindah keluar dari
  HomePage ke `src/components/AuthModal.tsx` dengan state form internal
  (mode/email/password/name/error/reset-code) — HomePage cukup memanggil
  `<AuthModal initialMode onClose showToast/>`.
- **Mock video illustration dihapus** dari hero landing (tile palsu Alice/Bob/Carol +
  "REC 00:24") — statis dan menyesatkan seperti meeting sungguhan. Hero kini
  single-column yang bersih & terpusat.
- **Feedback error media (bug video)**: saat kamera/mikrofon gagal (izin ditolak, device
  dipakai, server media mati), `useLiveKit` mengekspos `mediaError` dengan pesan ramah
  per penyebab (`NotAllowedError`, `NotFoundError`, `NotReadableError`, token/network) —
  RoomPage menampilkan banner merah di atas video. Sebelumnya error hanya di console,
  user tidak tahu kenapa videonya tidak muncul.

### Anti-noise (noise suppression) + join UX: nama wajib & error jelas
- **Anti-noise toggle di ControlBar** (ikon gelombang, grup media): sekali klik mengaktifkan
  **browser-native noise suppression + echo cancellation + auto gain control** pada mikrofon
  (constraints `noiseSuppression/echoCancellation/autoGainControl: true` via
  `createLocalAudioTrack`). Chrome/Edge memakai engine **RNNoise** — noise latar (AC, keyboard,
  gonggongan) dibuang sebelum dikirim ke peserta lain. Zero dependency, tanpa server-side DSP.
- **Implementasi**: `useLiveKit` menambah state `noiseSuppression` + `toggleNoiseSuppression()`
  (re-acquire mic via `swapMic(deviceId, noiseOn)`); `ControlBar` menambah tombol
  `isNoiseSuppression`/`onToggleNoiseSuppression` dengan title state (on/off). Toggle off
  mengembalikan mic polos (default browser).
- **Join wajib nama**: tombol "New meeting" / "Join" kini **selalu aktif** — klik saat nama
  kosong menampilkan pesan jelas: "Please enter your name first to start/join a meeting (No
  account needed.)". Pengguna akun yang belum mengisi nama juga mendapat pesan yang sama
  (nama akun terisi otomatis bila sudah login).
- **Error join disurface**: listener `"error"` di `confirmCreate`/`confirmJoin` — "Room not
  found" kini tampil ramah: "Meeting not found — it may have ended. Ask the host for a new
  code, or start your own meeting. (No account needed.)" (sebelumnya event error server
  diabaikan → join tampak "macet" tanpa pesan).

### Auth disederhanakan: email/password saja (hapus OAuth) + lupa-password
- **Hapus "Sign in with Google" & "Sign in with GitHub"** dari modal — login kini
  email/password saja. Tidak perlu sinkron callback URL di Google/GitHub console
  (menghilangkan error `redirect_uri_mismatch`).
- **Modal langsung form login** (email + password), dengan link "Forgot password?"
  dan "New to Huddle? Sign up with email".
- **Fitur lupa-password**: `auth:forgot` (keluarkan reset code 6 karakter, valid 30
  menit, simpan di D1) + `auth:reset` (verifikasi code → ubah password). Karena free
  tier tanpa SMTP, code ditampilkan di layar.
- **Backend**: hapus `githubOAuth.ts` + `googleOAuth.ts` + route `/auth/*/callback`;
  hapus secret OAuth (`GITHUB_*`, `GOOGLE_*`) dari Worker; hapus kolom/find-method
  OAuth di `database.ts`.
- **Diverifikasi E2E**: register → forgot → reset → password lama ditolak → password
  baru diterima.

### Cloudflare Workers rewrite — always-on, no server, no PC
- **Backend pindah ke Cloudflare Workers + Durable Objects**: server Node (Express +
  Socket.IO) diganti full-stack Cloudflare. Realtime, auth, dashboard, LiveKit token,
  dan static frontend semuanya di-edge — **selalu-on, gratis, tanpa VPS/PC menyala**.
- **New `apps/worker`**: satu Worker (`src/index.ts`) + satu Durable Object `HuddleDO`
  (`src/huddleDO.ts`) yang memiliki semua state rooms/chat/polls/auth/dashboard via
  WebSocket native. `apps/server` (Node lama) dihapus.
- **WebSocket protocol**: JSON `{ e, d, ack }` — ack untuk auth/dashboard, broadcast
  untuk room events. Frontend pakai `WsSocket` adapter (`src/lib/wsSocket.ts`) yang
  API-kompatibel socket.io, jadi komponen tak diubah.
- **LiveKit token**: HS256 JWT via WebCrypto (`src/livekit.ts`, bukan `livekit-server-sdk`).
- **Auth**: PBKDF2 (WebCrypto, 100k iter) menggantikan scrypt Node; sessions di D1 binding.
- **D1**: `Database.ts`/`D1Client.ts` (HTTP API) diganti `DB` wrapper atas D1 binding native.
- **Deploy**: `wrangler deploy` → `https://huddle.abdmanan513.workers.dev`; frontend di-upload
  sebagai static assets.
- **Terverifikasi end-to-end**: `/health`, LiveKit JWT, WebSocket create→join→chat broadcast,
  auth register/login/me, dashboard schedule — semua persist ke D1.

### Cloudflare D1 migration — db.json → serverless SQLite
- **Persistence moved from a JSON file to Cloudflare D1** (serverless SQLite) over its HTTP API. Tables (users, sessions, meeting_history, scheduled_meetings) are created automatically on first use.
- **New `D1Client`** (`services/D1Client.ts`): wraps the Cloudflare D1 query endpoint with an injectable `fetch` (testable), reading `CF_ACCOUNT_ID` / `D1_DATABASE_ID` / `CF_API_TOKEN` from env.
- **`Database` rewritten to async D1-backed** CRUD; all callers (`authHandler`, `dashboardHandler`, `githubOAuth`, `meetingHandlers`) now `await` the DB methods.
- **Env**: `.env.example` + `DEPLOYMENT.md` document the Cloudflare D1 credentials.
- **Tests**: 7 new D1 tests (client query/auth-header/error/not-configured; Database user/session/schedule/history CRUD against a mocked fetch).
- **Note**: real persistence requires a Cloudflare D1 database + credentials. Without them the server boots but auth/data features degrade (logs a warning).

### LiveKit migration — P2P WebRTC → SFU (scales to many participants)
- **Video engine replaced**: the old P2P WebRTC mesh (`useWebRTC.ts`, one `RTCPeerConnection` per peer) is replaced with **LiveKit**, a Selective Forwarding Unit (SFU). Each participant publishes once to the server, which forwards media selectively — a single meeting scales to dozens of participants, and millions of users across distributed LiveKit servers.
- **Server**: new `GET /api/livekit/token` endpoint (`handlers/liveKit.ts`) issues short-lived JWT room tokens using `livekit-server-sdk`. Credentials: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (in `apps/server/.env`).
- **Client**: new `useLiveKit` hook (`hooks/useLiveKit.ts`) connects to the LiveKit room, publishes local camera+mic (+screen share), and surfaces remote tracks as `MediaStream`s — so `VideoGrid`/`VideoPlayer`/`SpeakerView` keep working unchanged. Mute/video/screen-share toggles now drive LiveKit local tracks.
- **Deps**: added `livekit-client` (web) and `livekit-server-sdk` (server).
- **Note**: real video requires LiveKit credentials. Without them, the token endpoint returns 503 and the room shows no media (the rest of the app — chat, polls, schedule, auth, push-to-talk — still works).

### Sign-in redesign (Netlify-style) + digital AM/PM time picker
- **Time picker → digital clock**: the Schedule `TimePicker` is now a **hour (1–12) + minute (5-min steps) + AM/PM** selector (three columns), replacing the flat 30-minute slot grid. It still emits 24-hour `HH:MM`, so the server contract is unchanged. A **live summary bar** under the pickers shows the chosen slot (e.g. "Sun, Sep 20, 2026 · 3:15 PM").
- **Sign-in modal redesigned (Netlify-style)**: centered **Sign in** card with a brand header, a **"Continue with GitHub"** button, an "or" divider, and email + password fields (with icons). **Manual registration removed** — there is no "Create account" form; new users sign in with GitHub (or use email/password login).
- **GitHub login**: when `VITE_GITHUB_CLIENT_ID` is set in `apps/web/.env`, "Continue with GitHub" redirects to GitHub OAuth (`scope=user:email`). Without it, clicking shows "GitHub login belum dikonfigurasi (VITE_GITHUB_CLIENT_ID)". *(Note: the GitHub OAuth callback endpoint + token exchange are not yet implemented server-side — see docs/DEPLOYMENT.md.)*
- **Tests**: 4 new `TimePicker` component tests (hour+minute+period → correct 24h, 12 AM/PM mapping, minute preserved on period change, selection highlighting). Type env types added via `src/vite-env.d.ts`.

### Schedule UI redesign + multi-provider invites (final)
- **New `SchedulePicker` component** (`components/SchedulePicker.tsx`): replaces the stiff native `<input type="date">`/`<input type="time">` with a polished **custom calendar** (month navigation, weekday header, past dates disabled, today outlined, selected day highlighted) and a **digital time picker** (hour + minute + AM/PM; later replaced the initial 30-minute slot grid). Both are controlled components emitting `YYYY-MM-DD` and `HH:MM` — the socket contract is unchanged.
- **Schedule view layout**: meeting title → date calendar + time slots side by side → guest-emails input → submit. The **Schedule meeting** button stays disabled until a title, date, and time are chosen.
- **Invites via `mailto:` (any provider)**: scheduling with guest emails opens the **user's own mail client** (Gmail, Yahoo, Outlook, …) via `buildInviteMailto` with a pre-filled invite — title, date/time, room code, and join link (`CLIENT_URL/?join=CODE`). **No SMTP/Gmail credentials or server env setup required.** *(This replaced the earlier SMTP-based approach — `nodemailer`, `mailer.ts`, and the `GMAIL_USER`/`GMAIL_APP_PASSWORD` env vars were removed.)*
- **Schedule requires sign-in**: the **Schedule** nav item is hidden for guests; a signed-out visitor sees a Sign-in prompt instead of the form.
- **`ScheduledMeeting`** carries an optional `invitees: string[]`; the **Upcoming meetings** table shows invited emails as chips.
- **`SCHEDULE` server event** simplified: persists the meeting (with `invitees`) and acks `{ ok, meeting }`.
- **Tests**: 4 `buildInviteMailto` unit tests (recipients/subject/body/join-link, provider-agnostic, untitled meeting, trailing-slash).

### Landing page & admin gate
- **Nav tidied**: removed the `Meetings` and `Settings` views from the landing nav. Nav is now **Dashboard / Schedule / History (admin only)**.
- **`Start or join a meeting` card removed** from the Meetings view — the create/join form lives only on the **Dashboard** hero.
- **History is admin-only**: added an `ADMIN_EMAILS` allow-list (`["admin@meet.app"]`). Only a signed-in user whose email is in the list sees the **History** nav item, the full **History** view, and the **Recent meetings** section on the dashboard. Non-admins never see meeting records.
- **Schedule view titles fixed**: the two cards are now titled **"Schedule a meeting"** and **"Upcoming meetings"** (previously both generic/incorrect).
- **Hero mock grid now shows avatars**: the four tiles (Alice / Bob / You / Carol) each render a colored gradient avatar circle with an initial instead of being empty dark tiles.

### Push-to-Talk (Discord-style hold-to-talk)
- **New feature**: hold-to-talk mode where the mic stays muted until a hotkey (default **Space**) is held, or until the hold-to-talk mic button is held down with the mouse. Releasing mutes again.
- **`usePushToTalk` hook** (new): manages key/mouse hold state with safety guards — ignored while typing in a text field, auto-repeat ignored, and the mic is forced back to a safe (muted) baseline on window blur, unmount, or mode/hotkey change. Entering PTT mutes; leaving it restores an unmuted baseline.
- **`useWebRTC.setMute(muted)`** (new): deterministic mute (unlike the existing toggle), used by PTT to mute/unmute on key press/release.
- **`ControlBar`**: new **Push-to-Talk toggle button** (Radio icon, next to screen share) and the mic button becomes a **hold-to-talk** control while PTT is active. A hotkey picker was added to the More menu (persisted in `localStorage` as `huddle_ptt_key`).
- **`RoomPage`**: wires the hook, persists the chosen hotkey, and broadcasts mute changes to the room via the existing `TOGGLE_MUTE` event.
- **Tests**: 7 new `usePushToTalk` hook tests + 4 new `ControlBar` push-to-talk tests.

### SaaS Redesign (v0.5) — light theme + dashboard
- **HomePage → modern SaaS dashboard**: brand + top nav (Dashboard / Schedule / History / Settings) and a main content area with a top bar ("New meeting" action) and a card grid — **Start a meeting** (create/join form), **Upcoming** (schedule), **Recent** (history). *(Note: the Meetings and Settings views and the "Start or join a meeting" card were later removed in the "Landing page & admin gate" pass above.)* All UI clean, professional, light.
- **Light SaaS theme**: the entire app (home dashboard + room view) converted from dark to a **white/light** theme (`#f8fafc` base, dark slate text, lime accent). Done by swapping the `:root` CSS custom-property palette, so every component using CSS variables follows automatically. Video tiles stay dark for contrast (WebRTC video reads best on dark).
- **Feature "Dark Theme" → "Light SaaS Theme"** in docs.

### UI Polish (v0.4) — settings redesign, chat placement, background fixes
- **Chat/Participants sidebar moved to the right**: removed `order: -1` so the sidebar renders on the right side of the video area (was left). Chat is otherwise unchanged.
- **SettingsPanel redesigned (no scroll)**: compact clean modal that fits the viewport. **Video** section (resolution + camera/mic devices) and **Background** section (single row of swatches: None / Blur / Green / Blue / Red / Purple / Upload image) with a Cancel + Apply footer.
- **Background selection fixed (was broken)**: the old "Blur" option set `virtualBackground="blur"` which `VideoPlayer` never rendered, so selecting Blur did nothing. Background is now a single coherent state — Blur sets `backgroundBlur=true`, a color/image sets `virtualBackground`, None clears both.
- **Virtual background now visible**: the color/image layer previously rendered **behind the opaque video** (invisible). It now renders as a semi-transparent overlay above a dimmed video, so the selected background clearly shows.

### Bug Fixes (v0.3) — socket payload shape + production deployment
- **`PARTICIPANT_JOINED`/`PARTICIPANT_LEFT` payload parsing (critical WebRTC bug)**: The server broadcasts `participant:joined` as `{ user, participants }` and `participant:left` as `{ userId, participants }`, but `RoomPage` and `useWebRTC` read the payload as a bare `User`. The WebRTC offer handshake read `user.id` from the wrapper object (always `undefined`), so offers were sent with `to: undefined` and peer connections never established for new joiners; leaving participants were never removed from the peer map (leak). Both client handlers now read the correct envelope (`payload.user` / `payload.userId`).
- **`MEETING_TITLE_UPDATED` payload key**: The server emits `{ meetingTitle }` but `RoomPage` read `data.title` (always `undefined`), so renamed meetings never synced to other participants. Fixed to `data.meetingTitle`.
- **`WAITING_ROOM_UPDATE` payload type**: The server emitted `room.waitingRoom` (raw `string[]` of socket IDs) but the `WaitingRoom` panel expects `WaitingUser[]` (`{ socketId, name, requestedAt }`). Added `RoomManager.getWaitingUsers()` and broadcast the structured list, so the host's waiting-room panel shows names instead of raw IDs.
- **Production single-process serving**: The Socket.IO client connects to the **same origin** it's loaded from, but `DEPLOYMENT.md` told users to serve the web and server separately (Socket.IO would never connect). The server now serves `apps/web/dist` + SPA fallback on the same port, and the Docker server stage keeps the `apps/*` layout so the relative web-dist path resolves.

### UI & Feature Pass (v0.2)
- **Video tiles are now normal 16:9 boxes**: tiles no longer stretch into tall capsules; each is a fixed-aspect box centered in the grid, so the participant name and avatar stay fully visible.
- **Camera off now turns the camera light off**: `toggleVideo` fully stops and detaches the video track (`track.stop()` + `removeTrack` + `replaceTrack(null)`) instead of only disabling it; turning it back on re-acquires and re-attaches the camera.
- **Control bar made concise**: Reactions and Polls moved into a single **More** (⋯) dropdown; the AI Companion button was removed. Core controls (mute, camera, share, hand, record, layout, lock, chat, participants, invite, settings) stay visible.
- **AI Companion removed from the UI**: panel, control-bar button, sidebar, and all related `RoomPage` state/listeners are gone. Server-side AI handlers and shared types remain for API compatibility.
- **Reaction bar no longer overlaps the End Meeting button**: repositioned higher in the video area.
- **Chat panel moved to the left sidebar** and redesigned: own messages align right in an accent bubble, others align left with sender avatar initials.
- **Virtual background now visibly applies**: the selected color/image renders as a full background layer behind the video (previously a translucent overlay with no clear effect).
- **Recording download**: added a **Stop & Download Recording** action in the More menu; stopping assembles the WebM blob and triggers a browser download (previously there was no way to finish/download).

### Rebranding: MeetApp → Huddle
- App name changed to **Huddle** across the web client (`index.html` title, `HomePage` logo), server and shared comments, the startup scripts (`start.bat/.ps1`, `install-and-start.bat/.ps1`), and the `App.test.tsx` heading assertion.

### Bug Fix: Invite link (`?join=CODE`) joined an empty room
- **Before**: `App.tsx` forced `view="room"` whenever `?join=CODE` was present, rendering `RoomPage` without ever emitting `JOIN_ROOM`. The result was an empty meeting (room code `—`, 0 participants).
- **After**: `App.tsx` no longer forces the room view. `HomePage` reads `?join=CODE` on mount and pre-fills the join-code input. The visitor enters their name and clicks Join, which emits `JOIN_ROOM` normally. Invite links now work for fresh visitors.

### Bug Fix: Disabled buttons showed `cursor: pointer`
- **Before**: `styles.btn`/`heroBtn`/`navIconBtn` set `cursor: pointer` inline, which overrode the CSS `:disabled` rule — disabled buttons still looked clickable.
- **After**: Inline `cursor` removed from those styles. The base `button { cursor: pointer }` CSS handles normal state; `.hp-btn:disabled { cursor: not-allowed; opacity: 0.5 }` handles disabled state.

### Bug Fix: LiveCaptions TypeScript errors (TS2693)
- **Before**: `LiveCaptions.tsx` declared `Window.SpeechRecognition: typeof SpeechRecognition` where `SpeechRecognition` is an interface (a type). `typeof` requires a value, producing TS2693.
- **After**: Added a `SpeechRecognitionConstructor = new () => SpeechRecognition` type alias and used it for the `Window` properties, giving a value-level constructor type.

### UX: Button & terminology consistency (home page)
- "Create Room" → "Create meeting" (matches the hero CTA "Create a meeting").
- "OR JOIN EXISTING" → "OR JOIN WITH A CODE".
- Room-code input placeholder "ROOM CODE" → "ENTER CODE".
- Brightened low-contrast text: `--text-muted` and `--text-dim` palette values increased; added explicit `input::placeholder` color.
- Aligned the hero and form card columns to the top (`align-items: flex-start`).

### Bug Fix: Screen share self-view (can't see own share)
- **Before**: `toggleScreenShare` in `useWebRTC.ts` replaced the video track on peer senders via `sender.replaceTrack()`, but never updated the `localStream` state. The local `VideoPlayer` tile kept showing the camera stream, not the screen share — the user couldn't see their own shared screen.
- **After**: Added a separate `screenStream` state to `useWebRTC` that tracks the screen-share `MediaStream`. `VideoGrid`, `SpeakerView`, and `RoomPage` now receive `screenStream` as a prop. The local tile renders `screenStream` (screen) when sharing is active, falling back to `localStream` (camera) otherwise. Both `VideoGrid` grid mode and `SpeakerView` handle this transparently.

### Room UI Redesign
- **VideoPlayer tiles**: Larger initials (40px), radial-gradient avatar background with subtle accent glow, shadow (`box-shadow: 0 4px 16px`), gradient name overlay fading to transparent at the top, pill-shaped "You" badge.
- **RoomPage layout**: Subtle radial-gradient background (`rgba(155,234,92,0.06)`) instead of flat black. Header with `backdrop-filter: blur(8px)`, green pill room-code badge (`rgba(155,234,92,0.12)` background, `border-radius: 999px`).
- **VideoGrid alone**: When 1 participant, grid capped at `max-width: 660px` and centered with `align-content: center` — tile no longer stretches full-width.
- **ControlBar**: Buttons grouped into pill container (`border-radius: 999px`, border, `padding: 4px 8px`). Buttons are circular (`border-radius: 50%`). Bar uses glassmorphism (`backdrop-filter: blur(10px)`). Leave button separated to the right with danger glow shadow.
- **SpeakerView**: Now accepts `screenStream` prop; local speaker/thumbnail tiles use `screenStream || localStream`.

### Chat Notifications (unread badge + toast)
- **Unread badge**: Added `unreadChat` state in `RoomPage` and an `unreadChat` prop on `ControlBar`. When a `CHAT_MESSAGE` arrives while the chat panel is closed, the count increments and a red pill badge (with count) appears on the Chat button. Opening the chat clears the badge.
- **Toast preview**: When the chat panel is closed and a new message arrives, a floating toast (sender + message preview) slides up at the bottom of the video area via `chatToast` state in `RoomPage`. Auto-dismisses after 4s (with `toastIn` CSS keyframe); clicking it opens the chat.

### AI Companion auto-live
- Added `isLive` state to `AICompanion` with a "● LIVE / ○ Go Live" toggle button in the header.
- Added an auto-refresh effect: when live mode is on, the summary re-generates (debounced 1.5s) as chat messages arrive, so the panel stays up to date without manual "Generate Summary" clicks.
- Auto-starts live mode when the panel opens and messages already exist.
- Added `.ai-live-btn` CSS (active state = red glow).

### Sidebar/menu design polish
- **ChatPanel**: Message bubbles (rounded `12px`, accent sender name), pill input, circular send button.
- **ParticipantList**: Consistent header, radial-gradient avatars, pill "You"/"Host" badges, pill status badges.
- **SettingsPanel**: Glassmorphism overlay (`backdrop-filter: blur(4px)`), rounded panel with shadow, pill apply button, accent-colored checkbox.

### Recording: real MediaRecorder (was UI-only badge)
- **Before**: Toggling record only emitted `TOGGLE_RECORDING` — the server flipped `room.recording` and showed a red "REC" badge. Nothing was actually recorded.
- **After**: `RoomPage.handleToggleRecord()` (host only) now drives a client-side `MediaRecorder`:
  - Start: creates a `MediaRecorder` on the stream being shared locally (`screenStream || localStream`, WebM/VP8+Opus), collects chunks via `ondataavailable`.
  - Stop: assembles chunks into a `Blob` and auto-downloads `Huddle-<timestamp>.webm`.
  - Still emits `TOGGLE_RECORDING` so the badge syncs for all participants.
  - Refs (`recorderRef`, `recorderChunksRef`) hold the recorder; `useRef` imported.

### AI Companion redesign (mismatched CSS fixed)
- **Before**: The JSX used classes `ai-header`, `ai-tabs`, `ai-content` but the CSS defined `ai-companion-header`, `ai-companion-tabs`, `ai-companion-body` — the classes never matched, so the panel rendered essentially unstyled/ugly.
- **After**: JSX rewritten to use the matching polished classes. Header now groups the LIVE toggle + close button; tabs use `ai-tab` with accent underline; body has proper input rows, note items, action items with checkboxes, and a structured summary (key topics / notes / action items sections).

### Homepage visual polish
- **Ambient background**: radial gradients (lime-green top-left, dark-green bottom-right) over the base dark — no more flat black.
- **Navbar**: glassmorphism (`backdrop-filter: blur(10px)`, translucent).
- **Hero CTA**: pill button (`border-radius: 999px`) with green glow shadow.
- **Form card**: translucence + `backdrop-filter`, larger radius (`var(--radius-xl)`), deeper shadow, top spacing.
- **Preview card**: deeper shadow for separation from the background.

### Adjust view (Google Meet-style layout picker)
- **LayoutMode** extended from `"grid" | "speaker"` to `"auto" | "grid" | "speaker" | "sidebar"`.
- New **`ViewSettingsModal`**: "Adjust view" picker with four radio-style layout cards (Auto dynamic / Tiled legacy / Spotlight / Sidebar), each with an icon preview; a tile-size slider (disabled when the chosen layout can't resize); and a "Hide tiles without video" toggle (local preference).
- The ControlBar **layout button now opens the Adjust view modal** (replacing the old grid↔speaker toggle).
- **VideoGrid** supports the new modes: `grid`/`auto` (responsive grid), `speaker` (spotlight → `SpeakerView`), `sidebar` (main speaker + 180px side rail).
- Selected layout broadcasts via `SET_LAYOUT` and updates `RoomContext` immediately.

### Pre-join / lobby screen (Google Meet-style)
- New **`PreJoinScreen`** shown before entering a meeting (create or join flow).
- Acquires camera + mic via `getUserMedia` and shows a live camera preview with the user's name overlay.
- Enumerates devices and renders pill-shaped **microphone** and **camera** selectors.
- Toggle buttons to mute mic / disable camera (updates the preview stream in place).
- "Join now" stops the preview stream and proceeds to emit `CREATE_ROOM` / `JOIN_ROOM` and enter the room; "Cancel" returns to the home form.
- Shows initials fallback + permission error message when no camera/mic is available.
- `HomePage` restructured: `handleCreate`/`handleJoin` open the preview; `confirmCreate`/`confirmJoin` perform the actual socket emit.

### In-call UI polish (Google Meet-style cleanup)
- **Header**: restructured to `flex justify-content: space-between` — title + recording + timer grouped left, room code pill + participant count right. Uses glassmorphism overlay (`backdrop-filter: blur(8px)`) with translucent background.
- **ControlBar group dividers**: two vertical `1px` separator lines added between the three button groups (Media → Engage → Panel) so the bar no longer looks like one crowded pill.
- **Video tiles — name overlay**: changed from full-width gradient to a compact pill (`border-radius: 999px`, translucent background + `backdrop-filter: blur(4px)`), positioned bottom-left (matching Google Meet name labels).
- **VideoPlayer container**: tighter `boxShadow`, consistent radius (`var(--radius-lg)`), subtle border.
- **VideoGrid sidebar layout**: new sidebar mode with a main speaker area + 180px vertical rail.

### Recording: full start / pause / resume / stop
- **`handleToggleRecord`** now cycles start → pause → resume (3-state) via `MediaRecorder.pause()`/`resume()`.
- Added `recordingSeconds` state + a 1s ticker effect that increments only while actively recording (paused freezes the timer).
- **`RecordingIndicator`** enhanced: shows pulsing dot, "REC"/"PAUSED" label, and elapsed time (MM:SS / HH:MM:SS). Background shifts red (recording) → amber (paused).
- **ControlBar record button** reflects the state: circle (idle) → pause icon (recording) → play icon (paused), with matching titles.
- Stop assembles chunks into WebM and auto-downloads, resetting the timer.

### Virtual background: custom image upload + image rendering
- **`VideoPlayer`** now renders image backgrounds: values starting with `data:` or `http(s):` are applied as `url(...) center / cover`; solid colors render as before.
- **`SettingsPanel`** added an "Upload background image" file input (`accept="image/*"`) that reads the file as a data URL and sets it as `virtualBackground`. A preview thumbnail + "Remove" button appear for uploaded backgrounds. Uploading auto-clears the blur toggle.

### Pre-join polish
- **Name casing**: display name capitalized (e.g. "mANAN" → "Manan") in the preview overlay and "Joining as …" subtitle.
- **Meeting title** shown in the side panel (`title` prop), matching the reference lobby.
- **Device selectors** are equal-width (`flex: 1` each) with truncating labels.

### AI Companion polish
- **LIVE badge** active state changed from red to green (`--accent`) so it reads as a positive "live" status, not an error.
- **Actions tab inputs**: restructured into stacked rows (action text + Add, then Assignee below) via `flex-direction: column` on `.ai-actions-input` — fixes the horizontal overflow that clipped the assignee field and exposed a scrollbar.

### Poll modal polish
- **Close button moved to the top-right** in a `.poll-modal-header` row next to the "Polls" title (was awkwardly at the bottom-center).
- Input widths already balanced (`.poll-input` full-width); option rows share equal spacing.

### Homepage redesign (remove confusion, polish)
- **Removed the dead settings icon** from the top navbar — it was a non-functional control that confused new users. Navbar is now clean (logo only, centered brand).
- **Replaced the decorative participant preview card** (which looked like an unfinished mockup) with a **Quick highlights** feature strip: three cards (HD video, Chat & polls, Private P2P) with icons + titles + descriptions. These fill the hero with intentional, informative content instead of a fake meeting panel.
- **Room-code placeholder** changed from "ENTER CODE" (read like a label) to natural "Enter code".
- Removed dead `navRight`/`navIconBtn` styles and the `Settings` lucide import.

### Comprehensive polish batch (layout, recording, panels)
- **Homepage header spacing**: hero content now has `padding: 48px 48px 32px` — no longer flush against the header divider.
- **Pre-join tile**: panel narrowed 720px → 640px; preview capped at `max-height: 300px` so it's no longer oversized.
- **Video tile sizing**: `VideoGrid` now uses `gridAutoRows: 1fr` + `height: 100%` + `alignItems: stretch` so tiles fill the available canvas (a lone participant is a proper large tile, not a narrow strip). `VideoPlayer` container is `height: 100%` with `min-height: 180px`.
- **Recording fixed (real bug)**: `handleToggleRecord` now emits `{ roomId }` with `TOGGLE_RECORDING` — the server expects that payload to flip recording state. Previously it emitted nothing, so the server never toggled, and the REC indicator/timer/pause never appeared. Timer ticker + pause/resume + `RecordingIndicator` (REC/PAUSED + MM:SS) now work.
- **Screen share self-view**: confirmed `screenStream` is set in `useWebRTC.toggleScreenShare` and threaded through `VideoGrid`/`SpeakerView` — local tile shows the share. (Was already wired; verified.)
- **Virtual Background now visible**: the layer previously rendered BEHIND the opaque video (invisible). It now overlays above the video (`zIndex: 2`, `opacity: 0.72`, video dimmed to 0.55) so the chosen color/image is clearly applied. Upload (`data:`/`http:` URLs) renders as `cover` image.
- **Participants panel redesign**: proper header with count pill + accent bar; rows with hover, radial-gradient avatars, SVG mic-off/camera-off icons in tinted chips, Host crown, prominent "You" pill + avatar ring.
- **Polls modal redesign**: labeled Question/Options fields, circular remove buttons, accent pill Create Poll, vote options as rounded cards with count pills, clean animated progress bars in results.
- **AI Companion polish**: cleaner header (rounded close button), tab underline/nav polish.
