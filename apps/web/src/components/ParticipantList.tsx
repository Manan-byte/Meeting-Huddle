/**
 * @file ParticipantList — displays all room participants with status indicators.
 *
 * Shows each participant's avatar (initials), name, and status badges:
 *   - "(You)" label for the local user
 *   - "Host" label for the room host
 *   - "Muted" badge when microphone is off
 *   - "No Video" badge when camera is off
 *
 * Connects to: RoomPage (provides participants and currentUser),
 *              shared types (User)
 */

import type { User } from "@meet-app/shared";
import { Mic, MicOff, VolumeX } from "lucide-react";
import "../styles/ParticipantList.css";

interface ParticipantListProps {
  /** All participants currently in the room. */
  participants: User[];
  /** The local user (null before joining). */
  currentUser: User | null;
  /** True when the local user is the room host (shows moderation controls). */
  isHost: boolean;
  /** Host action: mute a specific participant. */
  onMuteUser?: (userId: string) => void;
  /** Host action: unmute a specific participant. */
  onUnmuteUser?: (userId: string) => void;
  /** Host action: mute all participants (Discord-style). */
  onMuteAll?: () => void;
}

/**
 * Renders a scrollable list of all room participants.
 * Each participant shows avatar, name, role, and status badges.
 * The host (isHost) gets per-user mute/unmute buttons and a "Mute all"
 * button in the header.
 */
export function ParticipantList({
  participants,
  currentUser,
  isHost,
  onMuteUser,
  onUnmuteUser,
  onMuteAll,
}: ParticipantListProps) {
  const others = participants.filter((p) => !p.isHost);
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h3 style={styles.heading}>
          Participants
          <span style={styles.count}>{participants.length}</span>
        </h3>
        {isHost && others.length > 0 && (
          <button
            className="pl-muteall"
            style={styles.muteAllBtn}
            onClick={onMuteAll}
            title="Mute all participants"
          >
            <VolumeX size={14} /> Mute all
          </button>
        )}
      </header>
      <ul style={styles.list}>
        {participants.map((p, i) => (
          <ParticipantRow
            key={p.id}
            participant={p}
            isYou={p.id === currentUser?.id}
            hasDivider={i < participants.length - 1}
            showModeration={isHost && !p.isHost && p.id !== currentUser?.id}
            onMuteUser={onMuteUser}
            onUnmuteUser={onUnmuteUser}
          />
        ))}
      </ul>
    </div>
  );
}

/** A single participant row with hover state and status indicators. */
function ParticipantRow({
  participant,
  isYou,
  hasDivider,
  showModeration,
  onMuteUser,
  onUnmuteUser,
}: {
  participant: User;
  isYou: boolean;
  hasDivider: boolean;
  showModeration?: boolean;
  onMuteUser?: (userId: string) => void;
  onUnmuteUser?: (userId: string) => void;
}) {
  return (
    <li
      className="pl-row"
      style={{
        ...styles.item,
        ...(hasDivider ? styles.itemDivider : null),
      }}
    >
      {/* Avatar: first two initials */}
      <div style={{ ...styles.avatar, ...(isYou ? styles.avatarYou : null) }}>
        {participant.name
          .split(" ")
          .map((w) => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)}
      </div>
      <div style={styles.info}>
        <div style={styles.nameRow}>
          <span style={styles.name}>{participant.name}</span>
          {isYou && <span style={styles.youBadge}>You</span>}
        </div>
        {participant.isHost && (
          <div style={styles.subline}>
            <CrownIcon />
            <span>Host</span>
          </div>
        )}
      </div>
      <div style={styles.indicators}>
        {participant.isMuted && (
          <span style={styles.mutedBadge} title="Muted">
            <MicOffIcon />
          </span>
        )}
        {participant.isVideoOff && (
          <span style={styles.noVideoBadge} title="Video off">
            <CamOffIcon />
          </span>
        )}
        {showModeration && (
          <button
            className="pl-mutebtn"
            style={{ ...styles.muteBtn, ...(participant.isMuted ? styles.muteBtnActive : null) }}
            onClick={() =>
              participant.isMuted
                ? onUnmuteUser?.(participant.id)
                : onMuteUser?.(participant.id)
            }
            title={participant.isMuted ? "Unmute participant" : "Mute participant"}
          >
            {participant.isMuted ? <Mic size={13} /> : <MicOff size={13} />}
          </button>
        )}
      </div>
    </li>
  );
}

const MicOffIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-11 4.8" />
    <line x1="4" y1="4" x2="20" y2="20" />
  </svg>
);

const CamOffIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M23 7l-7 5 7 5V7z" />
    <rect x="1" y="5" width="15" height="14" rx="2" />
    <line x1="3" y1="3" x2="21" y2="21" />
  </svg>
);

const CrownIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3.4 8.2l4.2 3.1L12 5.2l4.4 6.1 4.2-3.1-1.3 8.3H4.7z" />
  </svg>
);

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "var(--bg-card)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 16px",
    borderBottom: "1px solid var(--border)",
  },
  heading: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    color: "var(--text)",
  },
  count: {
    marginLeft: "auto",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-dim)",
    background: "var(--bg-soft)",
    padding: "2px 8px",
    borderRadius: 999,
  },
  muteAllBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text)",
    cursor: "pointer",
  },
  muteBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
    borderRadius: "50%",
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text-dim)",
    cursor: "pointer",
    opacity: 0,
    transition: "opacity var(--motion-fast) var(--ease-standard)",
  },
  muteBtnActive: {
    opacity: 1,
    background: "color-mix(in srgb, var(--danger) 14%, transparent)",
    borderColor: "color-mix(in srgb, var(--danger) 35%, transparent)",
    color: "var(--danger)",
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: "6px 0",
    overflow: "auto",
    flex: 1,
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 16px",
    transition:
      "background var(--motion-fast) var(--ease-standard)",
  },
  itemDivider: {
    borderBottom: "1px solid var(--border)",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background:
      "radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--accent) 22%, transparent) 0%, transparent 60%), var(--bg-soft)",
    color: "var(--text-muted)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
    border: "1px solid var(--border)",
    boxShadow: "0 1px 2px rgba(8,11,18,0.06)",
  },
  avatarYou: {
    borderColor: "var(--accent)",
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    fontWeight: 500,
    color: "var(--text)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  youBadge: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.02em",
    color: "var(--accent-ink)",
    background: "var(--accent)",
    padding: "2px 8px",
    borderRadius: 999,
    flexShrink: 0,
  },
  subline: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
    fontSize: 11,
    fontWeight: 600,
    color: "var(--accent)",
  },
  indicators: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  mutedBadge: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: "color-mix(in srgb, var(--danger) 18%, transparent)",
    color: "var(--danger)",
  },
  noVideoBadge: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: "rgba(245,158,11,0.15)",
    color: "#f59e0b",
  },
};
