/**
 * @file ControlBar — Google Meet-style bottom control bar for the Huddle room.
 *
 * Layout (matches Meet):
 *   [⋯ More] [🎤 Mic] [▾+📷 Camera] [🖥 Screen share] [😊 Reactions]
 *   [CC Captions] [🙋 Raise hand] [⋮ More options]        [🔴 Leave]
 *
 * A vertical rail on the right edge holds Chat + People (participants).
 * The "More" menu (image-matched) contains: recording status/controls,
 * Adjust view, Full screen, Picture-in-picture, Backgrounds and effects,
 * Report a problem, Report abuse, Troubleshooting & help, Settings.
 *
 * The room chrome is intentionally dark (like Meet) regardless of the app
 * light/dark theme, so the meeting view always looks familiar.
 */

import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MessageSquare,
  Users,
  PhoneOff,
  Hand,
  Smile,
  Captions,
  MoreVertical,
  ChevronUp,
  Circle,
  Pause,
  Play,
  Square,
  LayoutGrid,
  Fullscreen,
  PictureInPicture2,
  Sparkles,
  Flag,
  ShieldAlert,
  HelpCircle,
  Settings,
  UserPlus,
  BarChart3,
  Sun,
  Moon,
  Lock,
  LockOpen,
  VolumeX,
} from "lucide-react";
import { formatHotkey } from "../hooks/usePushToTalk";

/** Google Meet dark chrome palette (independent of the app theme). */
const MEET = {
  panel: "#202124",
  panelBorder: "rgba(255,255,255,0.12)",
  btn: "rgba(255,255,255,0.10)",
  btnHover: "rgba(255,255,255,0.18)",
  btnActiveBg: "#8ab4f8",
  btnActiveInk: "#0b0e14",
  icon: "#ffffff",
  text: "#ffffff",
  textDim: "rgba(255,255,255,0.72)",
  danger: "#ea4335",
  dangerInk: "#ffffff",
  camOffBg: "#f28b82",
  camOffInk: "#000000",
};

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
  /** Adjust view modal (layout picker). */
  onToggleLayout: () => void;
  onToggleFullscreen: () => void;
  onTogglePiP: () => void;
  /** Open the Settings modal on the Video tab (backgrounds & effects). */
  onOpenBackgrounds: () => void;
  /** Open the Settings modal on the Video tab (camera/background). */
  onOpenCameraOptions: () => void;
  onReport: (type: "problem" | "abuse") => void;
  onHelp: () => void;
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
  /** Whether live captions are active for the room. */
  isCaptionsEnabled: boolean;
  onToggleCaptions: () => void;
  onToggleReactions: () => void;
  onTogglePolls: () => void;
  showReactions: boolean;
  showPolls: boolean;
  /** Number of unread chat messages (badge on the Chat rail button). */
  unreadChat: number;
  /** Whether push-to-talk mode is active (mic muted unless hotkey held). */
  isPushToTalk: boolean;
  onPushToTalkStart: () => void;
  onPushToTalkStop: () => void;
  pushToTalkHotkey: string;
  /** Host action: mute all participants (More menu). */
  onMuteAll: () => void;
}

/**
 * Bottom control bar with all meeting action buttons (Meet layout).
 * Reactions, captions and raise-hand are direct buttons; recording,
 * view options, fullscreen, PiP and support items live in the More menu.
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
  onToggleFullscreen,
  onTogglePiP,
  onOpenBackgrounds,
  onOpenCameraOptions,
  onReport,
  onHelp,
  onToggleRecord,
  onStopRecord,
  isHandRaised,
  isRecording,
  isRecordingPaused,
  isHost,
  isLocked,
  onToggleLock,
  isDark,
  onToggleDark,
  isCaptionsEnabled,
  onToggleCaptions,
  onToggleReactions,
  onTogglePolls,
  showReactions,
  showPolls,
  unreadChat,
  isPushToTalk,
  onPushToTalkStart,
  onPushToTalkStop,
  pushToTalkHotkey,
  onMuteAll,
}: ControlBarProps) {
  const [showMore, setShowMore] = useState(false);

  // Close the More menu when clicking anywhere outside it.
  useEffect(() => {
    if (!showMore) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".ctl-more-anchor") || target.closest(".ctl-more-menu")) return;
      setShowMore(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showMore]);

  const micToggled = isPushToTalk ? false : isMuted;

  return (
    <>
      {/* ── Right vertical rail: Chat + People (Meet side rail) ────── */}
      <div className="ctl-rail" style={styles.rail}>
        <button
          style={{ ...styles.railBtn, ...(showChat ? styles.railBtnActive : null) }}
          onClick={onToggleChat}
          title="Chat"
        >
          <MessageSquare size={20} />
          {unreadChat > 0 && <span style={styles.railBadge}>{unreadChat}</span>}
        </button>
        <button
          style={{ ...styles.railBtn, ...(showParticipants ? styles.railBtnActive : null) }}
          onClick={onToggleParticipants}
          title="People"
        >
          <Users size={20} />
        </button>
      </div>

      {/* ── Bottom control bar ────────────────────────────────────── */}
      <div className="ctl-bar" style={styles.bar}>
        <div className="ctl-controls" style={styles.controls}>
          {/* Mic — plain toggle (audio settings live in Settings > Audio) */}
          <button
            className="ctl-btn"
            style={{
              ...styles.btn,
              background: micToggled ? MEET.danger : MEET.btn,
              color: micToggled ? MEET.dangerInk : MEET.icon,
              boxShadow: isSpeaking && !micToggled ? `0 0 0 3px ${MEET.btnActiveBg}` : undefined,
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
                : micToggled
                  ? "Unmute"
                  : "Mute"
            }
          >
            {micToggled ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          {/* Camera composite: toggle + integrated chevron tab (Meet style) */}
          <div
            style={{
              ...styles.camWrap,
              background: isVideoOff ? MEET.camOffBg : MEET.btn,
              color: isVideoOff ? MEET.camOffInk : MEET.icon,
            }}
          >
            <button
              className="ctl-btn ctl-camopt"
              style={styles.camChevron}
              onClick={onOpenCameraOptions}
              title="Camera options"
            >
              <ChevronUp size={12} />
            </button>
            <button
              className="ctl-btn"
              style={styles.camBtn}
              onClick={onToggleVideo}
              title={isVideoOff ? "Turn on camera" : "Turn off camera"}
            >
              {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
            </button>
          </div>

          {/* Screen share */}
          <button
            className="ctl-btn"
            style={{
              ...styles.btn,
              background: isScreenSharing ? MEET.btnActiveBg : MEET.btn,
              color: isScreenSharing ? MEET.btnActiveInk : MEET.icon,
            }}
            onClick={onToggleScreenShare}
            title={isScreenSharing ? "Stop sharing" : "Share screen"}
          >
            <Monitor size={20} />
          </button>

          <div style={styles.divider} />

          {/* Reactions */}
          <button
            className="ctl-btn"
            style={{
              ...styles.btn,
              background: showReactions ? MEET.btnActiveBg : MEET.btn,
              color: showReactions ? MEET.btnActiveInk : MEET.icon,
            }}
            onClick={onToggleReactions}
            title="Reactions"
          >
            <Smile size={20} />
          </button>

          {/* Captions */}
          <button
            className="ctl-btn"
            style={{
              ...styles.btn,
              background: isCaptionsEnabled ? MEET.btnActiveBg : MEET.btn,
              color: isCaptionsEnabled ? MEET.btnActiveInk : MEET.icon,
            }}
            onClick={onToggleCaptions}
            title="Captions"
          >
            <Captions size={20} />
          </button>

          {/* Raise hand */}
          <button
            className="ctl-btn"
            style={{
              ...styles.btn,
              background: isHandRaised ? MEET.btnActiveBg : MEET.btn,
              color: isHandRaised ? MEET.btnActiveInk : MEET.icon,
            }}
            onClick={onToggleHandRaise}
            title={isHandRaised ? "Lower hand" : "Raise hand"}
          >
            <Hand size={20} />
          </button>

          <div style={styles.divider} />

          {/* More options (right) — same menu */}
          <button
            className="ctl-btn"
            style={styles.btn}
            onClick={() => setShowMore((v) => !v)}
            title="More options"
          >
            <MoreVertical size={20} />
          </button>

          {/* Leave / end call (red, far right) */}
          <button
            className="ctl-btn"
            style={{ ...styles.btn, ...styles.leaveBtn }}
            onClick={onLeave}
            title="Leave"
          >
            <PhoneOff size={20} />
          </button>
        </div>
      </div>

      {/* ── More menu (3-dot) ─────────────────────────────────────── */}
      {showMore && (
        <div className="ctl-more-menu" style={styles.moreMenu}>
          {isHost ? (
            // Host: recording controls live here (Meet keeps them in the menu)
            <div style={styles.recBlock}>
              {isRecording ? (
                <div style={styles.recRow}>
                  <span style={styles.recStatus}>
                    <span style={styles.recDot} />
                    Recording {isRecordingPaused ? "(paused)" : ""}
                  </span>
                  <button
                    className="ctl-more-item"
                    style={styles.moreItemInline}
                    onClick={() => {
                      onToggleRecord();
                      setShowMore(false);
                    }}
                    title={isRecordingPaused ? "Resume recording" : "Pause recording"}
                  >
                    {isRecordingPaused ? <Play size={16} /> : <Pause size={16} />}
                    {isRecordingPaused ? "Resume" : "Pause"}
                  </button>
                  <button
                    className="ctl-more-item"
                    style={styles.moreItemInline}
                    onClick={() => {
                      onStopRecord();
                      setShowMore(false);
                    }}
                    title="Stop recording"
                  >
                    <Square size={16} /> Stop
                  </button>
                </div>
              ) : (
                <button
                  className="ctl-more-item"
                  style={styles.recStart}
                  onClick={() => {
                    onToggleRecord();
                    setShowMore(false);
                  }}
                  title="Start recording"
                >
                  <Circle size={16} /> Start recording
                </button>
              )}
            </div>
          ) : (
            <div style={styles.recBlock}>
              <div style={styles.recUnavailable}>
                <span style={styles.recUnavailableTitle}>Recording unavailable</span>
                <span style={styles.recUnavailableSub}>
                  You're not allowed to record this video call
                </span>
              </div>
            </div>
          )}

          {/* View options */}
          <div style={styles.moreGroup}>
            <MenuRow icon={<LayoutGrid size={18} />} label="Adjust view" onClick={() => { onToggleLayout(); setShowMore(false); }} />
            <MenuRow icon={<Fullscreen size={18} />} label="Full screen" onClick={() => { onToggleFullscreen(); setShowMore(false); }} />
            <MenuRow icon={<PictureInPicture2 size={18} />} label="Open picture-in-picture" onClick={() => { onTogglePiP(); setShowMore(false); }} />
            <MenuRow icon={<Sparkles size={18} />} label="Backgrounds and effects" onClick={() => { onOpenBackgrounds(); setShowMore(false); }} />
          </div>

          <div style={styles.moreDivider} />

          {/* Support / settings group */}
          <div style={styles.moreGroup}>
            <MenuRow icon={<Flag size={18} />} label="Report a problem" onClick={() => { onReport("problem"); setShowMore(false); }} />
            <MenuRow icon={<ShieldAlert size={18} />} label="Report abuse" onClick={() => { onReport("abuse"); setShowMore(false); }} />
            <MenuRow icon={<HelpCircle size={18} />} label="Troubleshooting & help" onClick={() => { onHelp(); setShowMore(false); }} />
            <MenuRow icon={<Settings size={18} />} label="Settings" onClick={() => { onToggleSettings(); setShowMore(false); }} />
          </div>

          <div style={styles.moreDivider} />

          {/* App extras (invite, polls, theme, host moderation) */}
          <div style={styles.moreGroup}>
            {isHost && (
              <MenuRow
                icon={isLocked ? <Lock size={18} /> : <LockOpen size={18} />}
                label={isLocked ? "Unlock room" : "Lock room"}
                onClick={() => { onToggleLock(); setShowMore(false); }}
              />
            )}
            {isHost && (
              <MenuRow icon={<VolumeX size={18} />} label="Mute all participants" onClick={() => { onMuteAll(); setShowMore(false); }} />
            )}
            <MenuRow icon={<UserPlus size={18} />} label="Invite" onClick={() => { onToggleInvite(); setShowMore(false); }} />
            <MenuRow icon={<BarChart3 size={18} />} label={showPolls ? "Hide Polls" : "Polls"} onClick={() => { onTogglePolls(); setShowMore(false); }} />
            <MenuRow
              icon={isDark ? <Sun size={18} /> : <Moon size={18} />}
              label={isDark ? "Light mode" : "Dark mode"}
              onClick={() => { onToggleDark(); setShowMore(false); }}
            />
          </div>
        </div>
      )}
    </>
  );
}

/** A single icon + label menu row. */
function MenuRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="ctl-more-item" style={styles.moreItem} onClick={onClick}>
      <span style={styles.moreItemIcon}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  /* ── Right vertical rail ── */
  rail: {
    position: "fixed",
    right: 16,
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    zIndex: 60,
  },
  railBtn: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: MEET.btn,
    color: MEET.icon,
    border: "none",
    position: "relative",
    WebkitBackdropFilter: "blur(12px)",
    backdropFilter: "blur(12px)",
  },
  railBtnActive: {
    background: MEET.btnActiveBg,
    color: MEET.btnActiveInk,
  },
  railBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    background: MEET.danger,
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 4px",
  },

  /* ── Bottom bar ── */
  bar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "18px 24px 24px",
    background:
      "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)",
    flexShrink: 0,
    zIndex: 50,
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  btn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 46,
    height: 46,
    borderRadius: "50%",
    border: "none",
    background: MEET.btn,
    color: MEET.icon,
    cursor: "pointer",
    WebkitBackdropFilter: "blur(12px)",
    backdropFilter: "blur(12px)",
  },
  camWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 46,
    height: 46,
    borderRadius: "50%",
    WebkitBackdropFilter: "blur(12px)",
    backdropFilter: "blur(12px)",
  },
  camChevron: {
    position: "absolute",
    top: -6,
    left: "50%",
    transform: "translateX(-50%)",
    width: 26,
    height: 15,
    borderRadius: "8px 8px 3px 3px",
    border: `1px solid ${MEET.panelBorder}`,
    background: "#3c4043",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    cursor: "pointer",
    zIndex: 3,
  },
  camBtn: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
  },
  divider: {
    width: 1,
    height: 26,
    background: MEET.panelBorder,
    margin: "0 2px",
    flexShrink: 0,
  },
  leaveBtn: {
    background: MEET.danger,
    color: MEET.dangerInk,
    marginLeft: 4,
  },

  /* ── More menu ── */
  moreMenu: {
    position: "fixed",
    left: "50%",
    transform: "translateX(-50%)",
    bottom: 96,
    width: 340,
    maxHeight: "70vh",
    overflowY: "auto",
    background: MEET.panel,
    border: `1px solid ${MEET.panelBorder}`,
    borderRadius: 16,
    padding: "8px 0",
    color: MEET.text,
    boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
    zIndex: 90,
  },
  recBlock: {
    padding: "10px 16px",
    borderBottom: `1px solid ${MEET.panelBorder}`,
    marginBottom: 6,
  },
  recStart: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 10px",
    borderRadius: 10,
    background: "transparent",
    border: "none",
    color: MEET.text,
    fontSize: 14,
    fontWeight: 500,
    textAlign: "left",
  },
  recRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  recStatus: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
    color: MEET.text,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: MEET.danger,
    animation: "pulse 1.4s ease-in-out infinite",
  },
  moreItemInline: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 10px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.08)",
    border: "none",
    color: MEET.text,
    fontSize: 13,
    fontWeight: 500,
  },
  recUnavailable: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  recUnavailableTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: MEET.text,
  },
  recUnavailableSub: {
    fontSize: 12,
    color: MEET.textDim,
  },
  moreGroup: {
    display: "flex",
    flexDirection: "column",
    padding: "2px 0",
  },
  moreDivider: {
    height: 1,
    background: MEET.panelBorder,
    margin: "4px 12px",
  },
  moreItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "11px 16px",
    background: "transparent",
    border: "none",
    color: MEET.text,
    fontSize: 14,
    fontWeight: 400,
    textAlign: "left",
    cursor: "pointer",
  },
  moreItemIcon: {
    display: "flex",
    alignItems: "center",
    color: "rgba(255,255,255,0.85)",
  },
};