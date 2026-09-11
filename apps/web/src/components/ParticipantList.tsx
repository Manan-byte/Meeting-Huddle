/**
 * @file ParticipantList — Google Meet-style "People" side panel.
 *
 * Shows everyone in the call:
 *   - Summary (image 9): "N joined" + name preview + avatar thumbnail row.
 *   - Full list (image 10): search box, "IN THE MEETING" section,
 *     "Contributors (N)" with collapse, per-row avatar / name / "(You)" /
 *     "Meeting host" subtitle / mute button / per-user More (⋯) menu.
 *
 * Host controls: mute/unmute any participant (matching image 10), mute all,
 * per-user More menu. Self row: mic + camera toggles from its More menu.
 *
 * Connects to: RoomPage (participants, currentUser, moderation handlers)
 */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { User } from "@meet-app/shared";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Search,
  ChevronDown,
  MoreVertical,
  VolumeX,
  X,
  Volume2,
} from "lucide-react";
import "../styles/ParticipantList.css";

interface ParticipantListProps {
  /** All participants currently in the room. */
  participants: User[];
  /** The local user (null before joining). */
  currentUser: User | null;
  /** True when the local user is the room host. */
  isHost: boolean;
  /** Host action: mute a specific participant. */
  onMuteUser?: (userId: string) => void;
  /** Host action: unmute a specific participant. */
  onUnmuteUser?: (userId: string) => void;
  /** Host action: mute all participants. */
  onMuteAll?: () => void;
  /** Close the panel (X). */
  onClose: () => void;
  /** Toggle the local microphone (self row / self menu). */
  onToggleSelfMic?: () => void;
  /** Toggle the local camera (self menu). */
  onToggleSelfCamera?: () => void;
}

/** Deterministic avatar color per participant id. */
const AVATAR_COLORS = [
  "#e8710a",
  "#188038",
  "#1a73e8",
  "#d93025",
  "#9334e6",
  "#c5221f",
  "#007b83",
  "#f29900",
];

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/**
 * Renders the People panel: summary + searchable contributor list.
 */
export function ParticipantList({
  participants,
  currentUser,
  isHost,
  onMuteUser,
  onUnmuteUser,
  onMuteAll,
  onClose,
  onToggleSelfMic,
  onToggleSelfCamera,
}: ParticipantListProps) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter((p) => p.name.toLowerCase().includes(q));
  }, [participants, query]);

  const othersCount = participants.filter((p) => !p.isHost).length;

  return (
    <div style={styles.container}>
      {/* Header: People + X */}
      <header style={styles.header}>
        <h3 style={styles.title}>People</h3>
        <button style={styles.closeBtn} onClick={onClose} title="Close">
          <X size={20} />
        </button>
      </header>

      {/* Summary (image 9): joined count + avatar thumbnails */}
      {participants.length > 0 && (
        <div style={styles.summary}>
          <span style={styles.summaryNames}>
            {participants.length} joined ·{" "}
            {participants
              .map((p) => p.name)
              .join(", ")
              .slice(0, 64)}
            {participants.map((p) => p.name).join(", ").length > 64 ? "…" : ""}
          </span>
          <div style={styles.thumbs}>
            {participants.slice(0, 8).map((p) => (
              <span key={p.id} style={{ ...styles.thumb, background: colorFor(p.id) }}>
                {initials(p.name)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div style={styles.searchWrap}>
        <Search size={16} style={styles.searchIcon} />
        <input
          style={styles.searchInput}
          placeholder="Search for people"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Section label */}
      <div style={styles.sectionLabel}>IN THE MEETING</div>

      {/* Contributors header + mute all */}
      <div style={styles.contribHeader}>
        <button style={styles.contribTitle} onClick={() => setCollapsed((v) => !v)}>
          <ChevronDown
            size={18}
            style={{
              transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
              transition: "transform 160ms cubic-bezier(0.28,0,0.22,1)",
            }}
          />
          Contributors
          <span style={styles.count}>{participants.length}</span>
        </button>
        {isHost && othersCount > 0 && (
          <button style={styles.muteAllBtn} onClick={onMuteAll} title="Mute all">
            <VolumeX size={14} /> Mute all
          </button>
        )}
      </div>

      {/* Rows */}
      {!collapsed && (
        <ul style={styles.list}>
          {filtered.length === 0 && (
            <li style={styles.empty}>No people found</li>
          )}
          {filtered.map((p) => (
            <ParticipantRow
              key={p.id}
              participant={p}
              isYou={p.id === currentUser?.id}
              isLocalHost={isHost}
              onMuteUser={onMuteUser}
              onUnmuteUser={onUnmuteUser}
              onToggleSelfMic={onToggleSelfMic}
              onToggleSelfCamera={onToggleSelfCamera}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function ParticipantRow({
  participant,
  isYou,
  isLocalHost,
  onMuteUser,
  onUnmuteUser,
  onToggleSelfMic,
  onToggleSelfCamera,
}: {
  participant: User;
  isYou: boolean;
  isLocalHost: boolean;
  onMuteUser?: (userId: string) => void;
  onUnmuteUser?: (userId: string) => void;
  onToggleSelfMic?: () => void;
  onToggleSelfCamera?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  /** Mute button behavior: self toggles own mic; host mutes others. */
  const canModerate = isYou ? !!onToggleSelfMic : isLocalHost;
  const isOwnMuted = isYou ? participant.isMuted : false;

  const handleMuteClick = () => {
    if (isYou) {
      onToggleSelfMic?.();
      return;
    }
    if (!isLocalHost) return;
    if (participant.isMuted) onUnmuteUser?.(participant.id);
    else onMuteUser?.(participant.id);
  };

  return (
    <li style={styles.row} className="pl-row">
      {/* Avatar */}
      <span style={{ ...styles.avatar, background: colorFor(participant.id) }}>
        {initials(participant.name)}
      </span>

      {/* Name + subtitle */}
      <div style={styles.info}>
        <div style={styles.nameRow}>
          <span style={styles.name}>
            {participant.name}
            {isYou && <span style={styles.youTag}> (You)</span>}
          </span>
        </div>
        {participant.isHost && <span style={styles.hostTag}>Meeting host</span>}
        {!participant.isHost && participant.isHandRaised && (
          <span style={styles.handTag}>🙋 Raised hand</span>
        )}
      </div>

      {/* Mute button (image 10) */}
      {canModerate ? (
        <button
          className="mute-btn"
          style={{
            ...styles.muteBtn,
            ...(isOwnMuted ? styles.muteBtnSelfOff : null),
          }}
          onClick={handleMuteClick}
          title={
            isYou
              ? participant.isMuted
                ? "Unmute microphone"
                : "Mute microphone"
              : participant.isMuted
                ? "Unmute participant"
                : "Mute participant"
          }
        >
          {participant.isMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
      ) : (
        <span style={styles.statusIcon} title={participant.isMuted ? "Muted" : "Speaking"}>
          {participant.isMuted ? <MicOff size={15} /> : <Volume2 size={15} />}
        </span>
      )}

      {/* Per-user More menu */}
      <div style={styles.moreWrap}>
        <button className="more-btn" style={styles.moreBtn} onClick={() => setMenuOpen((v) => !v)} title="More options">
          <MoreVertical size={16} />
        </button>
        {menuOpen && (
          <div style={styles.menu}>
            {isYou ? (
              <>
                <button
                  className="menu-item"
                  style={styles.menuItem}
                  onClick={() => {
                    onToggleSelfMic?.();
                    setMenuOpen(false);
                  }}
                >
                  {participant.isMuted ? <Mic size={15} /> : <MicOff size={15} />}
                  {participant.isMuted ? "Unmute microphone" : "Mute microphone"}
                </button>
                <button
                  className="menu-item"
                  style={styles.menuItem}
                  onClick={() => {
                    onToggleSelfCamera?.();
                    setMenuOpen(false);
                  }}
                >
                  {participant.isVideoOff ? <Video size={15} /> : <VideoOff size={15} />}
                  {participant.isVideoOff ? "Turn on camera" : "Turn off camera"}
                </button>
              </>
            ) : isLocalHost ? (
              <>
                <button
                  className="menu-item"
                  style={styles.menuItem}
                  onClick={() => {
                    if (participant.isMuted) onUnmuteUser?.(participant.id);
                    else onMuteUser?.(participant.id);
                    setMenuOpen(false);
                  }}
                >
                  {participant.isMuted ? <Mic size={15} /> : <MicOff size={15} />}
                  {participant.isMuted ? "Unmute" : "Mute"}
                </button>
                {participant.isHandRaised && (
                  <span style={styles.menuNote}>🙋 Hand raised</span>
                )}
              </>
            ) : (
              <span style={styles.menuNote}>No actions available</span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "#202124",
    color: "#ffffff",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px 4px",
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 500,
    color: "#ffffff",
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    color: "#ffffff",
    cursor: "pointer",
  },
  summary: {
    padding: "6px 16px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
  },
  summaryNames: {
    display: "block",
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    marginBottom: 8,
  },
  thumbs: {
    display: "flex",
    gap: 8,
  },
  thumb: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
  },
  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "10px 16px 6px",
    padding: "0 12px",
    height: 40,
    borderRadius: 8,
    background: "#3c4043",
  },
  searchIcon: {
    color: "#9aa0a6",
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#ffffff",
    fontSize: 14,
  },
  sectionLabel: {
    padding: "12px 16px 4px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    color: "#9aa0a6",
  },
  contribHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 8px 4px 12px",
  },
  contribTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "transparent",
    border: "none",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    padding: "6px 4px",
  },
  count: {
    background: "#3c4043",
    borderRadius: 999,
    padding: "1px 8px",
    fontSize: 12,
    color: "#ffffff",
  },
  muteAllBtn: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 999,
    border: "none",
    background: "#3c4043",
    color: "#ffffff",
    cursor: "pointer",
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: "4px 8px 16px",
    overflowY: "auto",
    flex: 1,
  },
  empty: {
    padding: "12px 8px",
    fontSize: 13,
    color: "#9aa0a6",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "6px 8px",
    borderRadius: 8,
    position: "relative",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    flexShrink: 0,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    display: "flex",
    alignItems: "baseline",
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    color: "#ffffff",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  youTag: {
    color: "#9aa0a6",
  },
  hostTag: {
    display: "block",
    fontSize: 12,
    color: "#9aa0a6",
  },
  handTag: {
    display: "block",
    fontSize: 12,
    color: "#fbbc04",
  },
  muteBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "none",
    background: "transparent",
    color: "#8ab4f8",
    cursor: "pointer",
    flexShrink: 0,
  },
  muteBtnSelfOff: {
    color: "#ea4335",
  },
  statusIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    color: "#9aa0a6",
    flexShrink: 0,
  },
  moreWrap: {
    position: "relative",
    flexShrink: 0,
  },
  moreBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "none",
    background: "transparent",
    color: "#ffffff",
    cursor: "pointer",
  },
  menu: {
    position: "absolute",
    right: 0,
    top: 34,
    minWidth: 190,
    background: "#3c4043",
    borderRadius: 10,
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    padding: "6px 0",
    zIndex: 20,
  },
  menuItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "10px 14px",
    background: "transparent",
    border: "none",
    color: "#ffffff",
    fontSize: 13,
    textAlign: "left",
    cursor: "pointer",
  },
  menuNote: {
    display: "block",
    padding: "10px 14px",
    fontSize: 12.5,
    color: "#9aa0a6",
  },
};