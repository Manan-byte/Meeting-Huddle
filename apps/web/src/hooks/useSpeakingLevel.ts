/**
 * @file useSpeakingLevel — detect microphone/audio activity in a MediaStream.
 *
 * Uses the Web Audio API (AnalyserNode) to sample the audio level of a stream
 * (local mic or a remote peer's audio). The returned `level` is a 0-255
 * average; `isSpeaking` is true when it exceeds a threshold. This drives the
 * "sound is coming in" indicator on video tiles and the mic button.
 *
 * Connects to: VideoPlayer (tile indicator), ControlBar (mic ring),
 *              RoomPage (local speaking state)
 */

import { useEffect, useMemo, useState } from "react";

/** Level above which we consider the participant speaking (0-255). */
export const SPEAKING_THRESHOLD = 24;

/**
 * Track the audio level of a MediaStream.
 *
 * @param stream - The stream to analyze (local mic or remote peer audio).
 * @returns The current average audio level (0-255) — recomputed several times
 *          per second, not every animation frame.
 */
export function useSpeakingLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);

  const context = useMemo(() => {
    try {
      // Lazily create the context once (it may be suspended until user gesture).
      const ctx = new AudioContext();
      return ctx;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!stream || !context) {
      setLevel(0);
      return;
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setLevel(0);
      return;
    }

    try {
      void context.resume();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;

      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        setLevel(sum / data.length);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(raf);
        try {
          source.disconnect();
          analyser.disconnect();
        } catch {
          /* already closed */
        }
      };
    } catch {
      setLevel(0);
      return;
    }
  }, [stream, context]);

  return level;
}