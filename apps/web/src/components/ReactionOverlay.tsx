/**
 * @file ReactionOverlay — floating emoji animation overlay.
 *
 * Displays reactions as floating emojis that appear at random horizontal
 * positions and auto-remove after 2 seconds. Uses CSS animation for the
 * float-up effect.
 *
 * Connects to: RoomPage (provides recentReactions), meetingHandlers (broadcasts reactions)
 */

import { useEffect, useState } from "react";
import type { Reaction } from "@meet-app/shared";
import "../styles/Reactions.css";

interface ReactionOverlayProps {
  /** Array of reactions to display as floating animations. */
  reactions: Reaction[];
  /** Whether reactions animate (float up). False = static center display. */
  animate?: boolean;
}

/**
 * Extended Reaction with positioning data for the floating animation.
 */
interface FloatingReaction extends Reaction {
  /** Random horizontal position (10-90%) for the float animation. */
  left: number;
  /** Timestamp when the reaction was created (for cleanup). */
  createdAt: number;
}

/**
 * Renders floating emoji reactions that auto-fade after 2 seconds.
 * Each new reaction gets a random horizontal position for visual variety.
 */
export function ReactionOverlay({ reactions, animate = true }: ReactionOverlayProps) {
  const [floating, setFloating] = useState<FloatingReaction[]>([]);

  useEffect(() => {
    if (reactions.length === 0) return;

    // Create a new floating reaction from the latest incoming reaction
    const latest = reactions[reactions.length - 1];
    const newFloat: FloatingReaction = {
      ...latest,
      left: 10 + Math.random() * 80, // Random horizontal position (10%-90%)
      createdAt: Date.now(),
    };

    setFloating((prev) => [...prev, newFloat]);

    // Auto-remove after 2 seconds
    const timer = setTimeout(() => {
      setFloating((prev) => prev.filter((r) => r.id !== newFloat.id));
    }, 2000);

    return () => clearTimeout(timer);
  }, [reactions]);

  if (floating.length === 0) return null;

  return (
    <div className="reaction-overlay">
      {floating.map((r) => (
        <span
          key={r.id}
          className={animate ? "floating-reaction" : "floating-reaction floating-static"}
          style={{ left: animate ? `${r.left}%` : "50%" }}
        >
          {r.type}
        </span>
      ))}
    </div>
  );
}
