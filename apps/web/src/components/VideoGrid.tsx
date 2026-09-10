/**
 * @file VideoGrid — renders the video tiles for all participants.
 *
 * Supports two layout modes:
 *   - "grid": equal-sized tiles in a responsive grid (1/2/3 columns)
 *   - "speaker": delegates to SpeakerView (large speaker + side thumbnails)
 *
 * Always renders the local user's video first, then remote participants.
 * Grid columns auto-adjust based on participant count (1→1, 2-4→2, 5+→3).
 *
 * Connects to: RoomPage (provides streams and participants), VideoPlayer (renders each tile),
 *              SpeakerView (alternate layout), shared types (LayoutMode)
 */

import type { User, LayoutMode, MeetingSettings } from "@meet-app/shared";
import { VideoPlayer } from "./VideoPlayer";
import { SpeakerView } from "./SpeakerView";

interface VideoGridProps {
  /** Local camera+mic stream (null until media is acquired). */
  localStream: MediaStream | null;
  /** The screen share MediaStream (null when not sharing). When screen sharing is
   *  active, the local tile displays this stream instead of the camera so the user
   *  sees their own share; otherwise it falls back to localStream. */
  screenStream: MediaStream | null;
  /** Map of remote peer ID → their MediaStream. */
  remoteStreams: Map<string, MediaStream>;
  /** All participants in the room. */
  participants: User[];
  /** The local user (null before joining). */
  currentUser: User | null;
  /** Current layout mode ("grid" or "speaker"). */
  layout: LayoutMode;
  /** Meeting settings (used for background blur/virtual background on local video). */
  settings?: MeetingSettings;
}

/**
 * Renders all video tiles in the selected layout mode.
 * Grid mode: responsive CSS Grid with auto-calculated columns.
 * Speaker mode: delegates to SpeakerView component.
 */
export function VideoGrid({
  localStream,
  screenStream,
  remoteStreams,
  participants,
  currentUser,
  layout,
  settings,
}: VideoGridProps) {
  // Spotlight / speaker view: one large video + side thumbnails
  if (layout === "speaker") {
    return (
      <SpeakerView
        localStream={localStream}
        screenStream={screenStream}
        remoteStreams={remoteStreams}
        participants={participants}
        currentUser={currentUser}
        settings={settings}
      />
    );
  }

  // Sidebar view: main speaker fills the area, remaining tiles in a side rail
  if (layout === "sidebar") {
    return (
      <div style={styles.sidebarLayout}>
        <div style={styles.sidebarMain}>
          {currentUser && (
            <VideoPlayer
              stream={screenStream || localStream}
              name={currentUser.name}
              isMuted={currentUser.isMuted}
              isVideoOff={currentUser.isVideoOff}
              isLocal
              isHandRaised={currentUser.isHandRaised}
              backgroundBlur={settings?.backgroundBlur}
              virtualBackground={settings?.virtualBackground}
            />
          )}
        </div>
        <div style={styles.sidebarRail}>
          {participants
            .filter((p) => p.id !== currentUser?.id)
            .map((p) => (
              <div style={styles.sidebarTile} key={p.id}>
                <VideoPlayer
                  stream={remoteStreams.get(p.id) ?? null}
                  name={p.name}
                  isMuted={p.isMuted}
                  isVideoOff={p.isVideoOff}
                  isHandRaised={p.isHandRaised}
                />
              </div>
            ))}
        </div>
      </div>
    );
  }

  // Auto + grid: dynamic grid based on participant count
  // Grid view: calculate column count based on participant count
  const cols = participants.length <= 1 ? 1 : participants.length <= 4 ? 2 : 3;
  // Tiles fill the available canvas so a lone participant isn't a tiny strip.
  const isAlone = participants.length <= 1;

  return (
    <div
      style={{
        ...styles.grid,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridAutoRows: "1fr",
        maxWidth: isAlone ? "720px" : undefined,
        margin: isAlone ? "0 auto" : undefined,
      }}
    >
      {/* Local user's video (always first) */}
      {currentUser && (
        <div style={styles.cell}>
          <VideoPlayer
            stream={screenStream || localStream}
            name={currentUser.name}
            isMuted={currentUser.isMuted}
            isVideoOff={currentUser.isVideoOff}
            isLocal
            isHandRaised={currentUser.isHandRaised}
            backgroundBlur={settings?.backgroundBlur}
            virtualBackground={settings?.virtualBackground}
          />
        </div>
      )}
      {/* Remote participants' videos */}
      {participants
        .filter((p) => p.id !== currentUser?.id)
        .map((p) => (
          <div style={styles.cell} key={p.id}>
            <VideoPlayer
              stream={remoteStreams.get(p.id) ?? null}
              name={p.name}
              isMuted={p.isMuted}
              isVideoOff={p.isVideoOff}
              isHandRaised={p.isHandRaised}
            />
          </div>
        ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: "grid",
    gap: 12,
    padding: 12,
    flex: 1,
    height: "100%",
    overflow: "hidden",
    width: "100%",
  },
  cell: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    minHeight: 0,
  },
  sidebarLayout: {
    display: "flex",
    gap: 12,
    padding: 12,
    flex: 1,
    overflow: "hidden",
  },
  sidebarMain: {
    flex: 1,
    minWidth: 0,
    display: "flex",
  },
  sidebarRail: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: 180,
    overflow: "auto",
    flexShrink: 0,
  },
  sidebarTile: {
    flexShrink: 0,
    height: 120,
  },
};
