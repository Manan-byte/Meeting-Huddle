/**
 * @file SupportModals — Report a problem / Report abuse / Troubleshooting & help.
 *
 * Report: user types feedback → the app opens the mail client with a
 * prefilled message (no SMTP on the free tier, same pattern as the auth
 * reset code). Help: static troubleshooting checklist for media issues.
 *
 * Used by: RoomPage (from the ControlBar More menu).
 */

import { useState } from "react";
import type { CSSProperties } from "react";
import { X, Flag, ShieldAlert, HelpCircle, Wrench, Monitor, Mic, Camera, RefreshCw } from "lucide-react";

const S = {
  bg: "#ffffff",
  text: "#202124",
  textDim: "#5f6368",
  accent: "#1a73e8",
  border: "#dadce0",
  danger: "#ea4335",
};

/** Lite — shared frame for both dialogs. */
function Frame({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.headerIcon}>{icon}</span>
            <h3 style={styles.title}>{title}</h3>
          </div>
          <button style={styles.closeBtn} onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Report a problem / abuse dialog → composes a mailto with the user's text. */
export function ReportModal({
  type,
  roomCode,
  onClose,
}: {
  type: "problem" | "abuse";
  roomCode?: string;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const isAbuse = type === "abuse";

  const send = () => {
    const subject = isAbuse
      ? `[Huddle] Report abuse${roomCode ? ` — room ${roomCode}` : ""}`
      : `[Huddle] Report a problem${roomCode ? ` — room ${roomCode}` : ""}`;
    const body = text.trim() || "(no details provided)";
    const mailto = `mailto:support@huddle.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, "_self");
    onClose();
  };

  return (
    <Frame
      title={isAbuse ? "Report abuse" : "Report a problem"}
      icon={isAbuse ? <ShieldAlert size={20} /> : <Flag size={20} />}
      onClose={onClose}
    >
      <p style={styles.desc}>
        {isAbuse
          ? "Tell us what happened. Anything that violates our guidelines will be investigated."
          : "Tell us what went wrong. Details help us fix it faster."}
      </p>
      <textarea
        style={styles.textarea}
        placeholder="Describe the issue…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
      />
      <div style={styles.footer}>
        <button style={styles.cancelBtn} onClick={onClose}>
          Cancel
        </button>
        <button style={styles.sendBtn} onClick={send}>
          Send
        </button>
      </div>
    </Frame>
  );
}

const HELP_ITEMS = [
  {
    icon: <Mic size={18} />,
    title: "No one can hear me",
    body: "Check the mic button isn't red (muted). Allow microphone permission in the browser, and pick the right device in Settings → Audio.",
  },
  {
    icon: <Camera size={18} />,
    title: "My camera doesn't turn on",
    body: "Grant camera permission. If another app is using the camera (Zoom, OBS), close it, then reload the page.",
  },
  {
    icon: <Monitor size={18} />,
    title: "Can't share my screen",
    body: "Screen sharing needs a secure (HTTPS) connection and browser permission. Try again from the Screenshare button.",
  },
  {
    icon: <Wrench size={18} />,
    title: "Video keeps freezing",
    body: "Check your network. Lower the send resolution in Settings → Video, or turn off HD by selecting a lower preset.",
  },
  {
    icon: <RefreshCw size={18} />,
    title: "Everything is broken",
    body: "Fresh reload: press Ctrl+F5 (hard refresh). If the issue persists, report it from the More menu and mention what you were doing.",
  },
];

/** Troubleshooting & help dialog — static checklist. */
export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Frame title="Troubleshooting & help" icon={<HelpCircle size={20} />} onClose={onClose}>
      <div style={styles.items}>
        {HELP_ITEMS.map((item) => (
          <div key={item.title} style={styles.item}>
            <span style={styles.itemIcon}>{item.icon}</span>
            <div>
              <div style={styles.itemTitle}>{item.title}</div>
              <div style={styles.itemBody}>{item.body}</div>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  panel: {
    width: 460,
    maxWidth: "92vw",
    maxHeight: "86vh",
    overflowY: "auto",
    background: S.bg,
    borderRadius: 12,
    padding: "18px 22px 20px",
    boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  headerIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: S.border === "#dadce0" ? "#e8f0fe" : "#e8f0fe",
    color: S.accent,
  },
  title: {
    margin: 0,
    fontSize: 17,
    fontWeight: 500,
    color: S.text,
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
    color: S.text,
    cursor: "pointer",
  },
  desc: {
    fontSize: 13.5,
    color: S.textDim,
    margin: "8px 0 12px",
    lineHeight: 1.5,
  },
  textarea: {
    width: "100%",
    padding: "10px 12px",
    fontSize: 14,
    color: S.text,
    border: `1px solid ${S.border}`,
    borderRadius: 8,
    outline: "none",
    resize: "vertical",
    fontFamily: "inherit",
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
  },
  cancelBtn: {
    padding: "9px 18px",
    fontSize: 14,
    fontWeight: 500,
    color: S.text,
    background: "transparent",
    border: `1px solid ${S.border}`,
    borderRadius: 8,
    cursor: "pointer",
  },
  sendBtn: {
    padding: "9px 22px",
    fontSize: 14,
    fontWeight: 500,
    color: "#fff",
    background: S.accent,
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  items: {
    display: "flex",
    flexDirection: "column",
    marginTop: 8,
  },
  item: {
    display: "flex",
    gap: 12,
    padding: "12px 0",
    borderBottom: `1px solid ${S.border}`,
  },
  itemIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    borderRadius: "50%",
    background: "#f1f3f4",
    color: S.textDim,
    flexShrink: 0,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: S.text,
    marginBottom: 2,
  },
  itemBody: {
    fontSize: 13,
    color: S.textDim,
    lineHeight: 1.5,
  },
};