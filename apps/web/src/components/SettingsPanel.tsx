/**
 * @file SettingsPanel — meeting settings modal for resolution, devices, and backgrounds.
 *
 * Allows the user to configure:
 *   - Video resolution (360p, 480p, 720p, 1080p)
 *   - Video/audio device selection (from navigator.mediaDevices.enumerateDevices)
 *   - Background (None / Blur / color swatches / uploaded image)
 *
 * Background selection maps to a single coherent state:
 *   - None  → backgroundBlur = false, virtualBackground = null
 *   - Blur  → backgroundBlur = true,  virtualBackground = null
 *   - Color → backgroundBlur = false, virtualBackground = <color>
 *   - Image → backgroundBlur = false, virtualBackground = <data URL>
 *
 * Settings are applied via useLiveKit.applySettings(). With LiveKit the SFU
 * auto-negotiates media; resolution/device changes are applied client-side.
 *
 * Connects to: RoomPage (provides onApplySettings, currentSettings),
 *              useLiveKit (applySettings is a client-side no-op for LiveKit),
 *              shared constants (RESOLUTION_PRESETS)
 */

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { RESOLUTION_PRESETS } from "@meet-app/shared";
import type { MeetingSettings } from "@meet-app/shared";

interface SettingsPanelProps {
  /** Callback to close the settings panel. */
  onClose: () => void;
  /** Callback to apply new settings (triggers media re-acquisition). */
  onApplySettings: (settings: MeetingSettings) => void;
  /** Current meeting settings (for initial form values). */
  currentSettings: MeetingSettings;
}

/** Background choice definition. */
interface BackgroundOption {
  label: string;
  /** null = none, "blur" = blur, otherwise a CSS color. */
  value: string | null;
  /** How to apply it: none clears everything, blur sets backgroundBlur, color sets virtualBackground. */
  kind: "none" | "blur" | "color";
}

/** Available background options. */
const BG_OPTIONS: BackgroundOption[] = [
  { label: "None", value: null, kind: "none" },
  { label: "Blur", value: "blur", kind: "blur" },
  { label: "Green", value: "#2d6a4f", kind: "color" },
  { label: "Blue", value: "#1e3a5f", kind: "color" },
  { label: "Red", value: "#8b1a1a", kind: "color" },
  { label: "Purple", value: "#5b2c6f", kind: "color" },
];

/**
 * Settings panel modal with resolution, device, and background options.
 * Enumerates available media devices on mount.
 */
export function SettingsPanel({
  onClose,
  onApplySettings,
  currentSettings,
}: SettingsPanelProps) {
  const [resolution, setResolution] = useState(currentSettings.resolution);
  const [videoDevice, setVideoDevice] = useState(currentSettings.videoDevice);
  const [audioDevice, setAudioDevice] = useState(currentSettings.audioDevice);
  const [backgroundBlur, setBackgroundBlur] = useState(currentSettings.backgroundBlur);
  const [virtualBackground, setVirtualBackground] = useState(currentSettings.virtualBackground);

  /** Available media devices (video inputs and audio inputs). */
  const [devices, setDevices] = useState<{ video: MediaDeviceInfo[]; audio: MediaDeviceInfo[] }>({ video: [], audio: [] });

  // Enumerate available media devices on mount
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .enumerateDevices()
      .then((all) => {
        if (cancelled) return;
        setDevices({
          video: all.filter((d) => d.kind === "videoinput"),
          audio: all.filter((d) => d.kind === "audioinput"),
        });
      })
      .catch(() => {
        // Enumeration can fail on some browsers without permission
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Apply all settings changes and close the panel. */
  const handleApply = () => {
    onApplySettings({
      ...currentSettings,
      resolution,
      videoDevice,
      audioDevice,
      backgroundBlur,
      virtualBackground,
    });
    onClose();
  };

  /** Select a background option, mapping it to the coherent blur/color state. */
  const handleSelectBackground = (opt: BackgroundOption) => {
    if (opt.kind === "blur") {
      setBackgroundBlur(true);
      setVirtualBackground(null);
    } else {
      setBackgroundBlur(false);
      setVirtualBackground(opt.value);
    }
  };

  /** Whether a given background option is currently selected. */
  const isBgSelected = (opt: BackgroundOption): boolean => {
    if (opt.kind === "none") return !backgroundBlur && !virtualBackground;
    if (opt.kind === "blur") return backgroundBlur;
    return !backgroundBlur && virtualBackground === opt.value;
  };

  /** Read an uploaded image and set it as the virtual background (data URL). */
  const handleUploadBackground = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setBackgroundBlur(false);
        setVirtualBackground(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const hasUploadedImage = !!virtualBackground && /^data:/.test(virtualBackground);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>Settings</h3>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={styles.body}>
          {/* ── Video section ─────────────────────────────────────── */}
          <div style={styles.section}>
            <label style={styles.label}>Video</label>
            <div style={styles.row}>
              <div style={styles.field}>
                <span style={styles.fieldLabel}>Resolution</span>
                <select
                  style={styles.select}
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as MeetingSettings["resolution"])}
                >
                  {Object.keys(RESOLUTION_PRESETS).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              {devices.video.length > 0 && (
                <div style={styles.field}>
                  <span style={styles.fieldLabel}>Camera</span>
                  <select
                    style={styles.select}
                    value={videoDevice}
                    onChange={(e) => setVideoDevice(e.target.value)}
                  >
                    <option value="">Default</option>
                    {devices.video.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Camera ${d.deviceId.slice(0, 4)}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {devices.audio.length > 0 && (
              <div style={styles.field}>
                <span style={styles.fieldLabel}>Microphone</span>
                <select
                  style={styles.select}
                  value={audioDevice}
                  onChange={(e) => setAudioDevice(e.target.value)}
                >
                  <option value="">Default</option>
                  {devices.audio.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Mic ${d.deviceId.slice(0, 4)}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* ── Background section ────────────────────────────────── */}
          <div style={styles.section}>
            <label style={styles.label}>Background</label>
            <div style={styles.bgRow}>
              {BG_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  style={{
                    ...styles.bgOption,
                    border: isBgSelected(opt) ? "2px solid var(--accent)" : "2px solid var(--border)",
                  }}
                  onClick={() => handleSelectBackground(opt)}
                  title={opt.label}
                >
                  <span
                    style={{
                      ...styles.bgSwatch,
                      background:
                        opt.kind === "color"
                          ? (opt.value as string)
                          : opt.kind === "blur"
                            ? "linear-gradient(135deg, #2a2f2b 0%, #565d57 100%)"
                            : "var(--bg-input)",
                    }}
                  />
                  <span style={styles.bgLabel}>{opt.label}</span>
                </button>
              ))}
            </div>

            <label style={styles.uploadBtn}>
              Upload image
              <input
                type="file"
                accept="image/*"
                onChange={handleUploadBackground}
                style={{ display: "none" }}
              />
            </label>
            {hasUploadedImage && (
              <div style={styles.uploadPreview}>
                <img
                  src={virtualBackground as string}
                  alt="Selected background"
                  style={styles.uploadPreviewImg}
                />
                <span style={styles.uploadPreviewName}>Custom image</span>
                <button style={styles.uploadRemove} onClick={() => setVirtualBackground(null)}>
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button style={styles.applyBtn} onClick={handleApply}>
            Apply Settings
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    backdropFilter: "blur(4px)",
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-card)",
    borderRadius: 16,
    padding: 24,
    width: 480,
    maxHeight: "90vh",
    border: "1px solid var(--border)",
    boxShadow: "0 25px 60px rgba(0,0,0,0.45)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: 17,
    fontWeight: 700,
    color: "var(--text)",
    letterSpacing: "-0.01em",
  },
  closeBtn: {
    background: "var(--bg-soft)",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 6,
    borderRadius: "50%",
    transition: "background 0.15s",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    overflow: "auto",
    flex: 1,
    minHeight: 0,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-secondary)",
  },
  select: {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text)",
    fontSize: 14,
    outline: "none",
    cursor: "pointer",
  },
  bgRow: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: 8,
  },
  bgOption: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "10px 4px",
    borderRadius: 12,
    cursor: "pointer",
    background: "var(--bg-soft)",
    transition: "border-color 0.15s, transform 0.1s",
  },
  bgSwatch: {
    width: 34,
    height: 24,
    borderRadius: 6,
    border: "1px solid rgba(255,255,255,0.12)",
  },
  bgLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text)",
  },
  uploadBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "9px 0",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 10,
    border: "1px dashed var(--border)",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
    transition: "border-color 0.15s, color 0.15s",
  },
  uploadPreview: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  uploadPreviewImg: {
    width: 64,
    height: 40,
    objectFit: "cover",
    borderRadius: 6,
    border: "1px solid var(--border)",
  },
  uploadPreviewName: {
    flex: 1,
    fontSize: 13,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  uploadRemove: {
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 20,
    paddingTop: 16,
    borderTop: "1px solid var(--border)",
    flexShrink: 0,
  },
  cancelBtn: {
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  applyBtn: {
    padding: "10px 24px",
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 999,
    border: "none",
    background: "var(--accent)",
    color: "var(--accent-ink)",
    cursor: "pointer",
    transition: "background 0.15s, transform 0.1s",
  },
};
