/**
 * @file ChatPanel — in-room text chat (Google Meet style, dark chrome).
 *
 * Title + close (X), message list, pill input ("Send a message") with an
 * inline send button. Auto-scrolls to the newest message.
 *
 * Connects to: RoomPage (messages, onSend, currentUserId, onClose)
 */

import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "@meet-app/shared";
import { Send, X } from "lucide-react";
import "../styles/ChatPanel.css";

interface ChatPanelProps {
  /** Array of chat messages to display. */
  messages: ChatMessage[];
  /** Callback to send a new message (emits CHAT_MESSAGE to server). */
  onSend: (text: string) => void;
  /** The local user's ID (to style own messages differently). */
  currentUserId?: string | null;
  /** Close the panel (X). */
  onClose: () => void;
}

/**
 * Chat panel with message list and pill input.
 * Auto-scrolls to the latest message.
 */
export function ChatPanel({ messages, onSend, currentUserId, onClose }: ChatPanelProps) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={styles.container}>
      {/* Header: title + close */}
      <header style={styles.header}>
        <h3 style={styles.heading}>Chat</h3>
        <button style={styles.closeBtn} onClick={onClose} title="Close">
          <X size={20} />
        </button>
      </header>

      {/* Message list */}
      <div style={styles.messages}>
        {messages.length === 0 && (
          <div style={styles.empty}>No messages yet. Say hello 👋</div>
        )}
        {messages.map((msg) => {
          const mine = msg.senderId === currentUserId;
          return (
            <div
              key={msg.id}
              style={{
                ...styles.message,
                alignSelf: mine ? "flex-end" : "flex-start",
                background: mine ? "#8ab4f8" : "#3c4043",
                color: mine ? "#202124" : "#ffffff",
              }}
            >
              {!mine && (
                <span style={styles.sender}>{msg.senderName}</span>
              )}
              <span style={styles.text}>{msg.text}</span>
              <span style={{ ...styles.time, color: mine ? "rgba(32,33,36,0.7)" : "#9aa0a6" }}>
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Pill input with in-pill send button (image 8) */}
      <div style={styles.inputRow}>
        <div style={styles.inputPill}>
          <input
            className="chat-input"
            style={styles.input}
            type="text"
            placeholder="Send a message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="chat-send"
            style={{
              ...styles.sendButton,
              opacity: text.trim() ? 1 : 0.4,
            }}
            onClick={handleSend}
            disabled={!text.trim()}
            title="Send message"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "#202124",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px 4px",
  },
  heading: {
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
  messages: {
    flex: 1,
    overflow: "auto",
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  empty: {
    alignSelf: "center",
    marginTop: 24,
    fontSize: 13,
    color: "#9aa0a6",
    textAlign: "center",
  },
  message: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    maxWidth: "85%",
    padding: "8px 12px",
    borderRadius: 12,
  },
  sender: {
    fontSize: 11.5,
    fontWeight: 600,
    color: "#d2e3fc",
  },
  text: {
    fontSize: 14,
    lineHeight: 1.4,
    wordBreak: "break-word",
  },
  time: {
    fontSize: 10.5,
    alignSelf: "flex-end",
    marginTop: 2,
  },
  inputRow: {
    padding: "8px 16px 16px",
    borderTop: "1px solid rgba(255,255,255,0.1)",
  },
  inputPill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "#3c4043",
    borderRadius: 999,
    paddingLeft: 18,
    paddingRight: 6,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 42,
    fontSize: 14,
    border: "none",
    background: "transparent",
    color: "#ffffff",
    outline: "none",
  },
  sendButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: "none",
    background: "#8ab4f8",
    color: "#202124",
    cursor: "pointer",
    flexShrink: 0,
  },
};