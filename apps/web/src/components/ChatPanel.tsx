/**
 * @file ChatPanel — in-room text chat interface.
 *
 * Displays chat messages with sender name, timestamp, and message text.
 * Supports sending messages via text input (Enter key or Send button).
 * Auto-scrolls to the latest message when new messages arrive.
 *
 * Connects to: RoomPage (provides messages and onSend callback),
 *              chatHandler (server stores and broadcasts messages)
 */

import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "@meet-app/shared";
import { Send } from "lucide-react";
import "../styles/ChatPanel.css";

interface ChatPanelProps {
  /** Array of chat messages to display. */
  messages: ChatMessage[];
  /** Callback to send a new message (emits CHAT_MESSAGE to server). */
  onSend: (text: string) => void;
  /** The local user's ID (to style own messages differently). */
  currentUserId?: string | null;
}

/**
 * Chat panel with message list and input field.
 * Auto-scrolls to the latest message.
 */
export function ChatPanel({ messages, onSend, currentUserId }: ChatPanelProps) {
  const [text, setText] = useState("");
  /** Ref to the bottom sentinel element for auto-scrolling. */
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message when messages change
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** Send the message if input is non-empty, then clear the input. */
  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  /** Send on Enter key (Shift+Enter for newline, but this is single-line). */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h3 style={styles.heading}>Chat</h3>
        <span style={styles.count}>{messages.length}</span>
      </header>

      {/* Message list */}
      <div style={styles.messages}>
        {messages.map((msg) => {
          const mine = msg.senderId === currentUserId;
          const initials = msg.senderName
            .split(" ")
            .map((w) => w[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
          return (
            <div
              key={msg.id}
              style={{
                ...styles.message,
                alignSelf: mine ? "flex-end" : "flex-start",
                background: mine ? "var(--accent)" : "var(--bg-soft)",
                color: mine ? "var(--accent-ink)" : "var(--text)",
                borderBottomLeftRadius: mine ? 12 : 2,
                borderBottomRightRadius: mine ? 2 : 12,
              }}
            >
              <div style={styles.messageHeader}>
                {!mine && <span style={styles.avatar}>{initials}</span>}
                <span style={{ ...styles.sender, color: mine ? "var(--accent-ink)" : "var(--accent)" }}>
                  {msg.senderName}
                </span>
                <span style={styles.time}>
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p style={{ ...styles.text, color: mine ? "var(--accent-ink)" : "var(--text)" }}>{msg.text}</p>
            </div>
          );
        })}
        {/* Sentinel element for auto-scroll */}
        <div ref={endRef} />
      </div>

      {/* Input row */}
      <div style={styles.inputRow}>
        <input
          className="chat-input"
          style={styles.input}
          type="text"
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="chat-send"
          style={{
            ...styles.sendButton,
            opacity: text.trim() ? 1 : 0.5,
          }}
          onClick={handleSend}
          disabled={!text.trim()}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "var(--bg-card)",
  },
  heading: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    color: "var(--text)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 16px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
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
  messages: {
    flex: 1,
    overflow: "auto",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  message: {
    alignSelf: "flex-start",
    background: "var(--bg-soft)",
    borderRadius: "var(--radius-2xl)",
    padding: "8px 12px",
    maxWidth: "85%",
    border: "1px solid var(--border)",
  },
  messageHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  avatar: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "var(--accent)",
    color: "var(--accent-ink)",
    fontSize: 9,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sender: {
    fontWeight: 700,
    fontSize: 13,
    color: "var(--accent)",
  },
  time: {
    fontSize: 11,
    color: "var(--text-dim)",
    marginLeft: "auto",
    opacity: 0.7,
  },
  text: {
    margin: "2px 0 0",
    fontSize: 14,
    color: "var(--text)",
    wordBreak: "break-word",
  },
  inputRow: {
    display: "flex",
    gap: 8,
    padding: "10px 16px",
    borderTop: "1px solid var(--border)",
    background: "var(--bg-card)",
  },
  input: {
    flex: 1,
    padding: "10px 16px",
    fontSize: 14,
    borderRadius: "var(--radius-pill)",
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text)",
    outline: "none",
    transition:
      "border-color var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard)",
  },
  sendButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "none",
    background: "var(--accent)",
    color: "var(--accent-ink)",
    cursor: "pointer",
    flexShrink: 0,
    transition:
      "transform var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard)",
  },
};
