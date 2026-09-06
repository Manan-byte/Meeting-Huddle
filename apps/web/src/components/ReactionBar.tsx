/**
 * @file ReactionBar — emoji reaction picker for the video meeting.
 *
 * Displays a row of emoji buttons. Clicking an emoji sends it as a reaction
 * to all room participants via the SEND_REACTION socket event.
 *
 * Connects to: RoomPage (handleReact callback), meetingHandlers (broadcasts reaction),
 *              ReactionOverlay (displays floating emoji animations)
 */

import type { Reaction, ReactionType } from "@meet-app/shared";

interface ReactionBarProps {
  /** Callback to send a reaction of the given type. */
  onReact: (type: ReactionType) => void;
  /** Recent reactions (used for positioning/animation context). */
  recentReactions: Reaction[];
}

/** All available emoji reaction types. */
const REACTION_TYPES: ReactionType[] = ["👍", "❤️", "😂", "🎉", "👏", "🤔", "❌", "✅"];

/**
 * Renders a horizontal row of emoji reaction buttons.
 * Each button triggers the onReact callback with the emoji type.
 */
export function ReactionBar({ onReact }: ReactionBarProps) {
  return (
    <div className="reaction-bar">
      {REACTION_TYPES.map((type) => (
        <button
          key={type}
          className="reaction-btn"
          onClick={() => onReact(type)}
          title={`React with ${type}`}
        >
          {type}
        </button>
      ))}
    </div>
  );
}
