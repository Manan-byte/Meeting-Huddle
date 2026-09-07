/**
 * @file LiveCaptions — real-time speech-to-text caption overlay.
 *
 * Uses the Web Speech API (SpeechRecognition) to transcribe the local user's
 * speech in real-time. Each transcript segment is:
 *   1. Displayed locally as a subtitle overlay
 *   2. Sent to the server via CAPTION_SEGMENT for broadcast to other participants
 *
 * Supports both interim (draft) and final (committed) transcripts.
 * Only the last 10 segments are displayed to avoid visual clutter.
 *
 * Note: Web Speech API is not available in all browsers (Chrome/Edge preferred).
 *
 * Connects to: RoomPage (provides socket, segments, onSegment callback),
 *              meetingHandlers (server relays final captions to room)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { CaptionSegment } from "@meet-app/shared";
import { SOCKET_EVENTS } from "@meet-app/shared";
import "../styles/LiveCaptions.css";
import type { Socket } from "socket.io-client";

interface LiveCaptionsProps {
  /** Whether live captions are enabled. */
  isEnabled: boolean;
  /** Socket.IO connection. */
  socket: Socket | null;
  /** All caption segments received from the server. */
  segments: CaptionSegment[];
  /** Callback to add a local segment to the display list. */
  onSegment: (segment: CaptionSegment) => void;
  /** Display name of the local user (for segment attribution). */
  userName: string;
  /** Socket ID of the local user (for segment attribution). */
  userId: string;
}

// ── Web Speech API type declarations ──────────────────────────────────────
// The SpeechRecognition API is not part of TypeScript's DOM lib, so we
// declare the minimal surface we use here. `SpeechRecognition` is declared
// as an *interface* (a type), and `SpeechRecognitionConstructor` is the
// matching *value-level* constructor type (`new () => SpeechRecognition`).
// We attach the constructor to `window.SpeechRecognition` /
// `window.webkitSpeechRecognition` so we can call `new` on it at runtime.
// Using `typeof SpeechRecognition` here would fail with TS2693 because an
// interface is not a value.

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

type SpeechRecognitionConstructor = new () => SpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
  }
}

/**
 * Live captions component with real-time speech recognition.
 * Renders a subtitle overlay at the bottom of the video area.
 */
export function LiveCaptions({
  isEnabled,
  socket,
  segments,
  onSegment,
  userName,
  userId,
}: LiveCaptionsProps) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  /** Display segments (limited to last 10 for readability). */
  const [displaySegments, setDisplaySegments] = useState<CaptionSegment[]>([]);

  // Keep only last 10 segments for display (avoid visual clutter)
  useEffect(() => {
    setDisplaySegments(segments.slice(-10));
  }, [segments]);

  /**
   * Initialize and start the Web Speech API recognition.
   * Configures continuous recognition with interim results.
   * Each result is wrapped in a CaptionSegment and sent to the server.
   */
  const startRecognition = useCallback(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI || !isEnabled) return;

    // Stop any existing recognition instance
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;         // Keep listening after each result
    recognition.interimResults = true;     // Include draft (non-final) transcripts
    recognition.lang = "en-US";            // Speech recognition language

    // Handle speech recognition results
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        const isFinal = result.isFinal;

        if (text.trim()) {
          const segment: CaptionSegment = {
            id: `caption-${Date.now()}-${i}`,
            userId,
            userName,
            text,
            timestamp: Date.now(),
            isFinal,
          };

          // Add segment to local display list
          onSegment(segment);

          // Send segment to server for broadcast (finals go to room, interim only to sender)
          if (socket) {
            socket.emit(SOCKET_EVENTS.CAPTION_SEGMENT, segment);
          }
        }
      }
    };

    // Handle recognition errors (ignore "no-speech" which is normal)
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "no-speech") {
        console.warn("Speech recognition error:", event.error);
      }
    };

    // Auto-restart recognition when it ends (if still enabled)
    recognition.onend = () => {
      if (isEnabled) {
        try {
          recognition.start();
        } catch {
          // Already started or other error
        }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      // Already started
    }
  }, [isEnabled, socket, onSegment, userName, userId]);

  // Start/stop recognition based on isEnabled state
  useEffect(() => {
    if (isEnabled) {
      startRecognition();
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    }

    // Cleanup: stop recognition on unmount
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, [isEnabled, startRecognition]);

  // Don't render if disabled or no segments to display
  if (!isEnabled || displaySegments.length === 0) return null;

  return (
    <div className="live-captions">
      {displaySegments.map((seg) => (
        <div key={seg.id} className={`caption-segment ${seg.isFinal ? "final" : "interim"}`}>
          <span className="caption-speaker">{seg.userName}:</span>
          <span className="caption-text">{seg.text}</span>
        </div>
      ))}
    </div>
  );
}
