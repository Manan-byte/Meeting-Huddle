/**
 * @file HandRaiseButton — toggle button for raising/lowering hand.
 *
 * Simple toggle button that changes color (amber when raised, default when lowered).
 * Calls the onToggle callback which emits HAND_RAISE/HAND_LOWER to the server.
 *
 * Note: This component is not currently used in the main UI — the hand raise
 * button is integrated directly into ControlBar. Kept for potential standalone use.
 *
 * Connects to: ControlBar (integrated), RoomPage (handleToggleHandRaise),
 *              featureHandlers (server broadcasts hand raise state)
 */

import { Hand } from "lucide-react";

interface HandRaiseButtonProps {
  /** Whether the user's hand is currently raised. */
  isHandRaised: boolean;
  /** Callback to toggle the hand raise state. */
  onToggle: () => void;
}

/**
 * Hand raise toggle button with visual state indicator.
 * Amber background when raised, default when lowered.
 */
export function HandRaiseButton({ isHandRaised, onToggle }: HandRaiseButtonProps) {
  return (
    <button
      style={{
        ...styles.button,
        background: isHandRaised ? "#f59e0b" : "var(--bg-tertiary)",
      }}
      onClick={onToggle}
      title={isHandRaised ? "Lower hand" : "Raise hand"}
    >
      <Hand size={20} />
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
