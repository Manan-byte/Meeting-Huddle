/**
 * @file LayoutToggle — button to switch between grid and speaker video layouts.
 *
 * Displays the icon for the opposite layout mode (click to switch).
 * Currently not used as a standalone component — the layout toggle is
 * integrated directly into ControlBar. Kept for potential standalone use.
 *
 * Connects to: ControlBar (integrated), RoomPage (handleToggleLayout),
 *              featureHandlers (server broadcasts layout changes)
 */

import { LayoutGrid, LayoutPanelTop } from "lucide-react";
import type { LayoutMode } from "@meet-app/shared";

interface LayoutToggleProps {
  /** Current layout mode. */
  layout: LayoutMode;
  /** Callback to change the layout. */
  onChange: (layout: LayoutMode) => void;
}

/**
 * Layout toggle button — switches between grid and speaker views.
 * Shows the icon for the mode it will switch TO.
 */
export function LayoutToggle({ layout, onChange }: LayoutToggleProps) {
  return (
    <button
      style={{
        ...styles.button,
        background: "var(--bg-tertiary)",
      }}
      onClick={() => onChange(layout === "grid" ? "speaker" : "grid")}
      title={layout === "grid" ? "Switch to speaker view" : "Switch to grid view"}
    >
      {layout === "grid" ? <LayoutPanelTop size={20} /> : <LayoutGrid size={20} />}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  button: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: "50%",
    border: "none",
    color: "#fff",
    cursor: "pointer",
    transition: "background 0.2s",
  },
};
