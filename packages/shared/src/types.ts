/**
 * @file Shared type definitions for the Huddle video conferencing platform.
 *
 * This file defines all TypeScript interfaces and types shared between the
 * worker (apps/worker) and web client (apps/web). These types ensure
 * consistent data shapes across the entire application:
 *   - User & Room management (joining, leaving, host controls)
 *   - WebRTC signaling (offers, answers, ICE candidates)
 *   - Chat messaging
 *   - AI Companion (notes, action items, summaries)
 *   - Reactions, Polls, Live Captions, Waiting Room
 *
 * Consumed by: RoomManager, all socket handlers, all React components.
 */

/** Represents a single participant in a video meeting room. */
export interface User {
  /** Unique identifier (matches socket.id on the server). */
  id: string;
  /** Display name shown in the participant list and video overlay. */
  name: string;
  /** Whether this user is the room host (grants admin controls). */
  isHost: boolean;
  /** Whether the user's microphone is muted. */
  isMuted: boolean;
  /** Whether the user's camera is turned off. */
  isVideoOff: boolean;
  /** Whether the user has raised their hand (visible badge). */
  isHandRaised: boolean;
  /** Timestamp (ms) when the user joined the room. */
  joinedAt: number;
}

/**
 * Represents a video meeting room.
 * Created on `room:create`, stored in RoomManager, and broadcast to all participants.
 */
export interface Room {
  /** UUID identifying the room internally (used for RoomManager lookups). */
  id: string;
  /** Short alphanumeric code participants use to join (e.g. "A3F9K2"). */
  code: string;
  /** Socket ID of the room host. */
  hostId: string;
  /** Current list of participants in the room. */
  participants: User[];
  /** Whether the room is locked (new joiners go to waiting room). */
  isLocked: boolean;
  /** Display title set by the host. */
  meetingTitle: string;
  /** Recording state, or null if not recording. */
  recording: RecordingState | null;
  /** Array of socket IDs of users waiting to be admitted. */
  waitingRoom: string[];
  /** Timestamp (ms) when the meeting timer started. */
  startedAt: number;
  /** Timestamp (ms) when the room was created. */
  createdAt: number;
}

/** Payload sent by the client to create a new room. */
export interface CreateRoomRequest {
  /** Display name of the host creating the room. */
  hostName: string;
  /** Optional initial meeting title. */
  meetingTitle?: string;
}

/** Payload sent by the client to join an existing room by code. */
export interface JoinRoomRequest {
  /** The 6-character room code (e.g. "A3F9K2"). */
  code: string;
  /** Display name of the joining participant. */
  userName: string;
}

/** A single chat message in the in-room text chat. */
export interface ChatMessage {
  /** UUID of this message. */
  id: string;
  /** Socket ID of the sender. */
  senderId: string;
  /** Display name of the sender. */
  senderName: string;
  /** Message body text. */
  text: string;
  /** Timestamp (ms) when the message was sent. */
  timestamp: number;
}

/**
 * Wraps an ICE candidate for WebRTC signaling.
 * Sent between peers via the `signal` socket event.
 */
export interface ICECandidate {
  /** The serialized ICE candidate string. */
  candidate: string;
  /** SDP media stream identification tag. */
  sdpMid: string | null;
  /** SDP media line index. */
  sdpMLineIndex: number | null;
}

/**
 * WebRTC signaling payload exchanged between peers via the server relay.
 * Carries offers, answers, and ICE candidates between participants.
 *
 * Flow: Client A emits `signal` → Server relays to Client B.
 */
export interface SignalPayload {
  /** Type of signaling message. */
  type: "offer" | "answer" | "ice-candidate";
  /** Socket ID of the sender. */
  from: string;
  /** Socket ID of the intended recipient. */
  to: string;
  /** The SDP description (offer/answer) or ICE candidate data. */
  data: RTCSessionDescriptionInit | ICECandidate;
}

/**
 * Full room state broadcast to all participants after joins/leaves.
 * Ensures all clients stay in sync with the authoritative server state.
 */
export interface RoomState {
  /** The current room object. */
  room: Room;
  /** The current participant list. */
  participants: User[];
}

/**
 * User-configurable meeting settings (resolution, devices, backgrounds).
 * Applied via useWebRTC.applySettings() which re-acquires media with new constraints.
 */
export interface MeetingSettings {
  /** Meeting display title. */
  title: string;
  /** Video resolution preset key (maps to RESOLUTION_PRESETS). */
  resolution: "720p" | "1080p" | "480p" | "360p";
  /** Device ID for audio input (empty = system default). */
  audioDevice: string;
  /** Device ID for video input (empty = system default). */
  videoDevice: string;
  /** Whether to apply a CSS blur filter on the local video. */
  backgroundBlur: boolean;
  /** CSS color string or "blur" for virtual background, null for none. */
  virtualBackground: string | null;
}

/**
 * State of the in-room recording indicator.
 * Stored per-room in RoomManager; toggled by the host only.
 */
export interface RecordingState {
  /** Whether recording is currently active. */
  isRecording: boolean;
  /** Socket ID of the host who started the recording. */
  startedBy: string;
  /** Timestamp (ms) when recording started. */
  startedAt: number;
}
/**
 * Video display layout mode (Google Meet "Adjust view" options).
 * - "auto": dynamic layout (grid that adapts to participant count)
 * - "grid": tiled — all participants in equal-sized tiles
 * - "speaker": spotlight — one large speaker + side thumbnails
 * - "sidebar": one main speaker + a narrow side column of tiles
 */
export type LayoutMode = "auto" | "grid" | "speaker" | "sidebar";

/**
 * Invite link data returned to the client when generating an invite URL.
 * Used by InviteModal to display the shareable link and room code.
 */
export interface InviteLink {
  /** The short room code. */
  code: string;
  /** The full URL to join the room. */
  url: string;
}

// ─── AI Companion ─────────────────────────────────────────────────────────────

/** A meeting note created manually or auto-generated by AI. */
export interface MeetingNote {
  /** UUID of this note. */
  id: string;
  /** Note body text. */
  text: string;
  /** Timestamp (ms) when the note was created. */
  timestamp: number;
  /** "ai" for auto-generated notes, or the user's socket ID for manual notes. */
  author: "ai" | string;
}

/** A discrete action item extracted from chat or created manually. */
export interface ActionItem {
  /** UUID of this action item. */
  id: string;
  /** Description of the task. */
  text: string;
  /** Name of the assigned person, or null if unassigned. */
  assignee: string | null;
  /** Whether the action item has been completed. */
  done: boolean;
}

/**
 * Complete meeting summary generated by the AI Companion.
 * Contains notes, action items, and key discussion topics.
 */
export interface MeetingSummary {
  /** List of meeting notes. */
  notes: MeetingNote[];
  /** List of action items. */
  actionItems: ActionItem[];
  /** Top keywords/topics extracted from chat messages. */
  keyTopics: string[];
  /** Timestamp (ms) when the summary was generated. */
  generatedAt: number;
}

// ─── Reactions ────────────────────────────────────────────────────────────────

/** Available emoji reaction types that participants can send. */
export type ReactionType = "👍" | "❤️" | "😂" | "🎉" | "👏" | "🤔" | "❌" | "✅";

/**
 * A single reaction sent by a participant.
 * Broadcast to all room members via `reaction:broadcast`.
 * Displayed by ReactionOverlay with a floating animation.
 */
export interface Reaction {
  /** UUID of this reaction (used as animation key). */
  id: string;
  /** Socket ID of the user who reacted. */
  userId: string;
  /** Display name of the reactor. */
  userName: string;
  /** The emoji reaction type. */
  type: ReactionType;
  /** Timestamp (ms) when the reaction was sent. */
  timestamp: number;
}

// ─── Polls ────────────────────────────────────────────────────────────────────

/** A single option within a poll, tracking votes. */
export interface PollOption {
  /** UUID of this option. */
  id: string;
  /** Display text for the option. */
  text: string;
  /** Array of socket IDs who voted for this option. */
  votes: string[];
}

/**
 * An in-room poll with a question and multiple-choice options.
 * Created by any participant; stored in-memory per room on the server.
 */
export interface Poll {
  /** UUID of this poll. */
  id: string;
  /** The poll question. */
  question: string;
  /** Available options to vote on (2–6). */
  options: PollOption[];
  /** Socket ID of the user who created the poll. */
  createdBy: string;
  /** Whether voting is still open. */
  isActive: boolean;
  /** Timestamp (ms) when the poll was created. */
  createdAt: number;
}

// ─── Live Captions ────────────────────────────────────────────────────────────

/**
 * A single speech-to-text caption segment.
 * Produced by the Web Speech API on the client, relayed via server
 * to other participants. Displayed by LiveCaptions component.
 */
export interface CaptionSegment {
  /** UUID of this segment. */
  id: string;
  /** Socket ID of the speaker. */
  userId: string;
  /** Display name of the speaker. */
  userName: string;
  /** Transcribed text. */
  text: string;
  /** Timestamp (ms) when the segment was captured. */
  timestamp: number;
  /** Whether this is a final (committed) result or an interim draft. */
  isFinal: boolean;
}

// ─── Waiting Room ─────────────────────────────────────────────────────────────

/**
 * A user currently in the waiting room (pending host approval).
 * Shown in the WaitingRoom panel for the host to admit or reject.
 */
export interface WaitingUser {
  /** Socket ID of the waiting user. */
  socketId: string;
  /** Display name of the waiting user. */
  name: string;
  /** Timestamp (ms) when the user joined the waiting room. */
  requestedAt: number;
}
