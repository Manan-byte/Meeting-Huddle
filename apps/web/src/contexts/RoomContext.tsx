/**
 * @file Room context — manages shared room state across all components.
 *
 * Centralizes all room-related state that multiple components need to read/write:
 *   - room: current Room object (code, host, settings)
 *   - currentUser: the local user's User object
 *   - participants: list of all users in the room
 *   - messages: chat message history
 *   - layout: grid or speaker mode
 *   - recording: recording state
 *   - meetingStartedAt: timestamp for the meeting timer
 *
 * Provides helper functions (addMessage, updateParticipant) that wrap
 * state setters with immutable update patterns.
 *
 * Used by: RoomPage (sets/updates all state), ControlBar, ChatPanel,
 *          ParticipantList, VideoGrid, MeetingTitle, MeetingTimer, etc.
 */

import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode, Dispatch, SetStateAction } from "react";
import type { Room, User, ChatMessage, LayoutMode, RecordingState } from "@meet-app/shared";

/** Shape of the room context value — all state and setters available to consumers. */
interface RoomContextValue {
  /** The current Room object, or null if not in a room. */
  room: Room | null;
  /** The local user's User object, or null before joining. */
  currentUser: User | null;
  /** All participants currently in the room. */
  participants: User[];
  /** Chat message history for the current room. */
  messages: ChatMessage[];
  /** Current video layout mode ("grid" or "speaker"). */
  layout: LayoutMode;
  /** Recording state, or null if not recording. */
  recording: RecordingState | null;
  /** Timestamp (ms) when the meeting timer started. */
  meetingStartedAt: number;

  /** Set the current room (called on room create/join). */
  setRoom: (room: Room | null) => void;
  /** Set the current user (called on room create/join). */
  setCurrentUser: (user: User | null) => void;
  /** Replace the entire participant list (called on ROOM_STATE sync). */
  setParticipants: Dispatch<SetStateAction<User[]>>;
  /** Append a new chat message to history. */
  addMessage: (message: ChatMessage) => void;
  /** Replace the entire message list (called on CHAT_HISTORY load). */
  setMessages: (messages: ChatMessage[]) => void;
  /** Merge partial updates into a specific participant (e.g. mute toggle). */
  updateParticipant: (userId: string, updates: Partial<User>) => void;
  /** Set the layout mode. */
  setLayout: Dispatch<SetStateAction<LayoutMode>>;
  /** Set the recording state. */
  setRecording: Dispatch<SetStateAction<RecordingState | null>>;
  /** Set the meeting start timestamp. */
  setMeetingStartedAt: Dispatch<SetStateAction<number>>;
}

// Create context with null default (must be used inside RoomProvider)
const RoomContext = createContext<RoomContextValue | null>(null);

/**
 * Hook to access room state and setters from any component.
 * Must be used inside a RoomProvider.
 * @throws Error if used outside RoomProvider
 */
export function useRoom() {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error("useRoom must be used within RoomProvider");
  return ctx;
}

/**
 * RoomProvider component — holds all room state and provides it to children.
 *
 * @param children - Child components that need access to room state
 */
export function RoomProvider({ children }: { children: ReactNode }) {
  // ── State variables ──────────────────────────────────────────────────
  const [room, setRoom] = useState<Room | null>(null);                    // Current room object
  const [currentUser, setCurrentUser] = useState<User | null>(null);      // Local user
  const [participants, setParticipants] = useState<User[]>([]);           // All room participants
  const [messages, setMessages] = useState<ChatMessage[]>([]);            // Chat history
  const [layout, setLayout] = useState<LayoutMode>("grid");              // Video layout mode
  const [recording, setRecording] = useState<RecordingState | null>(null); // Recording state
  const [meetingStartedAt, setMeetingStartedAt] = useState<number>(Date.now()); // Timer start

  /**
   * Append a single chat message to the message list.
   * Uses functional update to avoid stale closure issues.
   */
  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  /**
   * Merge partial updates into a participant's data by userId.
   * Also updates currentUser if the updated participant is the local user.
   * Used by socket handlers for mute/video/hand-raise state changes.
   */
  const updateParticipant = useCallback(
    (userId: string, updates: Partial<User>) => {
      setParticipants((prev) =>
        prev.map((p) => (p.id === userId ? { ...p, ...updates } : p)),
      );
      // Also sync the currentUser state if it's the local user being updated
      if (currentUser?.id === userId) {
        setCurrentUser((prev) => (prev ? { ...prev, ...updates } : prev));
      }
    },
    [currentUser],
  );

  return (
    <RoomContext.Provider
      value={{
        room,
        currentUser,
        participants,
        messages,
        layout,
        recording,
        meetingStartedAt,
        setRoom,
        setCurrentUser,
        setParticipants,
        addMessage,
        setMessages,
        updateParticipant,
        setLayout,
        setRecording,
        setMeetingStartedAt,
      }}
    >
      {children}
    </RoomContext.Provider>
  );
}
