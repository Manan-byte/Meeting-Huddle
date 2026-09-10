/**
 * @file VideoPlayer — renders a single video tile for a participant.
 *
 * Display states:
 *   1. Video active: binds MediaStream to a <video> element
 *   2. Video off: shows user initials as avatar
 *   3. Virtual background (local tile only): renders through SegmentedVideo
 *      (MediaPipe person cutout) so the speaker stays fully visible while the
 *      background is replaced — no full-frame tint.
 *
 * Also shows: hand raise badge, participant name, "You" badge, and a speaking
 * indicator (audio bars) when the stream carries sound.
 *
 * Connects to: VideoGrid (renders one per participant), useLiveKit (provides streams),
 *              useSpeakingLevel (audio activity), shared types (User state flags)
 */

import { useRef, useEffect } from "react";
import type { CSSProperties } from "react";
import { useSpeakingLevel, SPEAKING_THRESHOLD } from "../hooks/useSpeakingLevel";
import { SegmentedVideo } from "./SegmentedVideo";

interface VideoPlayerProps {
  /** MediaStream to display (null if video is off or stream not yet available). */
  stream: MediaStream | null;
  /** Display name shown in the name overlay. */
  name: string;
  /** Whether the participant's microphone is muted. */
  isMuted: boolean;
  /** Whether the participant's camera is turned off. */
  isVideoOff: boolean;
  /** Whether this is the local user's video (affects muted attribute and "You" badge). */
  isLocal?: boolean;
  /** Whether the participant has raised their hand. */
  isHandRaised?: boolean;
  /** Whether to apply a real (segmented) background blur. */
  backgroundBlur?: boolean;
  /** Virtual background: CSS color string or an image URL, or null for none. */
  virtualBackground?: string | null;
  /** Output volume (0–1) for this tile's audio (applies to remote audio). */
  volume?: number;
}

/**
 * Renders a single video tile with overlays.
 */
export function VideoPlayer({
  stream,
  name,
  isMuted,
  isVideoOff,
  isLocal = false,
  isHandRaised = false,
  backgroundBlur = false,
  virtualBackground = null,
  volume = 1,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Audio activity for the speaking indicator (only when not muted).
  const level = useSpeakingLevel(isMuted ? null : stream);
  const isSpeaking = level > SPEAKING_THRESHOLD;

  // Bind/unbind the MediaStream to the <video> element.
  // `.play()` is called explicitly because `autoplay` doesn't re-trigger after
  // an unmount/remount cycle (e.g., toggling video off → on).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream || isVideoOff) return;
    video.srcObject = stream;
    video.volume = volume;
    void video.play()?.catch(() => {});
    return () => {
      video.srcObject = null;
    };
  }, [stream, isVideoOff, volume]);

  // Local tile with a chosen background → use real segmentation.
  const useSegmented =
    isLocal && stream && !isVideoOff && (backgroundBlur || (virtualBackground && virtualBackground !== "blur"));
  const segMode = backgroundBlur
    ? ("blur" as const)
    : virtualBackground && /^(data:|https?:)/.test(virtualBackground)
      ? ("image" as const)
      : ("color" as const);

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div style={styles.container}>
      {/* Video / segmented video / initials avatar */}
      {isVideoOff || !stream ? (
        <div style={styles.initials}>{initials}</div>
      ) : useSegmented ? (
        <SegmentedVideo stream={stream} mode={segMode} background={virtualBackground ?? ""} style={styles.video} />
      ) : (
        <video
          ref={videoRef}
          style={styles.video}
          autoPlay
          muted={isLocal} // Mute local video to prevent feedback
          playsInline
        />
      )}

      {/* Speaking indicator — audio bars when sound is coming in */}
      {isSpeaking && !isMuted && (
        <div style={styles.speakingBadge} title="Speaking">
          <span style={styles.speakingBar} />
          <span style={{ ...styles.speakingBar, height: 14 }} />
          <span style={styles.speakingBar} />
        </div>
      )}

      {/* Hand raise indicator (badge in top-right corner) */}
      {isHandRaised && (
        <div style={styles.handBadge}>
          <span role="img" aria-label="Hand raised">&#9995;</span>
        </div>
      )}

      {/* Name overlay at the bottom of the tile */}
      <div style={styles.nameOverlay}>
        <span style={styles.nameText}>{name}</span>
        {isLocal && <span style={styles.youBadge}>You</span>}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    position: "relative",
    borderRadius: "var(--radius-lg, 16px)",
    overflow: "hidden",
    background: "var(--bg-raised, #101313)",
    width: "100%",
    aspectRatio: "16/9",
    minWidth: 0,
    border: "1px solid var(--border, #28302b)",
    boxShadow: "var(--elev-raised)",
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    position: "relative",
    zIndex: 2,
    display: "block",
  },
  initials: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
    fontSize: 40,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    color: "var(--text, #f0f2e9)",
    background:
      "radial-gradient(ellipse 80% 70% at 50% 30%, color-mix(in srgb, var(--accent, #7a82ff) 16%, transparent) 0%, transparent 70%), var(--bg-raised, #0b0d0d)",
  },
  speakingBadge: {
    position: "absolute",
    right: 10,
    bottom: 10,
    display: "flex",
    alignItems: "flex-end",
    gap: 2,
    padding: "5px 7px",
    borderRadius: 8,
    background: "rgba(8,11,18,0.6)",
    backdropFilter: "blur(4px)",
    zIndex: 5,
  },
  speakingBar: {
    width: 3,
    height: 10,
    borderRadius: 2,
    background: "var(--accent, #7a82ff)",
    animation: "pulse 1s ease-in-out infinite",
  },
  handBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    fontSize: 20,
    zIndex: 3,
    width: 34,
    height: 34,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    background: "rgba(8,11,18,0.6)",
    backdropFilter: "blur(4px)",
  },
  nameOverlay: {
    position: "absolute",
    bottom: 10,
    left: 10,
    padding: "5px 12px",
    background: "rgba(8,11,18,0.68)",
    backdropFilter: "blur(6px)",
    color: "#ffffff", // always white so it stays readable on any background
    fontSize: 13,
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    zIndex: 4,
    maxWidth: "calc(100% - 20px)",
    overflow: "hidden",
    whiteSpace: "nowrap",
    boxShadow: "0 2px 8px rgba(8,11,18,0.25)",
  },
  nameText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  youBadge: {
    fontSize: 10,
    fontWeight: 700,
    background: "var(--accent)",
    color: "var(--accent-ink, #17250f)",
    padding: "1px 7px",
    borderRadius: 999,
    flexShrink: 0,
  },
};
