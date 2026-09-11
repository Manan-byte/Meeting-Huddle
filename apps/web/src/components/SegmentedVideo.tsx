/**
 * @file SegmentedVideo — virtual background that never covers the speaker.
 *
 * Replaces the old full-frame tint (which made the face disappear under a blue
 * wash). This version renders the chosen background as a visible **frame**
 * around a fully-clear, full-opacity video, so:
 *   - the speaker's face is always sharp and unobscured
 *   - the selected color/image/blur is clearly visible as the tile backdrop
 *
 * Blur mode blurs a copy of the video slightly behind the clear center; color
 * and image modes draw that background and inset the clear video on top.
 *
 * This is intentionally dependency-free (no wasm/ML/CDN) so it works reliably
 * in every environment — including offline and production with no external
 * asset loading.
 *
 * Connects to: VideoPlayer (renders the local tile's background).
 */

import { useRef } from "react";
import type { CSSProperties } from "react";

interface SegmentedVideoProps {
  /** The local camera/screen stream to display (kept fully visible). */
  stream: MediaStream;
  /** Background mode: blur the backdrop, or show a color/image behind. */
  mode: "blur" | "color" | "image";
  /** For color/image: a CSS color or a URL (data:/http) for the background. */
  background: string;
}

/**
 * Renders the background as a frame around a clear, full-opacity video.
 */
export function SegmentedVideo({ stream, mode, background }: SegmentedVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Bind the stream to the main (clear) video and, in blur mode, the backdrop video.
  const bind = (v: HTMLVideoElement | null) => {
    if (v && v.srcObject !== stream) v.srcObject = stream;
  };

  const isBlur = mode === "blur";
  const isImage = mode === "image";

  return (
    <div style={styles.frame}>
      {/* Backdrop layer */}
      {isBlur ? (
        <video ref={bgRef} autoPlay playsInline muted style={styles.backdropBlur} onLoadedMetadata={(e) => bind(e.currentTarget)} />
      ) : (
        <div
          style={{
            ...styles.backdrop,
            background: isImage
              ? `url("${background}") center / cover no-repeat`
              : background,
          }}
        />
      )}
      {/* Image preload so it renders once available (opaque until loaded). */}
      {isImage && <img ref={imgRef} src={background} alt="" style={styles.hiddenImg} />}

      {/* Clear center video — full opacity, face always visible */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={styles.clearVideo}
        onLoadedMetadata={(e) => {
          bind(e.currentTarget);
          void e.currentTarget.play().catch(() => {});
        }}
      />
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  frame: {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
  backdrop: {
    position: "absolute",
    inset: 0,
  },
  backdropBlur: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    filter: "blur(18px) saturate(1.15)",
    transform: "scale(1.08)", // hide blurred edge ring
  },
  hiddenImg: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    pointerEvents: "none",
  },
  clearVideo: {
    position: "relative",
    width: "calc(100% - 20px)",
    height: "calc(100% - 20px)",
    objectFit: "cover",
    display: "block",
    borderRadius: 12,
    margin: 10,
    zIndex: 2,
  },
};
