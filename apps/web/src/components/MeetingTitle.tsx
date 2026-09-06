/**
 * @file MeetingTitle — editable meeting title (host only).
 *
 * Host can click the title to edit it inline. Press Enter to save,
 * Escape to cancel, or click away (onBlur) to save.
 * Non-host participants see the title as read-only text.
 *
 * Connects to: RoomPage (provides title, isHost, handleRenameTitle),
 *              roomHandlers (server broadcasts MEETING_TITLE_UPDATED)
 */

import { useState, useRef, useEffect } from "react";

interface MeetingTitleProps {
  /** Current meeting title. */
  title: string;
  /** Whether the current user is the host (controls edit permission). */
  isHost: boolean;
  /** Callback to save the new title (emits SET_MEETING_TITLE to server). */
  onRename: (title: string) => void;
}

/**
 * Meeting title with inline editing for the host.
 * Non-hosts see read-only text.
 */
export function MeetingTitle({ title, isHost, onRename }: MeetingTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus and select text when entering edit mode
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  // Sync draft with external title changes (from server broadcast)
  useEffect(() => {
    setDraft(title);
  }, [title]);

  /** Save the draft title (trim whitespace, skip if unchanged). */
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title) {
      onRename(trimmed);
    } else {
      setDraft(title); // Revert to original if empty or unchanged
    }
    setEditing(false);
  };

  // Non-host: read-only display
  if (!isHost) {
    return <span style={styles.title}>{title || "Untitled Meeting"}</span>;
  }

  // Host in edit mode: inline input
  if (editing) {
    return (
      <input
        ref={inputRef}
        style={styles.input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(title);
            setEditing(false);
          }
        }}
        maxLength={80}
      />
    );
  }

  // Host: clickable title that enters edit mode on click
  return (
    <span
      style={{ ...styles.title, ...styles.editable }}
      onClick={() => setEditing(true)}
      title="Click to rename"
    >
      {title || "Untitled Meeting"}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: {
    fontSize: 18,
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  editable: {
    cursor: "pointer",
    padding: "2px 6px",
    borderRadius: 4,
    transition: "background 0.15s",
  },
  input: {
    fontSize: 18,
    fontWeight: 600,
    color: "var(--text-primary)",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--accent)",
    borderRadius: 4,
    padding: "2px 6px",
    outline: "none",
    minWidth: 120,
  },
};
