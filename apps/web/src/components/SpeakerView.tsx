/**
 * @file SpeakerView — speaker-focused video layout.
 *
 * Displays one large "speaker" video with smaller thumbnails on the side.
 * Speaker detection: picks the most recent non-local participant as speaker.
 * Falls back to the local user if no remote participants exist.
 *
 * Used by VideoGrid when layout mode is "speaker".
 *
 * Connects to: VideoGrid (renders when layout === "speaker"),
 *              RoomPage (provides streams and participants),
 *              VideoPlayer (renders each video tile)
 */

import type { User } from "@meet-app/shared";
import { VideoPlayer } from "./VideoPlayer";

interface SpeakerViewProps {
  /** Local camera+mic stream. */
  localStream: MediaStream | null;
  /** Screen share stream — shown in the local tile when screen sharing is active. */
  screenStream: MediaStream | null;
  /** Map of remote peer ID → their MediaStream. */
  remoteStreams: Map<string, MediaStream>;
  /** All participants in the room. */
  participants: User[];
  /** The local user (null before joining). */
  currentUser: User | null;
}

/**
 * Speaker-focused layout with one large video and side thumbnails.
 * The "speaker" is the most recently joined remote participant.
 * When screen sharing, the local tile displays the screen stream.
 */
export function SpeakerView({
  localStream,
  screenStream,
  remoteStreams,
  participants,
  currentUser,
}: SpeakerViewProps) {
  // Pick the most recent non-local participant as "speaker", or fall back to local
  const remoteParticipants = participants.filter((p) => p.id !== currentUser?.id);
  const speaker =
    remoteParticipants.length > 0
      ? remoteParticipants[remoteParticipants.length - 1]
      : currentUser;

  // Get the speaker's MediaStream (local or remote)
  // When screen sharing, the local tile shows screenStream instead of camera
  const speakerStream =
    speaker?.id === currentUser?.id
      ? (screenStream || localStream)
      : remoteStreams.get(speaker?.id ?? "") ?? null;

  // All participants except the speaker (shown as side thumbnails)
  const thumbs = participants.filter((p) => p.id !== speaker?.id);

  return (
    <div style={styles.container}>
      {/* Main speaker video (large, fills available space) */}
      <div style={styles.main}>
        {speaker && (
          <VideoPlayer
            stream={speakerStream}
            name={speaker.name}
            isMuted={speaker.isMuted}
            isVideoOff={speaker.isVideoOff}
            isLocal={speaker.id === currentUser?.id}
            isHandRaised={speaker.isHandRaised}
          />
        )}
      </div>

      {/* Side thumbnails for non-speaker participants */}
      {thumbs.length > 0 && (
        <div style={styles.sidebar}>
          {thumbs.map((p) => (
            <div style={styles.thumb} key={p.id}>
              <VideoPlayer
                stream={
                  p.id === currentUser?.id
                    ? (screenStream || localStream)
                    : remoteStreams.get(p.id) ?? null
                }
                name={p.name}
                isMuted={p.isMuted}
                isVideoOff={p.isVideoOff}
                isLocal={p.id === currentUser?.id}
                isHandRaised={p.isHandRaised}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    gap: 8,
    padding: 8,
    flex: 1,
    overflow: "hidden",
  },
  main: {
    flex: 1,
    display: "flex",
    minHeight: 0,
  },
  sidebar: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: 200,
    overflow: "auto",
  },
  thumb: {
    flexShrink: 0,
    width: 200,
  },
};
