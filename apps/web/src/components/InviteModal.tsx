/**
 * @file InviteModal — share meeting link with participants.
 *
 * Displays a modal with:
 *   - The full invite URL (copyable to clipboard)
 *   - The room code (for manual entry)
 *
 * Uses the Clipboard API for copying, with a fallback for older browsers.
 * The invite URL format is: {origin}/?join={roomCode}
 *
 * Connects to: RoomPage (provides roomCode), App.tsx (reads ?join= param on load)
 */

import { X, ClipboardCopy } from "lucide-react";

interface InviteModalProps {
  /** The 6-character room code. */
  roomCode: string;
  /** Callback to close the modal. */
  onClose: () => void;
}

/**
 * Invite modal with copyable link and room code display.
 */
export function InviteModal({ roomCode, onClose }: InviteModalProps) {
  /** Full invite URL that auto-joins when opened in a browser. */
  const url = `${window.location.origin}/?join=${roomCode}`;

  /**
   * Copy the invite URL to clipboard.
   * Falls back to execCommand('copy') for older browsers that don't
   * support the Clipboard API.
   */
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>Invite Participants</h3>
          <button style={styles.closeBtn} onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <p style={styles.description}>
          Share this link to invite others to the meeting:
        </p>

        {/* Copyable link input */}
        <div style={styles.linkRow}>
          <input
            style={styles.input}
            value={url}
            readOnly
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button style={styles.copyBtn} onClick={handleCopy} title="Copy link">
            <ClipboardCopy size={18} />
          </button>
        </div>

        {/* Room code display (for manual entry) */}
        <div style={styles.codeRow}>
          <span style={styles.codeLabel}>Room Code:</span>
          <span style={styles.codeValue}>{roomCode}</span>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: "var(--bg-secondary)",
    borderRadius: 12,
    padding: 24,
    width: 420,
    maxWidth: "90%",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    margin: 0,
    fontSize: 18,
    color: "var(--text-primary)",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    padding: 4,
  },
  description: {
    fontSize: 14,
    color: "var(--text-secondary)",
    marginBottom: 12,
  },
  linkRow: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    padding: "8px 12px",
    fontSize: 13,
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    outline: "none",
  },
  copyBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    borderRadius: 6,
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    cursor: "pointer",
  },
  codeRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    background: "var(--bg-tertiary)",
    borderRadius: 6,
  },
  codeLabel: {
    fontSize: 13,
    color: "var(--text-secondary)",
  },
  codeValue: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 2,
    color: "var(--text-primary)",
  },
};
