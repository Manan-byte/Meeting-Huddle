/**
 * @file ViewSettingsModal — Google Meet-style "Adjust view" layout picker.
 *
 * Lets the user choose how participant video tiles are arranged during the
 * meeting, plus tile options:
 *   - Layout: Auto (dynamic) / Tiled (grid) / Spotlight (speaker) / Sidebar
 *   - Hide tiles without video toggle
 *
 * The chosen layout is broadcast to the room via SET_LAYOUT and applied
 * immediately through RoomContext. The "hide tiles without video" option is
 * a local preference kept in component state here.
 *
 * Connects to: RoomPage (renders modal, provides current layout + onApply),
 *              shared types (LayoutMode)
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { X, Sparkles, LayoutGrid, MonitorPlay, PanelsTopLeft } from "lucide-react";
import type { LayoutMode } from "@meet-app/shared";

interface ViewSettingsModalProps {
  /** Current layout mode. */
  layout: LayoutMode;
  /** Callback to apply a new layout (emits SET_LAYOUT + updates context). */
  onApply: (layout: LayoutMode) => void;
  /** Callback to close the modal. */
  onClose: () => void;
}

/** A single layout option shown in the picker. */
interface LayoutOption {
  id: LayoutMode;
  label: string;
  /** Accent icon representing the layout in the preview tile. */
  icon: ReactNode;
  /** Whether the tile-size slider is available for this layout. */
  allowsResize: boolean;
}

export function ViewSettingsModal({ layout, onApply, onClose }: ViewSettingsModalProps) {
  const [hideNoVideo, setHideNoVideo] = useState(false);

  const options: LayoutOption[] = [
    { id: "auto", label: "Auto (dynamic)", icon: <Sparkles size={18} />, allowsResize: false },
    { id: "grid", label: "Tiled (legacy)", icon: <LayoutGrid size={18} />, allowsResize: true },
    { id: "speaker", label: "Spotlight", icon: <MonitorPlay size={18} />, allowsResize: false },
    { id: "sidebar", label: "Sidebar", icon: <PanelsTopLeft size={18} />, allowsResize: false },
  ];

  const selected = options.find((o) => o.id === layout) ?? options[0];

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h3 style={styles.title}>Adjust view</h3>
            <p style={styles.subtitle}>Selection is saved for future meetings</p>
          </div>
          <button style={styles.closeBtn} onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Layout options */}
        <div style={styles.options}>
          {options.map((opt) => (
            <button
              key={opt.id}
              style={{
                ...styles.option,
                borderColor: opt.id === layout ? "var(--accent)" : "var(--border)",
              }}
              onClick={() => onApply(opt.id)}
            >
              <span
                style={{
                  ...styles.radio,
                  background: opt.id === layout ? "var(--accent)" : "transparent",
                }}
              />
              <span style={styles.optionIcon}>{opt.icon}</span>
              <span style={styles.optionLabel}>{opt.label}</span>
            </button>
          ))}
        </div>

        {/* Tile size slider (disabled when layout doesn't support resize) */}
        <div style={styles.tileSection}>
          <span style={styles.sectionLabel}>Tiles</span>
          <div
            style={{
              ...styles.sliderRow,
              opacity: selected.allowsResize ? 1 : 0.5,
            }}
          >
            <span style={styles.sliderIconSmall}>▦</span>
            <input
              type="range"
              min={1}
              max={3}
              defaultValue={2}
              disabled={!selected.allowsResize}
              style={styles.slider}
            />
            <span style={styles.sliderIconLarge}>▤</span>
          </div>
          {!selected.allowsResize && (
            <p style={styles.tileHint}>Can't change tile size in this layout</p>
          )}
        </div>

        {/* Hide tiles without video toggle */}
        <div style={styles.toggleRow}>
          <label style={styles.toggleLabel} htmlFor="hide-no-video">
            Hide tiles without video
          </label>
          <input
            id="hide-no-video"
            type="checkbox"
            checked={hideNoVideo}
            onChange={(e) => setHideNoVideo(e.target.checked)}
            style={styles.toggle}
          />
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
    background: "var(--bg-card)",
    borderRadius: 16,
    padding: "24px 24px 16px",
    width: 360,
    border: "1px solid var(--border)",
    boxShadow: "0 25px 60px rgba(0,0,0,0.45)",
    color: "var(--text)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  title: {
    margin: 0,
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: "-0.01em",
  },
  subtitle: {
    margin: "4px 0 0",
    fontSize: 12,
    color: "var(--text-muted)",
  },
  closeBtn: {
    background: "var(--bg-soft)",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 6,
    borderRadius: "50%",
    display: "flex",
  },
  options: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 8,
    marginBottom: 20,
  },
  option: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 10px",
    borderRadius: 12,
    background: "var(--bg-soft)",
    border: "2px solid var(--border)",
    color: "var(--text)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    textAlign: "left",
    transition: "border-color 0.15s, background 0.15s",
  },
  radio: {
    width: 14,
    height: 14,
    borderRadius: "50%",
    border: "2px solid var(--text-muted)",
    flexShrink: 0,
  },
  optionIcon: {
    display: "flex",
    color: "var(--text-muted)",
  },
  optionLabel: {
    flex: 1,
  },
  tileSection: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-muted)",
    marginBottom: 8,
    display: "block",
  },
  sliderRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  sliderIconSmall: {
    fontSize: 16,
    color: "var(--text-muted)",
  },
  sliderIconLarge: {
    fontSize: 22,
    color: "var(--text-muted)",
  },
  slider: {
    flex: 1,
    accentColor: "var(--accent)",
    cursor: "pointer",
  },
  tileHint: {
    fontSize: 12,
    color: "var(--text-dim)",
    margin: "6px 0 0",
  },
  toggleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 0",
    borderTop: "1px solid var(--border)",
  },
  toggleLabel: {
    fontSize: 14,
    color: "var(--text)",
  },
  toggle: {
    width: 36,
    height: 20,
    accentColor: "var(--accent)",
    cursor: "pointer",
  },
};
