/**
 * @file ControlBar — the bottom toolbar with all meeting controls.
 *
 * Renders buttons for: mute, camera, screen share, hand raise, recording,
 * layout toggle, chat, participants, invite, settings, AI companion,
 * reactions, polls, and leave meeting.
 *
 * Each button shows active state (highlighted background) when its feature is on.
 * The leave button is visually separated and styled red.
 *
 * Connects to: RoomPage (provides all state and handler callbacks),
 *              lucide-react icons (button icons)
 */

import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MessageSquare,
  Users,
  PhoneOff,
  Settings,
  Hand,
  UserPlus,
  LayoutGrid,
  LayoutPanelTop,
  Circle,
  Pause,
  Play,
  Lock,
  LockOpen,
  MoreHorizontal,
  Smile,
  BarChart3,
  Radio,
  Keyboard,
  Sun,
  Moon,
} from "lucide-react";
import { useState } from "react";
import type { LayoutMode } from "@meet-app/shared";
import { formatHotkey } from "../hooks/usePushToTalk";

interface ControlBarProps {
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  /** Whether the local microphone is picking up sound (speaking ring). */
  isSpeaking?: boolean;
  showChat: boolean;
  showParticipants: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onToggleParticipants: () => void;
  onLeave: () => void;
  onToggleSettings: () => void;
  onToggleHandRaise: () => void;
  onToggleInvite: () => void;
  onToggleLayout: () => void;
  onToggleRecord: () => void;
  onStopRecord: () => void;
  isHandRaised: boolean;
  isRecording: boolean;
  /** Whether the recording is paused (controls the record button icon). */
  isRecordingPaused: boolean;
  /** Whether the local user is the host (lock button is host-only). */
  isHost: boolean;
  /** Whether the room is currently locked (new joiners go to waiting room). */
  isLocked: boolean;
  onToggleLock: () => void;
  /** Whether the app is currently in dark mode. */
  isDark: boolean;
  onToggleDark: () => void;
  layout: LayoutMode;
  onToggleReactions: () => void;
  onTogglePolls: () => void;
  showReactions: boolean;
  showPolls: boolean;
  /** Number of unread chat messages (badge on the chat button). */
  unreadChat: number;
  /** Whether push-to-talk mode is active (mic muted unless hotkey held). */
  isPushToTalk: boolean;
  onTogglePushToTalk: () => void;
  /** Start/stop talking via the hold-to-talk button (mouse hold). */
  onPushToTalkStart: () => void;
  onPushToTalkStop: () => void;
  /** The configured push-to-talk hotkey (raw key value, " " for Space). */
  pushToTalkHotkey: string;
  onPushToTalkHotkeyChange: (key: string) => void;
}

/**
 * Bottom control bar with all meeting action buttons.
 * Core controls stay visible; Reactions and Polls are grouped under a
 * "More" menu to keep the bar concise.
 */
export function ControlBar({
  isMuted,
  isVideoOff,
  isScreenSharing,
  isSpeaking = false,
  showChat,
  showParticipants,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onToggleChat,
  onToggleParticipants,
  onLeave,
  onToggleSettings,
  onToggleHandRaise,
  onToggleInvite,
  onToggleLayout,
  isRecording,
  isRecordingPaused,
  onToggleRecord,
  onStopRecord,
  isHandRaised,
  isHost,
  isLocked,
  onToggleLock,
  isDark,
  onToggleDark,
  layout,
  onToggleReactions,
  onTogglePolls,
  showReactions,
  showPolls,
  unreadChat,
  isPushToTalk,
  onTogglePushToTalk,
  onPushToTalkStart,
  onPushToTalkStop,
  pushToTalkHotkey,
  onPushToTalkHotkeyChange,
}: ControlBarProps) {
  const [showMore, setShowMore] = useState(false);

  return (
    <div className="ctl-bar" style={styles.bar}>
      <div style={styles.leftSpacer} />
      <div style={styles.controls}>
        {/* ── Media controls ──────────────────────────────────────── */}
        <div style={styles.group}>
          <button
            style={{
              ...styles.controlButton,
              background: isPushToTalk
                ? isMuted
                  ? "var(--danger)"
                  : "var(--accent)"
                : isMuted
                  ? "var(--danger)"
                  : "var(--bg-soft)",
              color: isPushToTalk && !isMuted ? "var(--accent-ink)" : "var(--text)",
              boxShadow: isSpeaking && !isMuted ? "0 0 0 3px var(--accent)" : undefined,
            }}
            onClick={isPushToTalk ? undefined : onToggleMute}
            onPointerDown={
              isPushToTalk
                ? (e) => {
                    e.preventDefault();
                    onPushToTalkStart();
                  }
                : undefined
            }
            onPointerUp={isPushToTalk ? onPushToTalkStop : undefined}
            onPointerLeave={isPushToTalk ? onPushToTalkStop : undefined}
            onPointerCancel={isPushToTalk ? onPushToTalkStop : undefined}
            title={
              isPushToTalk
                ? `Push to talk — hold to talk (${formatHotkey(pushToTalkHotkey)})`
                : isMuted
                  ? "Unmute"
                  : "Mute"
            }
          >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            style={{
              ...styles.controlButton,
              background: isVideoOff ? "var(--danger)" : "var(--bg-soft)",
            }}
            onClick={onToggleVideo}
            title={isVideoOff ? "Turn on camera" : "Turn off camera"}
          >
            {isVideoOff ? <VideoOff size={18} /> : <Video size={18} />}
          </button>
          <button
            style={{
              ...styles.controlButton,
              background: isScreenSharing ? "var(--accent)" : "var(--bg-soft)",
              color: isScreenSharing ? "var(--accent-ink)" : "var(--text)",
            }}
            onClick={onToggleScreenShare}
            title={isScreenSharing ? "Stop sharing" : "Share screen"}
          >
            <Monitor size={18} />
          </button>
          <button
            style={{
              ...styles.controlButton,
              background: isPushToTalk ? "var(--accent)" : "var(--bg-soft)",
              color: isPushToTalk ? "var(--accent-ink)" : "var(--text)",
            }}
            onClick={onTogglePushToTalk}
            title={
              isPushToTalk
                ? `Disable push to talk (${formatHotkey(pushToTalkHotkey)})`
                : "Enable push to talk"
            }
          >
            <Radio size={18} />
          </button>
        </div>

        <div style={styles.groupDivider} />

        {/* ── Engage controls ─────────────────────────────────────── */}
        <div style={styles.group}>
          <button
            style={{
              ...styles.controlButton,
              background: isHandRaised ? "var(--accent)" : "var(--bg-soft)",
              color: isHandRaised ? "var(--accent-ink)" : "var(--text)",
            }}
            onClick={onToggleHandRaise}
            title={isHandRaised ? "Lower hand" : "Raise hand"}
          >
            <Hand size={18} />
          </button>
          <button
            style={{
              ...styles.controlButton,
              background: isRecording ? (isRecordingPaused ? "var(--accent)" : "var(--danger)") : "var(--bg-soft)",
              color: isRecordingPaused ? "var(--accent-ink)" : "var(--text)",
            }}
            onClick={onToggleRecord}
            title={
              !isRecording
                ? "Start recording"
                : isRecordingPaused
                  ? "Resume recording"
                  : "Pause recording"
            }
          >
            {!isRecording ? <Circle size={18} /> : isRecordingPaused ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button
            style={{
              ...styles.controlButton,
              background: "var(--bg-soft)",
            }}
            onClick={onToggleLayout}
            title={layout === "grid" ? "Switch to speaker view" : "Switch to grid view"}
          >
            {layout === "grid" ? <LayoutPanelTop size={18} /> : <LayoutGrid size={18} />}
          </button>
          {isHost && (
            <button
              style={{
                ...styles.controlButton,
                background: isLocked ? "var(--accent)" : "var(--bg-soft)",
                color: isLocked ? "var(--accent-ink)" : "var(--text)",
              }}
              onClick={onToggleLock}
              title={isLocked ? "Unlock room" : "Lock room"}
            >
              {isLocked ? <Lock size={18} /> : <LockOpen size={18} />}
            </button>
          )}
        </div>

        <div style={styles.groupDivider} />
        {/* ── Panel controls ──────────────────────────────────────── */}
        <div style={styles.group}>
          <button
            style={{
              ...styles.controlButton,
              background: showChat ? "var(--accent)" : "var(--bg-soft)",
              color: showChat ? "var(--accent-ink)" : "var(--text)",
            }}
            onClick={onToggleChat}
            title="Chat"
          >
            <MessageSquare size={18} />
            {unreadChat > 0 && <span style={styles.chatBadge}>{unreadChat}</span>}
          </button>
          <button
            style={{
              ...styles.controlButton,
              background: showParticipants ? "var(--accent)" : "var(--bg-soft)",
              color: showParticipants ? "var(--accent-ink)" : "var(--text)",
            }}
            onClick={onToggleParticipants}
            title="Participants"
          >
            <Users size={18} />
          </button>
          <button
            style={{
              ...styles.controlButton,
              background: "var(--bg-soft)",
            }}
            onClick={onToggleInvite}
            title="Invite"
          >
            <UserPlus size={18} />
          </button>
        </div>

        <div style={styles.groupDivider} />
        {/* ── More menu (Reactions, Polls) ────────────────────────── */}
        <div style={styles.moreWrap}>
          <button
            style={{ ...styles.controlButton, background: "var(--bg-soft)" }}
            onClick={() => setShowMore((v) => !v)}
            title="More"
          >
            <MoreHorizontal size={18} />
          </button>
          {showMore && (
            <div style={styles.moreMenu}>
              {isRecording && (
                <button
                  className="ctl-more-item"
                  style={styles.moreItem}
                  onClick={() => { onStopRecord(); setShowMore(false); }}
                >
                  <Circle size={16} /> Stop &amp; Download
                </button>
              )}
              <div style={styles.moreDivider} />
              <button
                className="ctl-more-item"
                style={styles.moreItem}
                onClick={() => { onToggleDark(); setShowMore(false); }}
              >
                {isDark ? <Sun size={16} /> : <Moon size={16} />} {isDark ? "Light mode" : "Dark mode"}
              </button>
              <button
                className="ctl-more-item"
                style={styles.moreItem}
                onClick={() => { onToggleSettings(); setShowMore(false); }}
              >
                <Settings size={16} /> Settings
              </button>
              <div className="ctl-more-item" style={styles.moreItem}>
                <Keyboard size={16} /> Push-to-talk key
                <input
                  style={styles.hotkeyInput}
                  value={formatHotkey(pushToTalkHotkey)}
                  readOnly
                  onKeyDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onPushToTalkHotkeyChange(e.key);
                  }}
                  title="Click, then press the key you want to hold to talk"
                />
              </div>
              <div style={styles.moreDivider} />
              <button
                className="ctl-more-item"
                style={styles.moreItem}
                onClick={() => { onToggleReactions(); setShowMore(false); }}
              >
                <Smile size={16} /> {showReactions ? "Hide Reactions" : "Reactions"}
              </button>
              <button
                className="ctl-more-item"
                style={styles.moreItem}
                onClick={() => { onTogglePolls(); setShowMore(false); }}
              >
                <BarChart3 size={16} /> {showPolls ? "Hide Polls" : "Polls"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Leave meeting (right, red) ────────────────────────────── */}
      <div style={styles.rightSpacer}>
        <button
          style={{ ...styles.controlButton, ...styles.leaveButton }}
          onClick={onLeave}
          title="Leave"
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 24px",
    borderTop: "1px solid var(--border)",
    background: "color-mix(in srgb, var(--bg-card) 82%, transparent)",
    backdropFilter: "blur(14px)",
  },
  leftSpacer: {
    flex: 1,
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 10px",
    borderRadius: "var(--radius-pill)",
    background: "var(--bg-raised)",
    border: "1px solid var(--border)",
    boxShadow: "var(--elev-floating)",
  },
  group: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  groupDivider: {
    width: 1,
    height: 24,
    background: "var(--border)",
    margin: "0 6px",
    flexShrink: 0,
  },
  rightSpacer: {
    flex: 1,
    display: "flex",
    justifyContent: "flex-end",
  },
  controlButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 42,
    height: 42,
    borderRadius: "50%",
    border: "none",
    color: "var(--text)",
    cursor: "pointer",
    position: "relative",
    transition:
      "background var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard), transform var(--motion-fast) var(--ease-standard)",
  },
  chatBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    padding: "0 5px",
    borderRadius: 999,
    background: "var(--danger)",
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
    boxShadow: "0 2px 8px rgba(234,67,53,0.4)",
  },
  moreWrap: {
    position: "relative",
    display: "flex",
  },
  moreMenu: {
    position: "absolute",
    bottom: 50,
    right: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: 6,
    borderRadius: "var(--radius-2xl)",
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    boxShadow: "var(--elev-floating)",
    zIndex: 30,
    minWidth: 170,
  },
  moreItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: "var(--text)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "left",
    whiteSpace: "nowrap",
  },
  moreDivider: {
    height: 1,
    background: "var(--border)",
    margin: "4px 0",
  },
  hotkeyInput: {
    marginLeft: "auto",
    width: 52,
    padding: "4px 6px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text)",
    fontSize: 12,
    fontWeight: 600,
    textAlign: "center",
    cursor: "pointer",
    outline: "none",
  },
  leaveButton: {
    background: "var(--danger)",
    color: "#fff",
    boxShadow: "var(--elev-floating), 0 4px 16px rgba(234,67,53,0.3)",
  },
};
