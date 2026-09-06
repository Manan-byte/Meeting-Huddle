/**
 * @file RecordingIndicator — red "REC" badge with elapsed time during recording.
 *
 * Shows a pulsing red dot, "REC"/"PAUSED" label, and the elapsed recording
 * time. Returns null when not recording.
 *
 * Connects to: RoomPage (provides isRecording, elapsed seconds, paused state),
 *              roomHandlers (server broadcasts RECORDING_STATE)
 */

interface RecordingIndicatorProps {
  /** Whether the meeting is currently being recorded. */
  isRecording: boolean;
  /** Elapsed recording time in seconds. */
  seconds: number;
  /** Whether the recording is paused. */
  isPaused: boolean;
}

/** Format seconds as MM:SS or HH:MM:SS. */
function formatTime(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Recording indicator badge with pulsing red dot, elapsed time, and pause state.
 * Background shifts from red (recording) to amber (paused).
 */
export function RecordingIndicator({ isRecording, seconds, isPaused }: RecordingIndicatorProps) {
  if (!isRecording) return null;

  return (
    <div style={{ ...styles.container, background: isPaused ? "rgba(217,119,6,0.85)" : "rgba(220,38,38,0.85)" }}>
      <span style={styles.dot} />
      <span style={styles.label}>{isPaused ? "PAUSED" : "REC"}</span>
      <span style={styles.time}>{formatTime(seconds)}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    color: "#fff",
    flexShrink: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#ff0000",
    animation: "pulse 1.5s ease-in-out infinite",
  },
  label: {
    letterSpacing: 1,
  },
  time: {
    fontVariantNumeric: "tabular-nums",
    opacity: 0.9,
  },
};
