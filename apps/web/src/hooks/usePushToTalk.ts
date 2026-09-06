/**
 * @file usePushToTalk — Discord-style push-to-talk input mode.
 *
 * When enabled, the microphone stays muted and is only unmuted while a
 * hotkey is held down (keyboard) or while the hold-to-talk button is held
 * (mouse/pointer). Releasing the key/button mutes again.
 *
 * Behavior details:
 *   - Ignored while typing in an input/textarea/select/contenteditable so
 *     Space doesn't fight with text entry (e.g. chat).
 *   - Key auto-repeat is ignored (holding a key talks once, not toggling).
 *   - Window blur, unmount, or a mode/hotkey change force the mic back to a
 *     safe (muted) baseline so nobody is left broadcasting accidentally.
 *   - Turning the mode on mutes; turning it off restores an unmuted baseline.
 *
 * Connects to: RoomPage (provides setMute + onMuteChange wiring).
 */

import { useEffect, useRef, useCallback } from "react";

/** Default push-to-talk hotkey. */
export const DEFAULT_PTT_KEY = " ";

/** Human-friendly label for a hotkey (used in tooltips/UI). */
export function formatHotkey(key: string): string {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

interface UsePushToTalkOptions {
  /** Whether push-to-talk mode is currently active. */
  enabled: boolean;
  /** The hotkey that unmutes while held (e.g. " " for Space). */
  hotkey: string;
  /** Set the local microphone mute state (WebRTC track enabled flag). */
  setMute: (muted: boolean) => void;
  /** Notify the room of a mute state change (emit + update local participant). */
  onMuteChange: (muted: boolean) => void;
}

/**
 * Manage push-to-talk state: returns imperative start/stop functions for the
 * hold-to-talk button. Keyboard handling is wired internally to the window.
 *
 * @param options - PTT configuration and mute callbacks
 * @returns startTalking/stopTalking for the hold-to-talk button
 */
export function usePushToTalk({ enabled, hotkey, setMute, onMuteChange }: UsePushToTalkOptions) {
  /** Whether the hotkey/button is currently being held (talking). */
  const holdingRef = useRef(false);
  /** Previous `enabled` value so we only unmute on a real disable (not mount). */
  const wasEnabledRef = useRef(false);

  // Keep the latest values in refs so the (stable) window listeners and the
  // effect below always see current props without re-binding listeners.
  const enabledRef = useRef(enabled);
  const hotkeyRef = useRef(hotkey);
  const setMuteRef = useRef(setMute);
  const onMuteChangeRef = useRef(onMuteChange);

  useEffect(() => {
    enabledRef.current = enabled;
    hotkeyRef.current = hotkey;
    setMuteRef.current = setMute;
    onMuteChangeRef.current = onMuteChange;
  }, [enabled, hotkey, setMute, onMuteChange]);

  /** True when the key press target is a text field (don't hijack typing). */
  const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return (
      tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable
    );
  };

  /** Mute the mic and clear the holding state. Safe to call anytime. */
  const stopTalking = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setMuteRef.current(true);
    onMuteChangeRef.current(true);
  }, []);

  // ── Keyboard hotkey listeners (bound once, read latest values via refs) ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!enabledRef.current || e.repeat) return;
      if (e.key !== hotkeyRef.current) return;
      if (isEditableTarget(e.target)) return;
      if (holdingRef.current) return;
      e.preventDefault(); // stop Space from scrolling / clicking focused buttons
      holdingRef.current = true;
      setMuteRef.current(false);
      onMuteChangeRef.current(false);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== hotkeyRef.current) return;
      stopTalking();
    };
    const onWindowBlur = () => stopTalking();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
      // Clean unmount: ensure the mic is muted so no one is left broadcasting.
      stopTalking();
    };
  }, [stopTalking]);

  // ── Mode/hotkey transitions: reset hold state, adjust baseline mute ──
  useEffect(() => {
    holdingRef.current = false;
    if (enabled) {
      // Entering PTT: start muted (talk only while the key is held).
      setMuteRef.current(true);
      onMuteChangeRef.current(true);
    } else if (wasEnabledRef.current) {
      // Leaving PTT: restore a normal (unmuted) baseline.
      setMuteRef.current(false);
      onMuteChangeRef.current(false);
    }
    wasEnabledRef.current = enabled;
  }, [enabled, hotkey]);

  /** Unmute while held (hold-to-talk button / mouse). */
  const startTalking = useCallback(() => {
    if (!enabledRef.current || holdingRef.current) return;
    holdingRef.current = true;
    setMuteRef.current(false);
    onMuteChangeRef.current(false);
  }, []);

  return { startTalking, stopTalking };
}
