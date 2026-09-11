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
import type { LocalVideoTrack, LocalAudioTrack } from "livekit-client";
import { RESOLUTION_PRESETS } from "@meet-app/shared";
import type { MeetingSettings } from "@meet-app/shared";

/** Options passed to the useLiveKit hook. */
interface UseLiveKitOptions {
  /** LiveKit room name (e.g. the meeting room code/id). */
  roomName: string | null;
  /** Display identity used for the LiveKit participant. */
  identity: string;
  /** Adaptive audio: add echo cancellation + auto gain to the mic. */
  adaptiveAudio?: boolean;
}

/**
 * LiveKit media hook — manages the SFU room connection and media tracks.
 *
 * @param options - LiveKit room + identity
 * @returns Object with streams and toggle functions (useWebRTC-compatible).
 */
export function useLiveKit({ roomName, identity, adaptiveAudio = false }: UseLiveKitOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  // Real settings state. SettingsPanel reads `settings.resolution` etc. on
  // mount — returning `null as never` made it throw "Cannot read properties
  // of null" and unmount the whole app whenever Settings was opened.
  const [settings, setSettings] = useState<MeetingSettings>(() => {
    // Carry the background chosen in the PreJoinScreen lobby into the room.
    let prejoin: { backgroundBlur?: boolean; virtualBackground?: string | null } | null = null;
    try {
      const raw = sessionStorage.getItem("huddle_prejoin_settings");
      if (raw) prejoin = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return {
      title: "",
      resolution: "720p",
      audioDevice: "",
      videoDevice: "",
      backgroundBlur: prejoin?.backgroundBlur ?? false,
      virtualBackground: prejoin?.virtualBackground ?? null,
    };
  });
  /** Latest settings, readable from the applySettings callback. */
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

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
  /** Whether noise suppression / echo cancellation is active on the mic. */
  const noiseRef = useRef(false);
  /** Adaptive audio (echo cancellation + auto gain) on the mic. */
  const adaptiveRef = useRef(adaptiveAudio);
  adaptiveRef.current = adaptiveAudio;
  const [noiseSuppression, setNoiseSuppression] = useState(false);
  /** User-facing message when camera/mic/LiveKit fails (shown in RoomPage). */
  const [mediaError, setMediaError] = useState<string | null>(null);

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
          if (!cancelled) setMediaError("Media server unavailable — video/audio may not connect.");
          return;
        }
        const { token, url } = (await res.json()) as { token: string; url: string };

        room = new Room();
        roomRef.current = room;

        // Tracks per remote participant, so a participant's MediaStream carries
        // BOTH audio and video. The naive per-event `new MediaStream([oneTrack])`
        // replaces the stream and silently drops the other track (remote audio
        // never played). We accumulate tracks and rebuild on each change.
        const remoteTracks = new Map<string, MediaStreamTrack[]>();

        room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          const mediaTrack = track?.mediaStreamTrack;
          if (!mediaTrack) return;
          const arr = remoteTracks.get(participant.identity) ?? [];
          if (!arr.includes(mediaTrack)) arr.push(mediaTrack);
          remoteTracks.set(participant.identity, arr);
          setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.set(participant.identity, new MediaStream(arr));
            return next;
          });
        });
        room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
          const mediaTrack = track?.mediaStreamTrack;
          const arr = (remoteTracks.get(participant.identity) ?? []).filter((t) => t !== mediaTrack);
          remoteTracks.set(participant.identity, arr);
          setRemoteStreams((prev) => {
            const next = new Map(prev);
            if (arr.length) next.set(participant.identity, new MediaStream(arr));
            else next.delete(participant.identity);
            return next;
          });
        });
        room.on(RoomEvent.Disconnected, () => {
          remoteTracks.clear();
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
          setMediaError(null);
          pendingStreamRef.current = null;
        }
      } catch (err) {
        console.error("Failed to connect to LiveKit:", err);
        if (!cancelled) {
          const name = err instanceof DOMException ? err.name : String(err);
          let msg = "Camera/microphone unavailable. Check browser permissions and try again.";
          if (name === "NotAllowedError") msg = "Camera & microphone permission was denied. Allow access in your browser, then join again.";
          if (name === "NotFoundError") msg = "No camera or microphone found on this device.";
          if (name === "NotReadableError") msg = "Camera or microphone is in use by another app.";
          if (name === "TimeoutError" || /token|fetch|network|failed/i.test(name)) msg = "Media server unreachable — check your connection and retry.";
          setMediaError(msg);
        }
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
      setMediaError(null);
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

  /** Swap the published camera track for a new device/resolution one. */
  const swapCamera = useCallback(async (deviceId: string | null, resolution: string) => {
    const old = localCamRef.current;
    const room = roomRef.current;
    const preset = RESOLUTION_PRESETS[resolution] ?? RESOLUTION_PRESETS["720p"];
    const constraints = {
      width: { ideal: preset.width },
      height: { ideal: preset.height },
      frameRate: { ideal: preset.frameRate },
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    };
    const cam = await createLocalVideoTrack(constraints);
    if (old) {
      try {
        room?.localParticipant.unpublishTrack(old);
      } catch {
        /* track may already be unpublished */
      }
      old.stop();
    }
    localCamRef.current = cam;
    try {
      await room?.localParticipant.publishTrack(cam);
    } catch (err) {
      console.error("Failed to publish camera track:", err);
    }
    return cam;
  }, []);

  /** Swap the published microphone track for a new device one. */
  const swapMic = useCallback(async (deviceId: string | null, noiseOn?: boolean) => {
    const old = localMicRef.current;
    const room = roomRef.current;
    const useNoise = noiseOn ?? noiseRef.current;
    // Browser-native audio processing (RNNoise engine in Chrome/Edge):
    // noise suppression kills background noise, echo cancellation removes
    // speaker feedback, auto gain keeps levels stable. Zero dependencies.
    const constraints: MediaTrackConstraints = {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      ...(useNoise || adaptiveRef.current
        ? { noiseSuppression: useNoise, echoCancellation: true, autoGainControl: true }
        : {}),
    };
    const mic = await createLocalAudioTrack(constraints);
    if (old) {
      try {
        room?.localParticipant.unpublishTrack(old);
      } catch {
        /* track may already be unpublished */
      }
      old.stop();
    }
    localMicRef.current = mic;
    try {
      await room?.localParticipant.publishTrack(mic);
    } catch (err) {
      console.error("Failed to publish mic track:", err);
    }
    return mic;
  }, []);

  /** Toggle browser-native noise suppression on/off (re-acquires the mic). */
  const toggleNoiseSuppression = useCallback(async () => {
    const next = !noiseRef.current;
    noiseRef.current = next;
    setNoiseSuppression(next);
    try {
      const mic = await swapMic(settingsRef.current.audioDevice || null, next);
      if (mic && localCamRef.current && !screenStream) {
        setLocalStream(new MediaStream([mic.mediaStreamTrack, localCamRef.current.mediaStreamTrack]));
      }
    } catch (err) {
      console.error("Failed to switch noise suppression:", err);
      noiseRef.current = !next;
      setNoiseSuppression(!next);
    }
  }, [swapMic, screenStream]);

  /** Apply new settings: switch camera/mic/resolution for real, keep state. */
  const applySettings = useCallback(
    async (next: MeetingSettings) => {
      const prev = settingsRef.current;
      const camChanged = next.videoDevice !== prev.videoDevice || next.resolution !== prev.resolution;
      const micChanged = next.audioDevice !== prev.audioDevice;
      setSettings(next);

      if (camChanged || micChanged) {
        try {
          const [mic, cam] = await Promise.all([
            micChanged ? swapMic(next.audioDevice || null) : Promise.resolve(localMicRef.current),
            camChanged ? swapCamera(next.videoDevice || null, next.resolution) : Promise.resolve(localCamRef.current),
          ]);
          if (mic && cam && !screenStream) {
            setLocalStream(new MediaStream([mic.mediaStreamTrack, cam.mediaStreamTrack]));
          }
        } catch (err) {
          console.error("Failed to switch media device:", err);
        }
      }
    },
    [swapCamera, swapMic, screenStream],
  );

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

  /** Apply adaptive audio on/off by re-acquiring the mic with the new constraints. */
  const applyAdaptiveAudio = useCallback(
    async (on: boolean) => {
      adaptiveRef.current = on;
      try {
        await swapMic(settingsRef.current.audioDevice || null, noiseRef.current);
      } catch (err) {
        console.error("Failed to apply adaptive audio:", err);
      }
    },
    [swapMic],
  );

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
    settings,
    applySettings,
    noiseSuppression,
    toggleNoiseSuppression,
    applyAdaptiveAudio,
    mediaError,
  };
}
