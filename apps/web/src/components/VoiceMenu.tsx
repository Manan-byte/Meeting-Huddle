/**
 * @file VoiceMenu — combined voice settings popover (mic, noise suppression, push-to-talk).
 *
 * One menu for all audio controls, Discord-style:
 *   - Mute microphone (quick toggle)
 *   - Noise suppression (RNNoise browser-native) + echo cancellation
 *   - Push-to-talk (enable + hotkey capture)
 *   - Mute all participants (host only)
 *
 * Connects to: ControlBar (renders as a popover above the mic group),
 *              RoomPage (state + handlers via ControlBar props)
 */

import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { Mic, MicOff, Radio, AudioWaveform, VolumeX } from "lucide-react";
import { formatHotkey } from "../hooks/usePushToTalk";

interface VoiceMenuProps {
  /** Local mic muted (the quick "Mute microphone" toggle). */
  isMuted: boolean;
  onToggleMute: () => void;
  /** Browser-native noise suppression active. */
  isNoiseSuppression: boolean;
  onToggleNoiseSuppression: () => void;
  /** Push-to-talk mode enabled. */
  isPushToTalk: boolean;
  onTogglePushToTalk: () => void;
  /** Current PTT hotkey (raw key value, " " for Space). */
  pushToTalkHotkey: string;
  onPushToTalkHotkeyChange: (key: string) => void;
  /** Local user is host → shows "Mute all participants". */
  isHost: boolean;
  onMuteAll: () => void;
  /** Close the popover (e.g. after an action). */
  onClose: () => void;
}

/**
 * A single toggle row: icon + label + optional hint + switch.
 */
function ToggleRow({
  icon,
  label,
  hint,
  active,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button className="ctl-vrow" data-active={active} style={styles.row} onClick={onToggle}>
      <span style={styles.rowIcon}>{icon}</span>
      <span style={styles.rowText}>
        <span style={styles.rowLabel}>{label}</span>
        {hint && <span style={styles.rowHint}>{hint}</span>}
      </span>
      <span style={{ ...styles.switch, ...(active ? styles.switchOn : null) }}>
        <span className="ctl-switch-knob" style={styles.switchKnob} />
      </span>
    </button>
  );
}

export function VoiceMenu({
  isMuted,
  onToggleMute,
  isNoiseSuppression,
  onToggleNoiseSuppression,
  isPushToTalk,
  onTogglePushToTalk,
  pushToTalkHotkey,
  onPushToTalkHotkeyChange,
  isHost,
  onMuteAll,
  onClose,
}: VoiceMenuProps) {
  const [capturing, setCapturing] = useState(false);

  // When capturing, the next key pressed anywhere becomes the PTT hotkey.
  useEffect(() => {
    if (!capturing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(false);
        return;
      }
      onPushToTalkHotkeyChange(e.key);
      setCapturing(false);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [capturing, onPushToTalkHotkeyChange]);

  return (
    <div className="ctl-vmenu" style={styles.menu} onClick={(e) => e.stopPropagation()}>
      {/* ── Microphone ─────────────────────────────────────────── */}
      <div style={styles.sectionTitle}>Microphone</div>
      <ToggleRow
        icon={isMuted ? <MicOff size={15} /> : <Mic size={15} />}
        label={isMuted ? "Unmute microphone" : "Mute microphone"}
        active={isMuted}
        onToggle={() => { onToggleMute(); }}
      />
      <ToggleRow
        icon={<AudioWaveform size={15} />}
        label="Noise suppression"
        hint="Filter background noise (RNNoise)"
        active={isNoiseSuppression}
        onToggle={() => { onToggleNoiseSuppression(); }}
      />

      <div style={styles.divider} />

      {/* ── Push to talk ───────────────────────────────────────── */}
      <div style={styles.sectionTitle}>Push to talk</div>
      <ToggleRow
        icon={<Radio size={15} />}
        label="Enable push to talk"
        hint={isPushToTalk ? `Hold ${formatHotkey(pushToTalkHotkey)} to talk` : "Mic stays muted until held"}
        active={isPushToTalk}
        onToggle={() => { onTogglePushToTalk(); }}
      />
      {isPushToTalk && (
        <div style={styles.hotkeyRow}>
          <span style={styles.hotkeyLabel}>Hold key</span>
          <button
            style={styles.hotkeyInput}
            onClick={() => setCapturing(true)}
            title={capturing ? "Press the key you want to hold to talk" : "Click, then press a key"}
          >
            {capturing ? "Press key..." : formatHotkey(pushToTalkHotkey)}
          </button>
        </div>
      )}

      {/* ── Moderation (host only) ─────────────────────────────── */}
      {isHost && (
        <>
          <div style={styles.divider} />
          <div style={styles.sectionTitle}>Moderation</div>
          <button
            style={styles.muteAllBtn}
            onClick={() => { onMuteAll(); onClose(); }}
          >
            <VolumeX size={15} /> Mute all participants
          </button>
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  menu: {
    position: "absolute",
    bottom: 74,
    left: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "10px 10px 12px",
    borderRadius: "var(--radius-2xl)",
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    boxShadow: "var(--elev-floating)",
    zIndex: 40,
    minWidth: 260,
    maxWidth: "calc(100vw - 24px)",
    maxHeight: "calc(100vh - 150px)",
    overflowY: "auto",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-dim)",
    padding: "6px 8px 4px",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 10px",
    borderRadius: 10,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  },
  rowIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 8,
    background: "var(--bg-soft)",
    color: "var(--text-muted)",
    flexShrink: 0,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text)",
  },
  rowHint: {
    fontSize: 11,
    color: "var(--text-dim)",
    marginTop: 1,
  },
  switch: {
    width: 34,
    height: 20,
    borderRadius: 999,
    background: "var(--bg-soft)",
    border: "1px solid var(--border)",
    position: "relative",
    flexShrink: 0,
    transition: "background var(--motion-fast) var(--ease-standard)",
  },
  switchOn: {
    background: "var(--accent)",
    borderColor: "var(--accent)",
  },
  switchKnob: {
    position: "absolute",
    top: 2,
    left: 2,
    width: 14,
    height: 14,
    borderRadius: "50%",
    background: "#fff",
    transition: "transform var(--motion-fast) var(--ease-standard)",
  },
  divider: {
    height: 1,
    background: "var(--border)",
    margin: "6px 4px",
  },
  hotkeyRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px 2px",
  },
  hotkeyLabel: {
    fontSize: 12,
    color: "var(--text-muted)",
  },
  hotkeyInput: {
    marginLeft: "auto",
    minWidth: 64,
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text)",
    fontSize: 12,
    fontWeight: 700,
    textAlign: "center",
    cursor: "pointer",
    outline: "none",
  },
  muteAllBtn: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 10px",
    borderRadius: 10,
    border: "none",
    background: "color-mix(in srgb, var(--danger) 10%, transparent)",
    color: "var(--danger)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
};