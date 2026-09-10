/**
 * @file Application-wide constants for the Huddle video conferencing platform.
 *
 * Centralizes all magic strings and configuration values used across both
 * server and client. Key groups:
 *   - SOCKET_EVENTS: All Socket.IO event names (the API contract between client and server)
 *   - ROOM_CONFIG: Room capacity and code generation settings
 *   - RESOLUTION_PRESETS: Video resolution presets for getUserMedia constraints
 *   - MEDIA_CONSTRAINTS: Default audio/video constraints for WebRTC
 *   - AI_COMPANION_SYSTEM: System prompt for the AI assistant
 *   - POLL_MAX_OPTIONS: Maximum options allowed in a poll
 *
 * Consumed by: RoomManager, all socket handlers, useWebRTC, all React components.
 */

/**
 * Complete catalog of Socket.IO event names.
 * Each key is a constant name used in code; each value is the wire event string.
 * Grouped by feature domain for discoverability.
 *
 * Pattern: client emits REQUEST event → server processes → broadcasts RESPONSE event.
 */
export const SOCKET_EVENTS = {
  // ── Room lifecycle ───────────────────────────────────────────────────
  /** Client → Server: request to create a new room. */
  CREATE_ROOM: "room:create",
  /** Client → Server: request to join an existing room by code. */
  JOIN_ROOM: "room:join",
  /** Client → Server: request to leave the current room. */
  LEAVE_ROOM: "room:leave",
  /** Server → Client: confirmation that room was created (includes room data). */
  ROOM_CREATED: "room:created",
  /** Server → Client: confirmation of successful join (includes room data). */
  ROOM_JOINED: "room:joined",
  /** Server → Client: the room has reached max capacity. */
  ROOM_FULL: "room:full",
  /** Server → Client: the room is locked (joiner placed in waiting room). */
  ROOM_LOCKED: "room:locked",
  /** Server → Client: full room state sync (after joins/leaves). */
  ROOM_STATE: "room:state",
  /** Server → Client: a new participant joined (to non-joiner clients). */
  PARTICIPANT_JOINED: "participant:joined",
  /** Server → Client: a participant left the room. */
  PARTICIPANT_LEFT: "participant:left",
  /** Client → Server (periodic): heartbeat so the server can reap dead connections. */
  PING: "ping",
  /** Client → Server: toggle microphone mute state. */
  TOGGLE_MUTE: "toggle:mute",
  /** Client → Server: toggle camera on/off state. */
  TOGGLE_VIDEO: "toggle:video",
  /** Client → Server (host only): mute a specific participant. */
  HOST_MUTE_USER: "host:mute-user",
  /** Client → Server (host only): unmute a specific participant. */
  HOST_UNMUTE_USER: "host:unmute-user",
  /** Client → Server (host only): mute all participants (Discord-style). */
  HOST_MUTE_ALL: "host:mute-all",
  /** Server → Client: force the local microphone muted (host action). */
  FORCE_MUTE: "force:mute",
  /** Server → Client: force the local microphone unmuted (host action). */
  FORCE_UNMUTE: "force:unmute",

  // ── WebRTC signaling ─────────────────────────────────────────────────
  /** Client ↔ Server ↔ Client: relay of SDP offers, answers, and ICE candidates. */
  SIGNAL: "signal",
  /** Unused directly; kept for documentation. Offers go through SIGNAL. */
  OFFER: "offer",
  /** Unused directly; kept for documentation. Answers go through SIGNAL. */
  ANSWER: "answer",
  /** Unused directly; kept for documentation. ICE candidates go through SIGNAL. */
  ICE_CANDIDATE: "ice-candidate",

  // ── Chat ─────────────────────────────────────────────────────────────
  /** Client → Server: send a chat message (server broadcasts to room). */
  CHAT_MESSAGE: "chat:message",
  /** Server → Client: batch of historical chat messages (on join). */
  CHAT_HISTORY: "chat:history",

  // ── Screen sharing ───────────────────────────────────────────────────
  /** Server → Client: a participant started screen sharing. */
  SCREEN_SHARE_STARTED: "screen:started",
  /** Server → Client: a participant stopped screen sharing. */
  SCREEN_SHARE_STOPPED: "screen:stopped",

  // ── Hand raise ───────────────────────────────────────────────────────
  /** Client → Server: raise hand (broadcast to room). */
  HAND_RAISE: "hand:raise",
  /** Client → Server: lower hand (broadcast to room). */
  HAND_LOWER: "hand:lower",

  // ── Recording ────────────────────────────────────────────────────────
  /** Client → Server: host toggles recording state. */
  TOGGLE_RECORDING: "recording:toggle",
  /** Server → Client: updated recording state for the room. */
  RECORDING_STATE: "recording:state",

  // ── Meeting title ────────────────────────────────────────────────────
  /** Client → Server: host sets/updates the meeting title. */
  SET_MEETING_TITLE: "meeting:setTitle",
  /** Server → Client: meeting title was updated. */
  MEETING_TITLE_UPDATED: "meeting:titleUpdated",

  // ── Layout ───────────────────────────────────────────────────────────
  /** Client → Server: toggle between grid and speaker layout. */
  SET_LAYOUT: "layout:set",
  /** Server → Client: layout mode changed (broadcast to all). */
  LAYOUT_CHANGED: "layout:changed",

  // ── Settings ─────────────────────────────────────────────────────────
  /** Client → Server: update meeting settings (resolution, devices, etc.). */
  UPDATE_SETTINGS: "settings:update",
  /** Server → Client: settings were updated. */
  SETTINGS_UPDATED: "settings:updated",

  // ── Virtual background ───────────────────────────────────────────────
  /** Client → Server: set or clear virtual background. */
  SET_BACKGROUND: "background:set",
  /** Server → Client: virtual background was updated. */
  BACKGROUND_UPDATED: "background:updated",

  // ── Invite ───────────────────────────────────────────────────────────
  /** Client → Server: request the invite link for the current room. */
  GET_INVITE_LINK: "invite:get",
  /** Server → Client: invite link data (code + URL). */
  INVITE_LINK: "invite:link",

  // ── AI Companion ─────────────────────────────────────────────────────
  /** Client → Server: request AI-generated meeting summary. */
  AI_GENERATE_SUMMARY: "ai:generateSummary",
  /** Server → Client: AI summary is ready. */
  AI_SUMMARY_READY: "ai:summaryReady",
  /** Client → Server: add a manual meeting note. */
  AI_ADD_NOTE: "ai:addNote",
  /** Server → Client: a meeting note was added (broadcast to room). */
  AI_NOTE_ADDED: "ai:noteAdded",
  /** Client → Server: add a manual action item. */
  AI_ACTION_ITEM: "ai:actionItem",
  /** Server → Client: an action item was added/updated (broadcast to room). */
  AI_ACTION_ITEM_UPDATED: "ai:actionItemUpdated",

  // ── Reactions ────────────────────────────────────────────────────────
  /** Client → Server: send an emoji reaction. */
  SEND_REACTION: "reaction:send",
  /** Server → Client: broadcast a reaction to all room participants. */
  REACTION_BROADCAST: "reaction:broadcast",

  // ── Polls ────────────────────────────────────────────────────────────
  /** Client → Server: create a new poll. */
  CREATE_POLL: "poll:create",
  /** Client → Server: cast a vote on a poll option. */
  VOTE_POLL: "poll:vote",
  /** Client → Server: close a poll (creator only). */
  CLOSE_POLL: "poll:close",
  /** Server → Client: a new poll was created (broadcast to room). */
  POLL_UPDATE: "poll:update",
  /** Server → Client: poll vote counts updated or poll closed. */
  POLL_RESULT: "poll:result",

  // ── Live captions ────────────────────────────────────────────────────
  /** Client → Server: a speech-to-text caption segment. */
  CAPTION_SEGMENT: "caption:segment",
  /** Client → Server: toggle captions on/off. */
  CAPTION_TOGGLE: "caption:toggle",
  /** Server → Client: captions were enabled/disabled. */
  CAPTIONS_ENABLED: "captions:enabled",

  // ── Waiting room ─────────────────────────────────────────────────────
  /** Server → Client: user was placed in the waiting room. */
  JOIN_WAITING_ROOM: "waitingRoom:join",
  /** Client → Server: host admits a user from the waiting room. */
  ADMIT_USER: "waitingRoom:admit",
  /** Client → Server: host rejects a user from the waiting room. */
  REJECT_USER: "waitingRoom:reject",
  /** Server → Client: the waiting room list was updated. */
  WAITING_ROOM_UPDATE: "waitingRoom:update",
  /** Server → Client: tells a joining user they are in the waiting room. */
  WAITING_ROOM_STATUS: "waitingRoom:status",
  /** Client → Server: host toggles whether the room is locked. */
  TOGGLE_LOCK: "room:toggleLock",
  /** Server → Client: the room lock state changed (broadcast to all). */
  LOCK_CHANGED: "room:lockChanged",

  // ── End meeting ──────────────────────────────────────────────────────
  /** Client → Server: host ends the meeting for all participants. */
  END_MEETING: "meeting:end",
  /** Server → Client: the meeting has ended (kicks all participants). */
  MEETING_ENDED: "meeting:ended",

  // ── Meeting timer ────────────────────────────────────────────────────
  /** Server → Client: the meeting timer has started (includes startedAt timestamp). */
  MEETING_STARTED: "meeting:started",
} as const;

/**
 * Room configuration limits and code generation parameters.
 * Used by RoomManager for validation and room code creation.
 */
export const ROOM_CONFIG = {
  /** Maximum number of participants allowed in a single room. */
  MAX_PARTICIPANTS: 10,
  /** Length of the generated room code (e.g. "A3F9K2"). */
  CODE_LENGTH: 6,
  /** Allowed characters in room codes (excludes ambiguous I/1/O/0). */
  CODE_CHARS: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
} as const;

/**
 * Video resolution presets mapped to getUserMedia constraints.
 * Key names match MeetingSettings.resolution values.
 * Used by useWebRTC.buildConstraints() when acquiring or re-acquiring media.
 */
export const RESOLUTION_PRESETS: Record<string, { width: number; height: number; frameRate: number }> = {
  "360p": { width: 640, height: 360, frameRate: 24 },
  "480p": { width: 854, height: 480, frameRate: 24 },
  "720p": { width: 1280, height: 720, frameRate: 30 },
  "1080p": { width: 1920, height: 1080, frameRate: 30 },
} as const;

/**
 * Default audio/video MediaStreamConstraints for getUserMedia.
 * Applied when no device-specific constraints are set.
 * Used by useWebRTC for initial media acquisition and as fallback.
 */
export const MEDIA_CONSTRAINTS = {
  /** Audio processing: echo cancellation, noise suppression, auto gain. */
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  /** Video: default to 720p @ 30fps (ideal, not mandatory). */
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  },
} as const;

/**
 * System prompt for the AI Companion assistant.
 * Defines the AI's role and behavior guidelines for meeting summaries.
 * Used by the server-side summary generation logic.
 */
export const AI_COMPANION_SYSTEM = `You are a meeting AI assistant inside a video call. Your role:
- Summarize key discussion points from chat messages
- Extract action items with assignees
- Generate meeting notes
- Be concise and professional
- Use bullet points for clarity`;

/** Maximum number of options allowed when creating a poll (enforced client-side). */
export const POLL_MAX_OPTIONS = 6;
