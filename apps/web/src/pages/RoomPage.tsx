/**
 * @file Room page — the main video meeting interface.
 *
 * This is the largest component, orchestrating all meeting features:
 *   - Socket event listeners (20+ events) that update room state
 *   - LiveKit integration via useLiveKit hook (SFU video engine)
 *   - Renders all sub-components: VideoGrid, ControlBar, ChatPanel, etc.
 *   - Manages UI panel visibility (chat, participants, settings, AI, etc.)
 *   - Handles edge cases: meeting ended screen, waiting room screen
 *
 * Data flow:
 *   Server → socket events → RoomPage handlers → RoomContext state → child components
 *   User actions → ControlBar buttons → RoomPage handlers → socket emits → Server
 *
 * Connects to: SocketContext, RoomContext, useLiveKit, all child components,
 *              server handlers (room, signaling, chat, features, meeting)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useSocket } from "../contexts/SocketContext";
import { useRoom } from "../contexts/RoomContext";
import {
  SOCKET_EVENTS,
  type Room,
  type ChatMessage,
  type RoomState,
  type User,
  type MeetingSettings,
  type RecordingState,
  type LayoutMode,
  type Reaction,
  type ReactionType,
  type CaptionSegment,
  type WaitingUser,
} from "@meet-app/shared";
import { Video, Clock } from "lucide-react";
import { useLiveKit } from "../hooks/useLiveKit";
import { usePushToTalk } from "../hooks/usePushToTalk";
import { useSpeakingLevel, SPEAKING_THRESHOLD } from "../hooks/useSpeakingLevel";
import { VideoGrid } from "../components/VideoGrid";
import { ControlBar } from "../components/ControlBar";
import { ChatPanel } from "../components/ChatPanel";
import { ParticipantList } from "../components/ParticipantList";
import { MeetingTitle } from "../components/MeetingTitle";
import { RecordingIndicator } from "../components/RecordingIndicator";
import { SettingsPanel } from "../components/SettingsPanel";
import { InviteModal } from "../components/InviteModal";
import { ReactionBar } from "../components/ReactionBar";
import { ReactionOverlay } from "../components/ReactionOverlay";
import { PollModal } from "../components/PollModal";
import { LiveCaptions } from "../components/LiveCaptions";
import { WaitingRoom } from "../components/WaitingRoom";
import { MeetingTimer } from "../components/MeetingTimer";
import { ViewSettingsModal } from "../components/ViewSettingsModal";

interface RoomPageProps {
  /** Callback to switch the App view back to "home" (leaves the room). */
  onLeaveRoom: () => void;
  /** True when we arrived via a locked-room join (waiting for host admit). */
  initialWaiting?: boolean;
}

/**
 * Main room page component — the video meeting interface.
 * Registers all socket event listeners and renders the full meeting UI.
 */
export function RoomPage({ onLeaveRoom, initialWaiting = false }: RoomPageProps) {
  // ── Context & hooks ───────────────────────────────────────────────────
  const { socket } = useSocket();
  const {
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
  } = useRoom();

  // ── UI panel visibility ───────────────────────────────────────────────
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  /** View settings ("Adjust view") modal visibility. */
  const [showViewSettings, setShowViewSettings] = useState(false);
  /** Number of chat messages received while the chat panel is closed (unread badge). */
  const [unreadChat, setUnreadChat] = useState(0);
  /** Whether dark mode is active (persisted in localStorage, applied to <html>). */
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem("huddle_dark") === "1";
    } catch {
      return false;
    }
  });

  // Apply / persist the theme on <html data-theme>.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    try {
      localStorage.setItem("huddle_dark", isDark ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [isDark]);
  /** Latest chat message to show in a toast when the panel is closed (auto-clears). */
  const [chatToast, setChatToast] = useState<ChatMessage | null>(null);

  // ── New feature state ─────────────────────────────────────────────────
  const [showReactions, setShowReactions] = useState(false);        // Reaction bar visibility
  const [showPolls, setShowPolls] = useState(false);                // Poll modal visibility
  const [isCaptionEnabled, setIsCaptionEnabled] = useState(false); // Live captions toggle
  const [recentReactions, setRecentReactions] = useState<Reaction[]>([]); // Floating reactions
  const [captionSegments, setCaptionSegments] = useState<CaptionSegment[]>([]); // Caption text
  const [waitingUsers, setWaitingUsers] = useState<WaitingUser[]>([]);  // Waiting room users
  const [isMeetingEnded, setIsMeetingEnded] = useState(false);     // Meeting ended flag
  const [isInWaitingRoom, setIsInWaitingRoom] = useState(initialWaiting);   // Waiting room flag
  /** Message shown when the host rejects a waiting-room join. */
  const [rejectMessage, setRejectMessage] = useState<string | null>(null);

  // ── Waiting-room admission ───────────────────────────────────────────
  // Registered UNCONDITIONALLY (the main listener effect returns early while
  // `room` is null, e.g. during the waiting room). When the host admits us the
  // server sends ROOM_JOINED — handle it here to populate room state and flip
  // out of the waiting screen. A host reject arrives as a plain "error" event.
  useEffect(() => {
    if (!socket) return;
    const handleAdmitted = (data: { room: Room; user: User }) => {
      setRoom(data.room);
      setCurrentUser(data.user);
      setParticipants(data.room.participants);
      setIsInWaitingRoom(false);
    };
    const handleWaitingStatus = (data: { waiting: boolean }) => {
      setIsInWaitingRoom(data.waiting);
    };
    const handleRejected = (msg: { message?: string } | undefined) => {
      setIsInWaitingRoom(false);
      setRejectMessage(msg?.message ?? "The host rejected your join request.");
    };
    socket.on(SOCKET_EVENTS.ROOM_JOINED, handleAdmitted);
    socket.on(SOCKET_EVENTS.WAITING_ROOM_STATUS, handleWaitingStatus);
    socket.on("error", handleRejected);
    return () => {
      socket.off(SOCKET_EVENTS.ROOM_JOINED, handleAdmitted);
      socket.off(SOCKET_EVENTS.WAITING_ROOM_STATUS, handleWaitingStatus);
      socket.off("error", handleRejected);
    };
  }, [socket, setRoom, setCurrentUser, setParticipants]);

  // ── Recording (client-side MediaRecorder) ──────────────────────────
  // Records the local stream (camera or screen share + mic audio) to WebM.
  // When recording starts: create MediaRecorder on localStream, collect chunks.
  // When recording stops: assemble chunks into a Blob and trigger auto-download.
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  /** Whether the recording is currently paused (MediaRecorder.pause). */
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  /** Elapsed recording time (seconds) — only counts while actively recording. */
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  // ── LiveKit hook ──────────────────────────────────────────────────
  // Manages local/remote media + screen sharing via the LiveKit SFU server.
  const {
    localStream,
    remoteStreams,
    toggleMute,
    setMute,
    toggleVideo,
    toggleScreenShare,
    isScreenSharing,
    screenStream,
    settings,
    applySettings,
  } = useLiveKit({ roomName: room?.code ?? null, identity: currentUser?.id ?? "participant" });

  // Local mic activity → speaking ring on the mic button (and own tile).
  const localSpeakingLevel = useSpeakingLevel(localStream);
  const isLocalSpeaking = localSpeakingLevel > SPEAKING_THRESHOLD && !(currentUser?.isMuted ?? false);

  // ── Push-to-talk (Discord-style hold-to-talk) ───────────────────────
  const [isPushToTalk, setIsPushToTalk] = useState(false);
  const [pushToTalkHotkey, setPushToTalkHotkey] = useState<string>(() => {
    try {
      return localStorage.getItem("huddle_ptt_key") ?? " ";
    } catch {
      return " ";
    }
  });
  // Persist the chosen hotkey so it survives page reloads.
  useEffect(() => {
    try {
      localStorage.setItem("huddle_ptt_key", pushToTalkHotkey);
    } catch {
      /* ignore */
    }
  }, [pushToTalkHotkey]);

  /** Apply a push-to-talk mute change locally and broadcast it to the room. */
  const handlePushToTalkMute = useCallback(
    (muted: boolean) => {
      if (!currentUser) return;
      updateParticipant(currentUser.id, { isMuted: muted });
      socket?.emit(SOCKET_EVENTS.TOGGLE_MUTE, { isMuted: muted });
    },
    [currentUser, socket, updateParticipant],
  );

  const pushToTalk = usePushToTalk({
    enabled: isPushToTalk,
    hotkey: pushToTalkHotkey,
    setMute,
    onMuteChange: handlePushToTalkMute,
  });

  // ════════════════════════════════════════════════════════════════════
  // SOCKET EVENT LISTENERS
  // ════════════════════════════════════════════════════════════════════
  // Registers 20+ listeners that update RoomContext state.
  // All listeners are cleaned up on unmount via the useEffect return.
  useEffect(() => {
    if (!socket || !room) return;

    // ── Room state sync ────────────────────────────────────────────────
    // Full room state from server (after joins/leaves)
    const handleRoomState = (state: RoomState) => {
      setParticipants(state.participants);
    };

    // ── Participant events ─────────────────────────────────────────────
    // New participant joined (add to list, triggers WebRTC offer)
    const handleParticipantJoined = (payload: { user: User }) => {
      const user = payload.user;
      setParticipants((prev) => {
        if (prev.some((p) => p.id === user.id)) return prev;
        return [...prev, user];
      });
    };

    // Participant left (remove from list, triggers WebRTC cleanup)
    const handleParticipantLeft = (payload: { userId: string }) => {
      const { userId } = payload;
      setParticipants((prev) => prev.filter((p) => p.id !== userId));
    };

    // ── Media state events ─────────────────────────────────────────────
    // Mute state changed by another participant
    const handleMuteToggle = (data: { userId: string; isMuted: boolean }) => {
      updateParticipant(data.userId, { isMuted: data.isMuted });
    };

    // Video state changed by another participant
    const handleVideoToggle = (data: { userId: string; isVideoOff: boolean }) => {
      updateParticipant(data.userId, { isVideoOff: data.isVideoOff });
    };

    // ── Chat events ────────────────────────────────────────────────────
    // New chat message from any participant.
    const handleChatMessage = (message: ChatMessage) => {
      addMessage(message);
      setShowChat((open) => {
        if (!open) {
          setUnreadChat((n) => n + 1);
          setChatToast(message); // show toast preview when panel is closed
        }
        return open;
      });
    };

    // Full chat history (loaded on room join)
    const handleChatHistory = (history: ChatMessage[]) => {
      setMessages(history);
    };

    // ── Hand raise event ───────────────────────────────────────────────
    // Hand raise/lower state changed
    const handleHandRaise = (data: { userId: string; isHandRaised: boolean }) => {
      updateParticipant(data.userId, { isHandRaised: data.isHandRaised });
    };

    // ── Recording event ────────────────────────────────────────────────
    // Recording state changed by host
    const handleRecordingState = (state: RecordingState) => {
      setRecording(state);
    };

    // ── Meeting title event ────────────────────────────────────────────
    // Title changed by host
    const handleMeetingTitleUpdated = (data: { meetingTitle: string }) => {
      if (room) {
        setRoom({ ...room, meetingTitle: data.meetingTitle });
      }
    };

    // ── Layout event ───────────────────────────────────────────────────
    // Layout mode changed by any participant
    const handleLayoutChanged = (data: { layout: LayoutMode }) => {
      setLayout(data.layout);
    };

    // ── Reaction event ─────────────────────────────────────────────────
    // Emoji reaction broadcast from any participant
    const handleReactionBroadcast = (reaction: Reaction) => {
      setRecentReactions((prev) => [...prev, reaction]);
    };


    // ── Caption events ─────────────────────────────────────────────────
    // New speech-to-text caption segment (from other participants only)
    const handleCaptionSegment = (segment: CaptionSegment) => {
      if (segment.userId !== currentUser?.id) {
        // Keep only last 20 segments to avoid memory growth
        setCaptionSegments((prev) => [...prev.slice(-20), segment]);
      }
    };

    // Captions enabled by any participant
    const handleCaptionsEnabled = (data: { enabled: boolean }) => {
      setIsCaptionEnabled(data.enabled);
    };

    // ── Waiting room events ────────────────────────────────────────────
    // Waiting room list updated (host sees new joiners)
    const handleWaitingRoomUpdate = (users: WaitingUser[]) => {
      setWaitingUsers(users);
    };

    // Status update for a user placed in waiting room
    const handleWaitingRoomStatus = (data: { waiting: boolean }) => {
      setIsInWaitingRoom(data.waiting);
    };

    // Lock state changed by the host — sync room.isLocked for all
    const handleLockChanged = (data: { isLocked: boolean }) => {
      if (room) {
        setRoom({ ...room, isLocked: data.isLocked });
      }
    };

    // ── Meeting lifecycle events ───────────────────────────────────────
    // Meeting ended by host — show "Meeting Has Ended" screen
    const handleMeetingEnded = () => {
      setIsMeetingEnded(true);
    };

    // Meeting started — set the timer start timestamp
    const handleMeetingStarted = (data: { startedAt: number }) => {
      setMeetingStartedAt(data.startedAt);
    };

    // ── Register all listeners ─────────────────────────────────────────
    socket.on(SOCKET_EVENTS.ROOM_STATE, handleRoomState);
    socket.on(SOCKET_EVENTS.PARTICIPANT_JOINED, handleParticipantJoined);
    socket.on(SOCKET_EVENTS.PARTICIPANT_LEFT, handleParticipantLeft);
    socket.on(SOCKET_EVENTS.TOGGLE_MUTE, handleMuteToggle);
    socket.on(SOCKET_EVENTS.TOGGLE_VIDEO, handleVideoToggle);
    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, handleChatMessage);
    socket.on(SOCKET_EVENTS.CHAT_HISTORY, handleChatHistory);
    socket.on(SOCKET_EVENTS.HAND_RAISE, handleHandRaise);
    socket.on(SOCKET_EVENTS.HAND_LOWER, handleHandRaise);
    socket.on(SOCKET_EVENTS.RECORDING_STATE, handleRecordingState);
    socket.on(SOCKET_EVENTS.MEETING_TITLE_UPDATED, handleMeetingTitleUpdated);
    socket.on(SOCKET_EVENTS.LAYOUT_CHANGED, handleLayoutChanged);
    socket.on(SOCKET_EVENTS.REACTION_BROADCAST, handleReactionBroadcast);
    socket.on(SOCKET_EVENTS.CAPTION_SEGMENT, handleCaptionSegment);
    socket.on(SOCKET_EVENTS.CAPTIONS_ENABLED, handleCaptionsEnabled);
    socket.on(SOCKET_EVENTS.WAITING_ROOM_UPDATE, handleWaitingRoomUpdate);
    socket.on(SOCKET_EVENTS.WAITING_ROOM_STATUS, handleWaitingRoomStatus);
    socket.on(SOCKET_EVENTS.LOCK_CHANGED, handleLockChanged);
    socket.on(SOCKET_EVENTS.MEETING_ENDED, handleMeetingEnded);
    socket.on(SOCKET_EVENTS.MEETING_STARTED, handleMeetingStarted);

    // ── Cleanup: remove all listeners on unmount or dependency change ──
    return () => {
      socket.off(SOCKET_EVENTS.ROOM_STATE, handleRoomState);
      socket.off(SOCKET_EVENTS.PARTICIPANT_JOINED, handleParticipantJoined);
      socket.off(SOCKET_EVENTS.PARTICIPANT_LEFT, handleParticipantLeft);
      socket.off(SOCKET_EVENTS.TOGGLE_MUTE, handleMuteToggle);
      socket.off(SOCKET_EVENTS.TOGGLE_VIDEO, handleVideoToggle);
      socket.off(SOCKET_EVENTS.CHAT_MESSAGE, handleChatMessage);
      socket.off(SOCKET_EVENTS.CHAT_HISTORY, handleChatHistory);
      socket.off(SOCKET_EVENTS.HAND_RAISE, handleHandRaise);
      socket.off(SOCKET_EVENTS.HAND_LOWER, handleHandRaise);
      socket.off(SOCKET_EVENTS.RECORDING_STATE, handleRecordingState);
      socket.off(SOCKET_EVENTS.MEETING_TITLE_UPDATED, handleMeetingTitleUpdated);
      socket.off(SOCKET_EVENTS.LAYOUT_CHANGED, handleLayoutChanged);
      socket.off(SOCKET_EVENTS.REACTION_BROADCAST, handleReactionBroadcast);
      socket.off(SOCKET_EVENTS.CAPTION_SEGMENT, handleCaptionSegment);
      socket.off(SOCKET_EVENTS.CAPTIONS_ENABLED, handleCaptionsEnabled);
      socket.off(SOCKET_EVENTS.WAITING_ROOM_UPDATE, handleWaitingRoomUpdate);
      socket.off(SOCKET_EVENTS.WAITING_ROOM_STATUS, handleWaitingRoomStatus);
      socket.off(SOCKET_EVENTS.LOCK_CHANGED, handleLockChanged);
      socket.off(SOCKET_EVENTS.MEETING_ENDED, handleMeetingEnded);
      socket.off(SOCKET_EVENTS.MEETING_STARTED, handleMeetingStarted);
    };
  }, [socket, room, currentUser?.id, setRoom, setParticipants, addMessage, setMessages, updateParticipant, setRecording, setLayout, setMeetingStartedAt]);

  // Auto-dismiss the chat toast after 4 seconds
  useEffect(() => {
    if (!chatToast) return;
    const t = setTimeout(() => setChatToast(null), 4000);
    return () => clearTimeout(t);
  }, [chatToast]);

  // Recording elapsed-time ticker — increments each second while actively
  // recording (paused recordings freeze the timer).
  useEffect(() => {
    const isRecording = recorderRef.current?.state === "recording";
    if (!isRecording || isRecordingPaused) return;
    const t = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isRecordingPaused, recording?.isRecording]);
  // ════════════════════════════════════════════════════════════════════
  // ACTION HANDLERS (user-initiated actions → socket emits)
  // ════════════════════════════════════════════════════════════════════

  /** Leave the room: emit LEAVE_ROOM to server, navigate back to home. */
  const handleLeave = () => {
    socket?.emit(SOCKET_EVENTS.LEAVE_ROOM);
    onLeaveRoom();
  };

  /** Toggle microphone: update local WebRTC track + emit state to server. */
  const handleToggleMute = () => {
    if (!currentUser) return;
    const newMuted = !currentUser.isMuted;
    toggleMute();
    socket?.emit(SOCKET_EVENTS.TOGGLE_MUTE, { isMuted: newMuted });
    updateParticipant(currentUser.id, { isMuted: newMuted });
  };

  /** Toggle camera: update local WebRTC track + emit state to server. */
  const handleToggleVideo = () => {
    if (!currentUser) return;
    const newVideoOff = !currentUser.isVideoOff;
    toggleVideo(newVideoOff); // stops/restarts the camera track (light goes off)
    socket?.emit(SOCKET_EVENTS.TOGGLE_VIDEO, { isVideoOff: newVideoOff });
    updateParticipant(currentUser.id, { isVideoOff: newVideoOff });
  };

  /** Toggle hand raise: emit state to server + update local participant. */
  const handleToggleHandRaise = () => {
    if (!currentUser) return;
    const newRaised = !currentUser.isHandRaised;
    socket?.emit(newRaised ? SOCKET_EVENTS.HAND_RAISE : SOCKET_EVENTS.HAND_LOWER);
    updateParticipant(currentUser.id, { isHandRaised: newRaised });
  };

  /** Send a chat message via socket. */
  const handleSendMessage = (text: string) => {
    if (!text.trim() || !socket) return;
    socket.emit(SOCKET_EVENTS.CHAT_MESSAGE, { text: text.trim() });
  };

  /**
   * Record control (host only). Supports start / pause / resume / stop:
   *   - Not recording      → start MediaRecorder, reset timer
   *   - Recording          → pause (freezes timer)
   *   - Paused             → resume (continues timer)
   * Stop assembles chunks into a WebM and auto-downloads it.
   */
  const handleToggleRecord = useCallback(() => {
    if (!currentUser?.isHost || !localStream) return;
    const rec = recorderRef.current;

    if (!rec || rec.state === "inactive") {
      // ── Start recording ──
      if (rec) {
        rec.stop();
        recorderRef.current = null;
      }
      recorderChunksRef.current = [];
      setRecordingSeconds(0);
      setIsRecordingPaused(false);
      const streamToRecord = screenStream || localStream;
      const recorder = new MediaRecorder(streamToRecord, { mimeType: "video/webm;codecs=vp8,opus" });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recorderChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(recorderChunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Huddle-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        recorderRef.current = null;
        setRecordingSeconds(0);
        setIsRecordingPaused(false);
      };
      recorderRef.current = recorder;
      recorder.start();
      // Notify server so RECORDING_STATE broadcasts to the room (indicator shows).
      socket?.emit(SOCKET_EVENTS.TOGGLE_RECORDING, { roomId: room?.id });
    } else if (rec.state === "recording") {
      // ── Pause recording (freeze timer) ──
      rec.pause();
      setIsRecordingPaused(true);
    } else {
      // ── Resume recording (continue timer) ──
      rec.resume();
      setIsRecordingPaused(false);
    }
  }, [currentUser, localStream, screenStream, socket, room]);

  /** Stop the recording and trigger the WebM download (host only). */
  const handleStopRecord = useCallback(() => {
    if (!currentUser?.isHost) return;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop(); // onstop handler assembles the blob and auto-downloads
    }
    // Notify server so RECORDING_STATE broadcasts stop to the room
    socket?.emit(SOCKET_EVENTS.TOGGLE_RECORDING, { roomId: room?.id });
  }, [currentUser, socket, room]);

  /** Toggle room lock (host only): emit to server, broadcast to all. */
  const handleToggleLock = useCallback(() => {
    if (!currentUser?.isHost || !socket || !room) return;
    socket.emit(SOCKET_EVENTS.TOGGLE_LOCK, { roomId: room.id });
  }, [currentUser, socket, room]);

  /** Apply a chosen layout from the Adjust view modal: emit + update local. */
  const handleApplyLayout = useCallback(
    (newLayout: LayoutMode) => {
      setLayout(newLayout);
      socket?.emit(SOCKET_EVENTS.SET_LAYOUT, { layout: newLayout });
    },
    [socket, setLayout],
  );

  /** Rename meeting title (host only): emit to server. */
  const handleRenameTitle = useCallback(
    (title: string) => {
      // Server resolves the room by `roomId`; without it the rename is a no-op.
      if (room) socket?.emit(SOCKET_EVENTS.SET_MEETING_TITLE, { title, roomId: room.id });
    },
    [socket, room],
  );

  /** Apply new settings: update local WebRTC media + emit to server. */
  const handleApplySettings = useCallback(
    (newSettings: MeetingSettings) => {
      applySettings(newSettings);
      socket?.emit(SOCKET_EVENTS.UPDATE_SETTINGS, newSettings);
    },
    [applySettings, socket],
  );

  // ── New feature handlers ─────────────────────────────────────────────
  /** Toggle the reaction bar visibility. */
  const handleToggleReactions = useCallback(() => setShowReactions((v) => !v), []);

  /** Send an emoji reaction via socket. */
  const handleReact = useCallback(
    (type: ReactionType) => {
      if (!socket || !currentUser) return;
      socket.emit(SOCKET_EVENTS.SEND_REACTION, { type });
    },
    [socket, currentUser],
  );

  /** End the meeting for all (host only): emit to server + navigate home. */
  const handleEndMeeting = useCallback(() => {
    if (!currentUser?.isHost || !socket) return;
    socket.emit(SOCKET_EVENTS.END_MEETING);
    onLeaveRoom();
  }, [currentUser, socket, onLeaveRoom]);

  /** Admit a user from the waiting room (host only). */
  const handleAdmitUser = useCallback(
    (socketId: string) => {
      socket?.emit(SOCKET_EVENTS.ADMIT_USER, { socketId });
    },
    [socket],
  );

  /** Reject a user from the waiting room (host only). */
  const handleRejectUser = useCallback(
    (socketId: string) => {
      socket?.emit(SOCKET_EVENTS.REJECT_USER, { socketId });
    },
    [socket],
  );

  // ════════════════════════════════════════════════════════════════════
  // RENDER: Special states (meeting ended, waiting room)
  // ════════════════════════════════════════════════════════════════════

  // Meeting ended screen — shown when host ends the meeting
  if (isMeetingEnded) {
    return (
      <div style={styles.endedContainer}>
        <div style={styles.endedContent}>
          <span style={styles.endedMark}><Video size={18} color="var(--accent-ink)" /></span>
          <span style={styles.endedEyebrow}>Huddle</span>
          <h2 style={styles.endedTitle}>Meeting Has Ended</h2>
          <p style={styles.endedSub}>The host has ended this meeting. Thanks for joining.</p>
          <button className="dash-primary" style={styles.endedButton} onClick={onLeaveRoom}>
            Return to Lobby
          </button>
        </div>
      </div>
    );
  }

  // Rejected from the waiting room — show the message and let the user leave.
  if (rejectMessage) {
    return (
      <div style={styles.endedContainer}>
        <div style={styles.endedContent}>
          <span style={styles.endedMark}><Video size={18} color="var(--accent-ink)" /></span>
          <span style={styles.endedEyebrow}>Huddle</span>
          <h2 style={styles.endedTitle}>Join Request Declined</h2>
          <p style={styles.endedSub}>{rejectMessage}</p>
          <button className="dash-primary" style={styles.endedButton} onClick={onLeaveRoom}>
            Return to Lobby
          </button>
        </div>
      </div>
    );
  }

  // Waiting room screen — shown when room is locked and user is waiting for host approval
  if (isInWaitingRoom) {
    return (
      <div style={styles.endedContainer}>
        <div style={styles.endedContent}>
          <span style={styles.endedMark}><Clock size={18} color="var(--accent-ink)" /></span>
          <span style={styles.endedEyebrow}>Huddle</span>
          <h2 style={styles.endedTitle}>Waiting Room</h2>
          <p style={styles.endedSub}>Please wait for the host to admit you.</p>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // RENDER: Main meeting interface
  // ════════════════════════════════════════════════════════════════════
  return (
    <div style={styles.container}>
      {/* ── Body row: main video + left sidebar ─────────────────────── */}
      <div style={styles.body}>
        {/* Main content area ──────────────────────────────────────── */}
        <div style={styles.main}>
          {/* Header bar: title + status (clean, Google Meet style) */}
          <div style={styles.header}>
          <div style={styles.headerLeft}>
            <MeetingTitle
              title={room?.meetingTitle ?? ""}
              isHost={currentUser?.isHost ?? false}
              onRename={handleRenameTitle}
            />
            <RecordingIndicator
              isRecording={recording?.isRecording ?? false}
              seconds={recordingSeconds}
              isPaused={isRecordingPaused}
            />
            {meetingStartedAt > 0 && <MeetingTimer startedAt={meetingStartedAt} />}
          </div>
          <div style={styles.headerRight}>
            <span style={styles.roomCode}>{room?.code ?? "—"}</span>
            <span style={styles.participantCount}>
              <span style={styles.liveDot} />
              {participants.length} participant{participants.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Video area + overlays */}
        <div style={styles.contentArea}>
          <VideoGrid
            localStream={localStream}
            remoteStreams={remoteStreams}
            participants={participants}
            currentUser={currentUser}
            layout={layout}
            settings={settings}
            screenStream={screenStream}
          />

          {/* Floating emoji reaction animations */}
          <ReactionOverlay reactions={recentReactions} />

          {/* Speech-to-text subtitle overlay */}
          <LiveCaptions
            isEnabled={isCaptionEnabled}
            socket={socket}
            segments={captionSegments}
            onSegment={(seg) => setCaptionSegments((prev) => [...prev.slice(-20), seg])}
            userName={currentUser?.name ?? ""}
            userId={currentUser?.id ?? ""}
          />

          {/* Waiting room panel (host only, shown when users are waiting) */}
          {currentUser?.isHost && waitingUsers.length > 0 && (
            <WaitingRoom
              waitingUsers={waitingUsers}
              onAdmit={handleAdmitUser}
              onReject={handleRejectUser}
            />
          )}

          {/* Emoji reaction bar (toggled by ControlBar) */}
          {showReactions && (
            <ReactionBar onReact={handleReact} recentReactions={recentReactions} />
          )}
        </div>

        {/* Chat toast — preview of an incoming message when the chat panel is closed */}
        {chatToast && (
          <div style={styles.chatToast} onClick={() => setShowChat(true)}>
            <span style={styles.chatToastSender}>{chatToast.senderName}</span>
            <span style={styles.chatToastText}>{chatToast.text}</span>
          </div>
        )}
        </div>

        {/* ── Sidebar (Participants / Chat) on the right ────────────── */}
        {/* Only one sidebar panel visible at a time */}
        <div
          style={{
            ...styles.sidebar,
            display: showChat || showParticipants ? "flex" : "none",
          }}
        >
          {showParticipants && (
            <ParticipantList participants={participants} currentUser={currentUser} />
          )}
{showChat && (
          <ChatPanel
            messages={messages}
            onSend={handleSendMessage}
            currentUserId={currentUser?.id}
          />
        )}
        </div>
      </div>

      {/* ── Bottom control bar ─────────────────────────────────────── */}
      <ControlBar
        isMuted={currentUser?.isMuted ?? false}
        isVideoOff={currentUser?.isVideoOff ?? false}
        isScreenSharing={isScreenSharing}
        isSpeaking={isLocalSpeaking}
        showChat={showChat}
        showParticipants={showParticipants}
        onToggleMute={handleToggleMute}
        onToggleVideo={handleToggleVideo}
        onToggleScreenShare={toggleScreenShare}
        onToggleChat={() => {
          setShowChat((v) => !v);
          setShowParticipants(false);
          setUnreadChat(0); // Opening the chat clears the unread badge
        }}
        onToggleParticipants={() => {
          setShowParticipants((v) => !v);
          setShowChat(false);
        }}
        onLeave={handleLeave}
        onToggleSettings={() => setShowSettings((v) => !v)}
        onToggleHandRaise={handleToggleHandRaise}
        onToggleInvite={() => setShowInvite((v) => !v)}
        onToggleLayout={() => setShowViewSettings((v) => !v)}
        onToggleRecord={handleToggleRecord}
        onStopRecord={handleStopRecord}
        isHandRaised={currentUser?.isHandRaised ?? false}
        isRecording={recording?.isRecording ?? false}
        isRecordingPaused={isRecordingPaused}
        isHost={currentUser?.isHost ?? false}
        isLocked={room?.isLocked ?? false}
        onToggleLock={handleToggleLock}
        isDark={isDark}
        onToggleDark={() => setIsDark((v) => !v)}
        layout={layout}
        onToggleReactions={handleToggleReactions}
        onTogglePolls={() => setShowPolls((v) => !v)}
        showReactions={showReactions}
        showPolls={showPolls}
        unreadChat={unreadChat}
        isPushToTalk={isPushToTalk}
        onTogglePushToTalk={() => setIsPushToTalk((v) => !v)}
        onPushToTalkStart={pushToTalk.startTalking}
        onPushToTalkStop={pushToTalk.stopTalking}
        pushToTalkHotkey={pushToTalkHotkey}
        onPushToTalkHotkeyChange={setPushToTalkHotkey}
      />

      {/* ── Modals (overlay panels) ────────────────────────────────── */}
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onApplySettings={handleApplySettings}
          currentSettings={settings}
        />
      )}
      {showInvite && room && (
        <InviteModal
          roomCode={room.code}
          onClose={() => setShowInvite(false)}
        />
      )}
      <PollModal
        isOpen={showPolls}
        onClose={() => setShowPolls(false)}
        socket={socket}
      />

      {/* Adjust view (layout) modal */}
      {showViewSettings && (
        <ViewSettingsModal
          layout={layout}
          onApply={handleApplyLayout}
          onClose={() => setShowViewSettings(false)}
        />
      )}
      {/* End meeting button (host only, floating above control bar) */}
      {currentUser?.isHost && (
        <button
          style={styles.endMeetingBtn}
          onClick={handleEndMeeting}
          title="End meeting for all"
        >
          End Meeting
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    background:
      "radial-gradient(ellipse 80% 60% at 50% -10%, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 60%), var(--bg)",
    color: "var(--text)",
  },
  body: {
    flex: 1,
    display: "flex",
    flexDirection: "row",
    overflow: "hidden",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minWidth: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "12px 24px",
    borderBottom: "1px solid var(--border)",
    background: "color-mix(in srgb, var(--bg-raised) 72%, transparent)",
    WebkitBackdropFilter: "blur(18px) saturate(160%)",
    backdropFilter: "blur(18px) saturate(160%)",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    minWidth: 0,
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexShrink: 0,
  },
  roomCode: {
    display: "inline-flex",
    alignItems: "center",
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    letterSpacing: "0.12em",
    fontWeight: 700,
    color: "var(--accent)",
    margin: 0,
    padding: "5px 14px",
    borderRadius: 999,
    background: "color-mix(in srgb, var(--accent) 10%, transparent)",
    border: "1px solid color-mix(in srgb, var(--accent) 24%, transparent)",
  },
  participantCount: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-muted)",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 14px",
    borderRadius: 999,
    background: "color-mix(in srgb, var(--bg-soft) 80%, transparent)",
    border: "1px solid var(--border)",
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "var(--success)",
    boxShadow: "0 0 0 3px color-mix(in srgb, var(--success) 22%, transparent)",
  },
  contentArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    position: "relative",
    overflow: "hidden",
    padding: "24px 24px 16px",
  },
  sidebar: {
    flexDirection: "column",
    width: 320,
    borderLeft: "1px solid var(--border)",
    background: "color-mix(in srgb, var(--bg-raised) 92%, transparent)",
    overflow: "hidden",
    flexShrink: 0,
  },
  endedContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    background:
      "radial-gradient(ellipse 60% 50% at 50% 30%, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 60%), var(--bg)",
  },
  endedContent: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    color: "var(--text)",
    padding: "0 24px",
  },
  endedMark: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 48,
    borderRadius: 16,
    background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)",
    boxShadow: "0 12px 32px color-mix(in srgb, var(--accent) 35%, transparent)",
    marginBottom: 18,
  },
  endedEyebrow: {
    fontFamily: "var(--font-display)",
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: "-0.01em",
    color: "var(--text-muted)",
    marginBottom: 10,
  },
  endedTitle: {
    fontSize: 40,
    fontWeight: 800,
    letterSpacing: "-0.03em",
    color: "var(--text)",
    margin: 0,
    fontFamily: "var(--font-display)",
  },
  endedSub: {
    fontSize: 15,
    color: "var(--text-muted)",
    marginTop: 10,
  },
  endedButton: {
    marginTop: 28,
    padding: "13px 30px",
    fontSize: 15,
    fontWeight: 600,
    borderRadius: 999,
    border: "none",
    background: "var(--accent)",
    color: "var(--accent-ink)",
    cursor: "pointer",
  },
  endMeetingBtn: {
    position: "fixed",
    bottom: 84,
    right: 20,
    padding: "10px 24px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 999,
    border: "none",
    background: "var(--danger)",
    color: "#fff",
    cursor: "pointer",
    zIndex: 100,
    boxShadow: "0 8px 24px color-mix(in srgb, var(--danger) 35%, transparent)",
  },
  chatToast: {
    position: "absolute",
    bottom: 16,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 10,
    maxWidth: 420,
    padding: "10px 16px",
    borderRadius: 999,
    background: "color-mix(in srgb, var(--bg-card) 80%, transparent)",
    WebkitBackdropFilter: "blur(16px) saturate(160%)",
    backdropFilter: "blur(16px) saturate(160%)",
    border: "1px solid var(--border)",
    boxShadow: "var(--elev-raised)",
    cursor: "pointer",
    zIndex: 80,
    animation: "toastIn 0.25s ease",
  },
  chatToastSender: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--accent)",
    flexShrink: 0,
  },
  chatToastText: {
    fontSize: 13,
    color: "var(--text)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
};
