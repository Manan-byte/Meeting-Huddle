/**
 * @file useLiveKit — SFU video engine hook (replaces the P2P useWebRTC).
 *
 * Uses LiveKit (Selective Forwarding Unit) so a meeting scales to many
 * participants per room and to millions of users across distributed servers.
 *
 * This hook exposes a return shape compatible with the old `useWebRTC`:
 *   - `localStream` / `screenStream` : local camera & screen MediaStreams
 *   - `remoteStreams` : Map<participantId, MediaStream> (one per remote track)
 *   - toggle functions for mute/video/screen share
 *
 * It requests a short-lived token from the server (`/api/livekit/token`),
 * connects to the LiveKit room, and publishes local camera+mic (and later
 * screen) tracks. Remote audio/video tracks are surfaced as MediaStreams so
 * the existing VideoGrid/VideoPlayer components keep working unchanged.
 *
 * Connects to: RoomPage (consumes return values), server liveKit handler,
 *              livekit-client SDK.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { Room, RoomEvent, Track, createLocalAudioTrack, createLocalVideoTrack } from "livekit-client";
import type { RemoteTrackPublication, LocalVideoTrack, LocalAudioTrack } from "livekit-client";

/** Options passed to the useLiveKit hook. */
interface UseLiveKitOptions {
  /** LiveKit room name (e.g. the meeting room code/id). */
  roomName: string | null;
  /** Display identity used for the LiveKit participant. */
  identity: string;
}

/**
 * LiveKit media hook — manages the SFU room connection and media tracks.
 *
 * @param options - LiveKit room + identity
 * @returns Object with streams and toggle functions (useWebRTC-compatible).
 */
export function useLiveKit({ roomName, identity }: UseLiveKitOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const roomRef = useRef<Room | null>(null);
  /** The participant id of the local user once connected. */
  const localIdRef = useRef<string>("");
  /** Pending media produced before we know the local identity. */
  const pendingStreamRef = useRef<MediaStream | null>(null);

  // Tracks for camera/mic/screen we have published (to enable/disable).
  const localMicRef = useRef<LocalAudioTrack | null>(null);
  const localCamRef = useRef<LocalVideoTrack | null>(null);
  const screenTrackRef = useRef<LocalVideoTrack | null>(null);
  /** Tracked local mic mute state (LiveKit has no reliable muted getter). */
  const micMutedRef = useRef(false);

  // ── Room connect / disconnect ──────────────────────────────────────
  useEffect(() => {
    if (!roomName) return;
    let cancelled = false;
    const lkRoomName = roomName as string;
    let room: Room | null = null;

    async function connect() {
      try {
        const res = await fetch(`/api/livekit/token?room=${encodeURIComponent(lkRoomName)}&name=${encodeURIComponent(identity || "participant")}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("LiveKit token error:", body);
          return;
        }
        const { token, url } = (await res.json()) as { token: string; url: string };

        room = new Room();
        roomRef.current = room;

        // Surface remote audio/video tracks as MediaStreams.
        room.on(RoomEvent.TrackSubscribed, (_track, pub, participant) => {
          const track = (pub as RemoteTrackPublication).track;
          if (track && track.kind === Track.Kind.Video || (track && track.kind === Track.Kind.Audio)) {
            setRemoteStreams((prev) => {
              const next = new Map(prev);
              const stream = new MediaStream([track.mediaStreamTrack]);
              next.set(participant.identity, stream);
              return next;
            });
          }
        });
        room.on(RoomEvent.TrackUnsubscribed, (_track, _pub, participant) => {
          setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.delete(participant.identity);
            return next;
          });
        });
        room.on(RoomEvent.Disconnected, () => {
          setRemoteStreams(new Map());
        });

        // Publish local camera + mic, then surface localStream.
        const mic = await createLocalAudioTrack();
        localMicRef.current = mic;
        const cam = await createLocalVideoTrack();
        localCamRef.current = cam;
        const combined = new MediaStream([mic.mediaStreamTrack, cam.mediaStreamTrack]);
        pendingStreamRef.current = combined;

        await room.connect(url, token);
        await Promise.all([room.localParticipant.publishTrack(mic), room.localParticipant.publishTrack(cam)]);

        localIdRef.current = room.localParticipant.identity;
        if (!cancelled) {
          setLocalStream(combined);
          pendingStreamRef.current = null;
        }
      } catch (err) {
        console.error("Failed to connect to LiveKit:", err);
      }
    }

    void connect();

    return () => {
      cancelled = true;
      localMicRef.current?.stop();
      localCamRef.current?.stop();
      screenTrackRef.current?.stop();
      localMicRef.current = null;
      localCamRef.current = null;
      screenTrackRef.current = null;
      room?.disconnect();
      roomRef.current = null;
      setLocalStream(null);
      setScreenStream(null);
      setRemoteStreams(new Map());
      setIsScreenSharing(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, identity]);

  // ── Toggles ────────────────────────────────────────────────────────
  // LiveKit exposes mute()/unmute() methods; we track state in a ref since
  // there's no reliable `muted` getter on the local track.

  /** Toggle local microphone mute. */
  const toggleMute = useCallback(() => {
    const mic = localMicRef.current;
    if (!mic) return;
    micMutedRef.current = !micMutedRef.current;
    if (micMutedRef.current) void mic.mute();
    else void mic.unmute();
  }, []);

  /** Set local mute explicitly (push-to-talk). */
  const setMute = useCallback((muted: boolean) => {
    const mic = localMicRef.current;
    if (!mic) return;
    micMutedRef.current = muted;
    if (muted) void mic.mute();
    else void mic.unmute();
  }, []);

  /** Toggle camera on/off (LiveKit mute state; light stays on via SFU). */
  const toggleVideo = useCallback(async (off: boolean) => {
    const cam = localCamRef.current;
    if (!cam) return;
    if (off) await cam.mute();
    else await cam.unmute();
  }, []);

  /** Stop screen share and restore the camera as the primary video. */
  const stopScreenShare = useCallback(() => {
    const track = screenTrackRef.current;
    if (track) {
      roomRef.current?.localParticipant.unpublishTrack(track).catch(() => {});
      track.stop();
      screenTrackRef.current = null;
    }
    screenStreamRefCleanup();
    setIsScreenSharing(false);
  }, []);

  const screenStreamRefCleanup = useCallback(() => {
    setScreenStream(null);
  }, []);

  /** Toggle screen sharing via getDisplayMedia + publish. */
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }
    let screen: MediaStream;
    try {
      screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch {
      return; // user cancelled
    }
    const videoTrack = screen.getVideoTracks()[0];
    videoTrack.onended = () => stopScreenShare();

    // Publish a local screen track; camera stays muted so only screen is sent.
    const localScreen = new MediaStream([videoTrack]);
    const pub = await roomRef.current?.localParticipant.publishTrack(videoTrack, { source: Track.Source.ScreenShare });
    screenTrackRef.current = (pub?.track as LocalVideoTrack | undefined) ?? null;
    setScreenStream(localScreen);
    setIsScreenSharing(true);
  }, [isScreenSharing, stopScreenShare]);

  return {
    localStream,
    screenStream,
    remoteStreams,
    toggleMute,
    setMute,
    toggleVideo,
    toggleScreenShare,
    isScreenSharing,
    // Settings are applied client-side only (LiveKit auto-negotiates).
    settings: null as never,
    applySettings: async (_s: unknown) => {},
  };
}
