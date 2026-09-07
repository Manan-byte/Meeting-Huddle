/**
 * @file WaitingRoom — displays users waiting to join a locked room.
 *
 * Shown to the host when users are waiting in the waiting room.
 * Each waiting user has "Admit" and "Reject" buttons.
 * Only visible when the room is locked and users are pending approval.
 *
 * Connects to: RoomPage (provides waitingUsers, handleAdmit, handleReject),
 *              meetingHandlers (server-side ADMIT_USER, REJECT_USER events)
 */

import type { WaitingUser } from "@meet-app/shared";
import "../styles/WaitingRoom.css";

interface WaitingRoomProps {
  /** Array of users currently in the waiting room. */
  waitingUsers: WaitingUser[];
  /** Callback to admit a user by their socket ID. */
  onAdmit: (socketId: string) => void;
  /** Callback to reject a user by their socket ID. */
  onReject: (socketId: string) => void;
}

/**
 * Renders the waiting room panel with admit/reject controls.
 * Returns null if no users are waiting.
 */
export function WaitingRoom({ waitingUsers, onAdmit, onReject }: WaitingRoomProps) {
  if (waitingUsers.length === 0) return null;

  return (
    <div className="waiting-room">
      <h3 className="waiting-room-title">
        <span className="waiting-room-icon">🔒</span>
        Waiting Room ({waitingUsers.length})
      </h3>
      <div className="waiting-room-list">
        {waitingUsers.map((user) => (
          <div key={user.socketId} className="waiting-room-user">
            <span className="waiting-room-name">{user.name}</span>
            <div className="waiting-room-actions">
              <button
                className="waiting-room-btn admit"
                onClick={() => onAdmit(user.socketId)}
              >
                Admit
              </button>
              <button
                className="waiting-room-btn reject"
                onClick={() => onReject(user.socketId)}
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
