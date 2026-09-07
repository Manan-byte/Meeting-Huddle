/**
 * @file MeetingTimer — displays elapsed meeting time.
 *
 * Shows a live-updating timer that counts from the meeting start time.
 * Updates every second via setInterval. Displays in HH:MM:SS or MM:SS format.
 *
 * Connects to: RoomPage (provides meetingStartedAt timestamp),
 *              roomHandlers (server sends MEETING_STARTED with startedAt)
 */

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import "../styles/MeetingTimer.css";

interface MeetingTimerProps {
  /** Timestamp (ms) when the meeting started. */
  startedAt: number;
}

/**
 * Format elapsed milliseconds into a human-readable time string.
 * Shows hours if >= 1 hour, otherwise just minutes and seconds.
 *
 * @param ms - Elapsed time in milliseconds
 * @returns Formatted string like "1:23:45" or "05:30"
 */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Live meeting timer that updates every second.
 * Displays elapsed time since the meeting started.
 */
export function MeetingTimer({ startedAt }: MeetingTimerProps) {
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);

  // Update elapsed time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Date.now() - startedAt);
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return (
    <div className="meeting-timer">
      <Clock size={14} />
      <span>{formatElapsed(elapsed)}</span>
    </div>
  );
}
