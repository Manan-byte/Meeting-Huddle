/**
 * @file PreJoinScreen — clean, modern lobby before entering the meeting.
 *
 * Shows a live camera preview so the user can check their mic/camera, pick
 * devices, and toggle mic/video before joining. On "Join now" it stops the
 * preview media (RoomPage re-acquires via useLiveKit) and invokes the
 * provided onJoin callback to emit CREATE_ROOM/JOIN_ROOM and enter the room.
 *
 * Design: a light, friendly SaaS-style panel — soft overlay, spacious card,
 * rounded preview with polished center controls, accessible device pills,
 * and clear primary/secondary actions. Matches the app's light theme.
 *
 * Connects to: HomePage (provides user name, room context, onJoin/onCancel),
 *              shared types (no new contracts)
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Mic, MicOff, Video, VideoOff, X, ChevronDown, Video as VideoIcon, Volume2, VolumeX, Sparkles } from "lucide-react";
import { useSpeakingLevel } from "../hooks/useSpeakingLevel";

interface PreJoinScreenProps {
  /** The user's display name. */
  userName: string;
  /** Meeting title (for create flow) or room code (for join flow). */
  title: string;
  /** True when creating a new meeting, false when joining. */
  isCreating: boolean;
  /** Editable meeting title (create flow only). */
  meetingTitle: string;
  onMeetingTitleChange: (title: string) => void;
  /** Called when the user clicks "Join now" (proceeds to emit + enter room). */
  onJoin: () => void;
  /** Called to cancel / go back to the home form. */
  onCancel: () => void;
}

/** A media device entry (id + label). */
interface DeviceOption {
  deviceId: string;
  label: string;
}

/**
 * The pre-meeting lobby screen.
 */
export function PreJoinScreen({
  userName,
  title,
  isCreating,
  meetingTitle,
  onMeetingTitleChange,
  onJoin,
  onCancel,
}: PreJoinScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [devices, setDevices] = useState<{
    audioIn: DeviceOption[];
    videoIn: DeviceOption[];
  }>({ audioIn: [], videoIn: [] });
  const [audioIn, setAudioIn] = useState("");
  const [videoIn, setVideoIn] = useState("");
  const [error, setError] = useState("");
  /** Chosen background for the upcoming meeting (persisted on join). */
  const [backgroundBlur, setBackgroundBlur] = useState(false);
  const [virtualBackground, setVirtualBackground] = useState<string | null>(null);
  /** Whether a test tone is currently playing. */
  const [testingAudio, setTestingAudio] = useState(false);

  // Live mic level for the audio test meter.
  const micLevel = useSpeakingLevel(muted ? null : stream);

  /** Background swatches (None / Blur / colors). */
  const BG_OPTIONS: { label: string; blur?: boolean; color?: string | null }[] = [
    { label: "None", color: null },
    { label: "Blur", blur: true },
    { label: "Green", color: "#2d6a4f" },
    { label: "Blue", color: "#1e3a5f" },
    { label: "Red", color: "#8b1a1a" },
    { label: "Purple", color: "#5b2c6f" },
  ];

  /** Play a short test tone so the user can confirm their speaker works. */
  const playTestTone = () => {
    try {
      const actx = new AudioContext();
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = "sine";
      osc.frequency.value = 440;
      gain.gain.value = 0.15;
      osc.connect(gain);
      gain.connect(actx.destination);
      osc.start();
      setTestingAudio(true);
      setTimeout(() => {
        osc.stop();
        actx.close().catch(() => {});
        setTestingAudio(false);
      }, 600);
    } catch {
      /* audio context unavailable — ignore */
    }
  };

  /** Persist the chosen background and proceed to join. */
  const handleJoin = () => {
    try {
      sessionStorage.setItem(
        "huddle_prejoin_settings",
        JSON.stringify({ backgroundBlur, virtualBackground })
      );
    } catch {
      /* storage unavailable — background just won't persist */
    }
    onJoin();
  };

  /** Acquire camera + mic, bind to preview, and enumerate devices. */
  useEffect(() => {
    let cancelled = false;
    const acquire = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: true,
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
        const all = await navigator.mediaDevices.enumerateDevices();
        const audioIn = all
          .filter((d) => d.kind === "audioinput")
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 4)}` }));
        const videoIn = all
          .filter((d) => d.kind === "videoinput")
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 4)}` }));
        setDevices({ audioIn, videoIn });
        if (audioIn[0]) setAudioIn(audioIn[0].deviceId);
        if (videoIn[0]) setVideoIn(videoIn[0].deviceId);
      } catch {
        setError("Unable to access camera/microphone. Check browser permissions.");
      }
    };
    acquire();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Stop the preview stream when leaving (RoomPage re-acquires media). */
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  // Toggle mic: enable/disable audio tracks in the preview stream
  const toggleMic = () => {
    setMuted((m) => {
      const next = !m;
      stream?.getAudioTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  };

  // Toggle camera: enable/disable video tracks
  const toggleVideo = () => {
    setVideoOff((v) => {
      const next = !v;
      stream?.getVideoTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  };

  const initials = (userName || "?").slice(0, 2).toUpperCase();
  /** Display name with the first letter capitalized (e.g. "mANAN" → "Manan"). */
  const displayName = userName ? userName.charAt(0).toUpperCase() + userName.slice(1) : userName;

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.brand}>
            <span style={styles.brandIcon}>
              <VideoIcon size={16} color="var(--accent-dark)" />
            </span>
            <span style={styles.brandText}>Huddle</span>
          </span>
          <button style={styles.closeBtn} onClick={onCancel} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Camera preview */}
        <div
          style={{
            ...styles.previewWrap,
            boxShadow:
              virtualBackground && !backgroundBlur
                ? `inset 0 0 0 4px ${virtualBackground}`
                : "inset 0 0 0 1px var(--border)",
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              ...styles.preview,
              visibility: videoOff || !stream ? "hidden" : "visible",
              filter: backgroundBlur ? "blur(2px)" : "none",
            }}
          />
          {(videoOff || !stream) && (
            <div style={styles.previewFallback}>
              <span style={styles.previewInitials}>{initials}</span>
              <span style={styles.previewFallbackLabel}>
                {videoOff ? "Camera is off" : "Camera preview unavailable"}
              </span>
            </div>
          )}
          {/* Name overlay */}
          <span style={styles.previewName}>{displayName}</span>

          {/* Chosen background badge */}
          {!videoOff && (backgroundBlur || virtualBackground) && (
            <span style={styles.bgBadge}>
              <Sparkles size={11} /> {backgroundBlur ? "Blur" : "Background on"}
            </span>
          )}

          {/* Gradient footer with center controls */}
          <div style={styles.previewFooter}>
            <button style={styles.toggleBtn} onClick={toggleMic} title={muted ? "Unmute" : "Mute"}>
              {muted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button style={styles.toggleBtn} onClick={toggleVideo} title={videoOff ? "Turn on camera" : "Turn off camera"}>
              {videoOff ? <VideoOff size={20} /> : <Video size={20} />}
            </button>
          </div>
        </div>

        {/* Device selectors */}
        <div style={styles.controls}>
          <div style={styles.deviceRow}>
            <DeviceSelect
              icon={<Mic size={15} />}
              value={audioIn}
              options={devices.audioIn}
              onChange={setAudioIn}
              placeholder="Microphone"
            />
            <DeviceSelect
              icon={<Video size={15} />}
              value={videoIn}
              options={devices.videoIn}
              onChange={setVideoIn}
              placeholder="Camera"
            />
          </div>
          {error && <p style={styles.error}>{error}</p>}
        </div>

        {/* Audio test */}
        <div style={styles.controls}>
          <div style={styles.testRow}>
            <span style={styles.testLabel}>
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              Microphone test
            </span>
            <div style={styles.levelMeter} aria-label="Microphone level">
              {Array.from({ length: 8 }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    ...styles.levelBar,
                    height: `${4 + (micLevel / 40) * 12 * (i % 3 === 0 ? 1 : 0.6)}px`,
                    opacity: micLevel > (i / 8) * 30 ? 1 : 0.25,
                  }}
                />
              ))}
            </div>
            <button style={styles.testBtn} onClick={playTestTone}>
              {testingAudio ? "Playing..." : "Test speaker"}
            </button>
          </div>
        </div>

        {/* Background selector */}
        <div style={styles.controls}>
          <div style={styles.bgLabelRow}>
            <span style={styles.testLabel}>
              <Sparkles size={14} /> Background
            </span>
          </div>
          <div style={styles.bgRow}>
            {BG_OPTIONS.map((opt) => {
              const active = opt.blur
                ? backgroundBlur
                : !backgroundBlur && virtualBackground === opt.color;
              return (
                <button
                  key={opt.label}
                  style={{
                    ...styles.bgChip,
                    border: active ? "2px solid var(--accent)" : "2px solid var(--border)",
                    background: opt.color || "var(--bg-soft)",
                  }}
                  onClick={() => {
                    if (opt.blur) {
                      setBackgroundBlur(true);
                      setVirtualBackground(null);
                    } else {
                      setBackgroundBlur(false);
                      setVirtualBackground(opt.color ?? null);
                    }
                  }}
                >
                  <span
                    style={{
                      color: opt.color ? "#fff" : "var(--text)",
                      textShadow: opt.color ? "0 1px 3px rgba(0,0,0,0.4)" : "none",
                    }}
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Meeting info + actions */}
        <div style={styles.footer}>
          {isCreating ? (
            <input
              style={styles.titleInput}
              type="text"
              placeholder="Meeting title"
              value={meetingTitle}
              onChange={(e) => onMeetingTitleChange(e.target.value)}
              maxLength={80}
            />
          ) : (
            <h2 style={styles.meetingTitle}>{title || "Untitled Meeting"}</h2>
          )}
          <p style={styles.subtitle}>
            {isCreating ? "You are creating this meeting" : `Joining as ${displayName}`}
          </p>
          <div style={styles.actions}>
            <button style={styles.cancelBtn} onClick={onCancel}>
              Cancel
            </button>
            <button style={styles.joinBtn} onClick={handleJoin}>
              Join now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A pill-shaped device selector with icon + chevron. */
function DeviceSelect({
  icon,
  value,
  options,
  onChange,
  placeholder,
}: {
  icon: ReactNode;
  value: string;
  options: DeviceOption[];
  onChange: (id: string) => void;
  placeholder: string;
}) {
  return (
    <div style={styles.deviceSelect}>
      <span style={styles.deviceIcon}>{icon}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.deviceSelectInput}
        aria-label={placeholder}
      >
        {options.length === 0 && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {value === "" && options.length > 0 && <option value="" disabled>Default</option>}
        {options.map((o) => (
          <option key={o.deviceId} value={o.deviceId}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} style={styles.deviceChevron} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1100,
    backdropFilter: "blur(4px)",
    padding: 24,
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-card)",
    borderRadius: 24,
    width: 460,
    maxWidth: "100%",
    border: "1px solid var(--border)",
    boxShadow: "0 30px 70px rgba(15,23,42,0.25)",
    overflow: "hidden",
    padding: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px 12px",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  brandIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: 8,
    background: "rgba(155,234,92,0.25)",
  },
  brandText: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text)",
    letterSpacing: "-0.02em",
  },
  closeBtn: {
    background: "var(--bg-soft)",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 6,
    borderRadius: "50%",
    display: "flex",
    transition: "background 0.15s",
  },
  previewWrap: {
    position: "relative",
    margin: "0 20px",
    borderRadius: 16,
    overflow: "hidden",
    background: "var(--bg-raised)",
    aspectRatio: "16/9",
    boxShadow: "inset 0 0 0 1px var(--border)",
  },
  preview: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  previewFallback: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    background:
      "linear-gradient(135deg, #eef7e2 0%, #d9f2bd 100%)",
  },
  previewInitials: {
    fontSize: 56,
    fontWeight: 700,
    color: "var(--accent-dark)",
  },
  previewFallbackLabel: {
    fontSize: 12,
    color: "var(--accent-dark)",
    opacity: 0.7,
  },
  previewName: {
    position: "absolute",
    top: 10,
    left: 10,
    fontSize: 12,
    fontWeight: 600,
    color: "#fff",
    background: "rgba(15,23,42,0.6)",
    padding: "4px 10px",
    borderRadius: 999,
    backdropFilter: "blur(4px)",
  },
  previewFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 72,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    paddingBottom: 12,
    background:
      "linear-gradient(to top, rgba(15,23,42,0.5) 0%, transparent 100%)",
  },
  previewControls: {
    display: "flex",
    gap: 12,
  },
  toggleBtn: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    border: "none",
    background: "rgba(255,255,255,0.95)",
    color: "#0f172a",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 12px rgba(15,23,42,0.25)",
    transition: "transform 0.12s, background 0.15s",
  },
  controls: {
    padding: "12px 20px 0",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  bgBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    color: "#fff",
    background: "rgba(15,23,42,0.6)",
    padding: "4px 9px",
    borderRadius: 999,
    backdropFilter: "blur(4px)",
  },
  testRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  testLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    flexShrink: 0,
  },
  levelMeter: {
    display: "flex",
    alignItems: "flex-end",
    gap: 3,
    height: 16,
    flex: 1,
  },
  levelBar: {
    flex: 1,
    minWidth: 3,
    borderRadius: 2,
    background: "var(--accent-dark)",
    transition: "height 0.1s ease, opacity 0.1s ease",
  },
  testBtn: {
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text)",
    cursor: "pointer",
    flexShrink: 0,
  },
  bgLabelRow: {
    display: "flex",
    alignItems: "center",
  },
  bgRow: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: 6,
  },
  bgChip: {
    padding: "8px 2px",
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    transition: "border-color 0.15s",
  },
  deviceRow: {
    display: "flex",
    gap: 10,
  },
  deviceSelect: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
    padding: "9px 12px",
    borderRadius: 12,
    background: "var(--bg-soft)",
    border: "1px solid var(--border)",
    position: "relative",
    overflow: "hidden",
  },
  deviceIcon: {
    display: "flex",
    color: "var(--text-muted)",
    flexShrink: 0,
  },
  deviceSelectInput: {
    flex: 1,
    minWidth: 0,
    background: "transparent",
    border: "none",
    color: "var(--text)",
    fontSize: 13,
    outline: "none",
    appearance: "none",
    cursor: "pointer",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  deviceChevron: {
    color: "var(--text-muted)",
    flexShrink: 0,
    pointerEvents: "none",
  },
  error: {
    fontSize: 13,
    color: "var(--danger)",
    margin: 0,
  },
  footer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    padding: "8px 20px 20px",
    textAlign: "center" as const,
  },
  meetingTitle: {
    margin: 0,
    fontSize: 19,
    fontWeight: 700,
    color: "var(--text)",
    letterSpacing: "-0.02em",
  },
  titleInput: {
    width: "100%",
    padding: "9px 14px",
    fontSize: 17,
    fontWeight: 700,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-input)",
    color: "var(--text)",
    outline: "none",
    textAlign: "center" as const,
  },
  subtitle: {
    margin: 0,
    fontSize: 14,
    color: "var(--text-muted)",
    marginBottom: 12,
  },
  actions: {
    display: "flex",
    gap: 10,
    width: "100%",
  },
  cancelBtn: {
    flex: 1,
    padding: "12px 0",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text)",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  joinBtn: {
    flex: 2,
    padding: "12px 0",
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 999,
    border: "none",
    background: "var(--accent)",
    color: "var(--accent-ink)",
    cursor: "pointer",
    boxShadow: "0 6px 18px rgba(101,163,13,0.25)",
    transition: "background 0.15s, transform 0.1s",
  },
};