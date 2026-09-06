/**
 * @file Public API surface for the @meet-app/shared package.
 *
 * Re-exports all types and constants used by both the server and web client.
 * Import from "@meet-app/shared" to access shared definitions.
 *
 * Types: User, Room, ChatMessage, SignalPayload, MeetingSettings, etc.
 * Constants: SOCKET_EVENTS, ROOM_CONFIG, RESOLUTION_PRESETS, MEDIA_CONSTRAINTS, etc.
 */
export type {
  User,
  Room,
  CreateRoomRequest,
  JoinRoomRequest,
  ChatMessage,
  ICECandidate,
  SignalPayload,
  RoomState,
  MeetingSettings,
  RecordingState,
  LayoutMode,
  InviteLink,
  MeetingNote,
  ActionItem,
  MeetingSummary,
  ReactionType,
  Reaction,
  PollOption,
  Poll,
  CaptionSegment,
  WaitingUser,
} from "./types.js";
export {
  SOCKET_EVENTS,
  ROOM_CONFIG,
  MEDIA_CONSTRAINTS,
  RESOLUTION_PRESETS,
  AI_COMPANION_SYSTEM,
  POLL_MAX_OPTIONS,
} from "./constants.js";
