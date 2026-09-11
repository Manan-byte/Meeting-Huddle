/**
 * @file SettingsPanel — Google Meet-style settings dialog (white modal).
 *
 * Left sidebar: Audio · Video · General · Captions · Reactions.
 * Right content changes per tab. Settings apply instantly (Meet behavior):
 *   - Audio: microphone/speaker devices, Studio sound (noise suppression),
 *     push-to-talk (+hotkey), adaptive audio, output volume.
 *   - Video: camera, send resolution (real via swapCamera presets),
 *     receive resolution (local preference), backgrounds & effects.
 *   - General: diagnostic info, auto picture-in-picture, desktop
 *     notifications, leave empty calls (all persisted preferences wired
 *     in RoomPage except where the platform has no backing feature).
 *   - Captions: meeting language (Web Speech recognition lang), live /
 *     translated captions, caption font size & font (applied to the
 *     LiveCaptions overlay).
 *   - Reactions: show reactions from others, animation, sound,
 *     accessibility announcements.
 *
 * Connects to: RoomPage (props for every setting), useLiveKit.applySettings,
 *              shared constants (RESOLUTION_PRESETS)
 */

import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { X, Mic, Video, Settings as Gear, Captions, Smile, Volume2 } from "lucide-react";
import { RESOLUTION_PRESETS } from "@meet-app/shared";
import type { MeetingSettings } from "@meet-app/shared";
import { formatHotkey } from "../hooks/usePushToTalk";

/** Meet-style light palette for the settings dialog. */
const S = {
  bg: "#ffffff",
  sidebarBg: "#f1f3f4",
  text: "#202124",
  textDim: "#5f6368",
  textMuted: "#80868b",
  accent: "#1a73e8",
  accentBg: "#e8f0fe",
  border: "#dadce0",
  toggleOn: "#1a73e8",
  toggleOff: "#cfd3d6",
  danger: "#ea4335",
};

export type SettingsTab = "audio" | "video" | "general" | "captions" | "reactions";

interface SettingsPanelProps {
  /** Callback to close the settings panel. */
  onClose: () => void;
  /** Initial tab (e.g. the camera chevron opens Video directly). */
  initialTab?: SettingsTab;
  /** Apply device/resolution/background settings (re-acquires media). */
  onApplySettings: (settings: MeetingSettings) => void;
  currentSettings: MeetingSettings;
  // ── Audio ──
  isNoiseSuppression: boolean;
  onToggleNoiseSuppression: () => void;
  isPushToTalk: boolean;
  onTogglePushToTalk: () => void;
  pushToTalkHotkey: string;
  onPushToTalkHotkeyChange: (key: string) => void;
  volume: number;
  onVolumeChange: (v: number) => void;
  // ── Captions ──
  onToggleCaptions: (enabled: boolean) => void;
  captionsMode: "none" | "live" | "translated";
  onCaptionsModeChange: (mode: "none" | "live" | "translated") => void;
  captionLanguage: string;
  onCaptionLanguageChange: (lang: string) => void;
  preferredLanguage: string;
  onPreferredLanguageChange: (lang: string) => void;
  captionFontSize: string;
  captionFont: string;
  onCaptionStyleChange: (style: { fontSize: string; font: string }) => void;
  // ── General ──
  sendDiagnostics: boolean;
  onSendDiagnosticsChange: (v: boolean) => void;
  autoPiP: string;
  onAutoPiPChange: (v: string) => void;
  desktopNotifications: boolean;
  onDesktopNotificationsChange: (v: boolean) => void;
  leaveEmptyCalls: boolean;
  onLeaveEmptyCallsChange: (v: boolean) => void;
  onlyContacts: boolean;
  onOnlyContactsChange: (v: boolean) => void;
  adaptiveAudio: boolean;
  onAdaptiveAudioChange: (v: boolean) => void;
  receiveResolution: string;
  onReceiveResolutionChange: (v: string) => void;
  // ── Reactions ──
  showReactionsFromOthers: boolean;
  onShowReactionsFromOthersChange: (v: boolean) => void;
  reactionAnimation: boolean;
  onReactionAnimationChange: (v: boolean) => void;
  reactionSound: boolean;
  onReactionSoundChange: (v: boolean) => void;
  reactionAccessibility: string;
  onReactionAccessibilityChange: (v: string) => void;
}

/** Languages for the Web Speech API (recognition) + translated captions. */
const LANGUAGES: { code: string; label: string }[] = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "id-ID", label: "Indonesian" },
  { code: "ms-MY", label: "Malay" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "ar-SA", label: "Arabic" },
  { code: "hi-IN", label: "Hindi" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "ru-RU", label: "Russian" },
  { code: "nl-NL", label: "Dutch" },
  { code: "it-IT", label: "Italian" },
  { code: "tr-TR", label: "Turkish" },
  { code: "th-TH", label: "Thai" },
  { code: "vi-VN", label: "Vietnamese" },
];

/** Background swatch options (kept from the old panel). */
const BG_OPTIONS: { label: string; value: string | null; kind: "none" | "blur" | "color" }[] = [
  { label: "None", value: null, kind: "none" },
  { label: "Blur", value: "blur", kind: "blur" },
  { label: "Green", value: "#2d6a4f", kind: "color" },
  { label: "Blue", value: "#1e3a5f", kind: "color" },
  { label: "Red", value: "#8b1a1a", kind: "color" },
  { label: "Purple", value: "#5b2c6f", kind: "color" },
];

const FONT_SIZES = ["Default", "Small", "Medium", "Large"];
const FONTS = ["Default", "Sans-serif", "Serif", "Monospace"];
const AUTOPIP_OPTIONS = ["Always automatically show", "Only while presenting", "Never"];

/**
 * Settings dialog with a left nav and instant-apply controls.
 */
export function SettingsPanel({
  onClose,
  initialTab = "audio",
  onApplySettings,
  currentSettings,
  isNoiseSuppression,
  onToggleNoiseSuppression,
  isPushToTalk,
  onTogglePushToTalk,
  pushToTalkHotkey,
  onPushToTalkHotkeyChange,
  volume,
  onVolumeChange,
  onToggleCaptions,
  captionsMode,
  onCaptionsModeChange,
  captionLanguage,
  onCaptionLanguageChange,
  preferredLanguage,
  onPreferredLanguageChange,
  captionFontSize,
  captionFont,
  onCaptionStyleChange,
  sendDiagnostics,
  onSendDiagnosticsChange,
  autoPiP,
  onAutoPiPChange,
  desktopNotifications,
  onDesktopNotificationsChange,
  leaveEmptyCalls,
  onLeaveEmptyCallsChange,
  onlyContacts,
  onOnlyContactsChange,
  adaptiveAudio,
  onAdaptiveAudioChange,
  receiveResolution,
  onReceiveResolutionChange,
  showReactionsFromOthers,
  onShowReactionsFromOthersChange,
  reactionAnimation,
  onReactionAnimationChange,
  reactionSound,
  onReactionSoundChange,
  reactionAccessibility,
  onReactionAccessibilityChange,
}: SettingsPanelProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [devices, setDevices] = useState<{
    video: MediaDeviceInfo[];
    audio: MediaDeviceInfo[];
    output: MediaDeviceInfo[];
  }>({ video: [], audio: [], output: [] });
  const [showBackgrounds, setShowBackgrounds] = useState(false);
  const [speakerDevice, setSpeakerDevice] = useState("");

  // Enumerate devices once on mount.
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    let cancelled = false;
    navigator.mediaDevices
      .enumerateDevices()
      .then((all) => {
        if (cancelled) return;
        setDevices({
          video: all.filter((d) => d.kind === "videoinput"),
          audio: all.filter((d) => d.kind === "audioinput"),
          output: all.filter((d) => d.kind === "audiooutput"),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /** Play a short tone through the chosen speaker (setSinkId when supported). */
  const testSpeaker = (deviceId: string) => {
    const sampleRate = 8000;
    const seconds = 0.35;
    const n = Math.floor(sampleRate * seconds);
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      samples[i] = Math.sin((2 * Math.PI * 880 * i) / sampleRate) * 0.3;
    }
    // Encode as 16-bit PCM WAV.
    const buffer = new ArrayBuffer(44 + n * 2);
    const view = new DataView(buffer);
    const writeStr = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + n * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, s * 32767, true);
    }
    const url = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    const el = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (deviceId && el.setSinkId) {
      el.setSinkId(deviceId).then(() => audio.play()).catch(() => audio.play());
    } else {
      audio.play();
    }
  };

  /** Apply a partial MeetingSettings change (instant). */
  const patch = (p: Partial<MeetingSettings>) => onApplySettings({ ...currentSettings, ...p });

  const navItems: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "audio", label: "Audio", icon: <Mic size={18} /> },
    { id: "video", label: "Video", icon: <Video size={18} /> },
    { id: "general", label: "General", icon: <Gear size={18} /> },
    { id: "captions", label: "Captions", icon: <Captions size={18} /> },
    { id: "reactions", label: "Reactions", icon: <Smile size={18} /> },
  ];

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div style={styles.header}>
          <h3 style={styles.title}>Settings</h3>
          <button style={styles.closeBtn} onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>

        <div style={styles.body}>
          {/* ── Left sidebar ── */}
          <div style={styles.sidebar}>
            {navItems.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  style={{
                    ...styles.navItem,
                    ...(active ? styles.navItemActive : null),
                  }}
                  onClick={() => setTab(item.id)}
                >
                  <span style={{ color: active ? S.accent : S.textDim }}>{item.icon}</span>
                  <span style={{ color: active ? S.accent : S.text }}>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* ── Right content ── */}
          <div style={styles.content}>
            {tab === "audio" && (
              <>
                <Section label="Microphone">
                  <Select
                    value={currentSettings.audioDevice}
                    onChange={(v) => patch({ audioDevice: v })}
                    options={[
                      { value: "", label: "Default" },
                      ...devices.audio.map((d) => ({ value: d.deviceId, label: d.label || "Microphone" })),
                    ]}
                  />
                </Section>
                <ToggleRow
                  label="Studio sound"
                  desc="Filters out sound from your mic that isn't speech"
                  active={isNoiseSuppression}
                  onToggle={onToggleNoiseSuppression}
                />
                <ToggleRow
                  label="Push to talk"
                  desc="Press and hold spacebar to unmute your mic"
                  active={isPushToTalk}
                  onToggle={onTogglePushToTalk}
                  extra={
                    isPushToTalk ? (
                      <div style={styles.hotkeyRow}>
                        <span style={styles.hotkeyHint}>Hold key</span>
                        <input
                          style={styles.hotkeyInput}
                          value={formatHotkey(pushToTalkHotkey)}
                          readOnly
                          onKeyDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onPushToTalkHotkeyChange(e.key);
                          }}
                          title="Click, then press the key to hold to talk"
                        />
                      </div>
                    ) : undefined
                  }
                />
                <Section label="Speaker">
                  <div style={styles.inlineRow}>
                    <Select
                      value={speakerDevice}
                      onChange={setSpeakerDevice}
                      options={[
                        { value: "", label: "Speakers (Default)" },
                        ...devices.output.map((d) => ({ value: d.deviceId, label: d.label || "Speaker" })),
                      ]}
                    />
                    <button style={styles.testBtn} onClick={() => testSpeaker(speakerDevice)}>
                      Test
                    </button>
                  </div>
                </Section>
                <ToggleRow
                  label="Adaptive audio"
                  desc="Automatically merges your microphone and speakers with nearby devices to avoid audio feedback"
                  active={adaptiveAudio}
                  onToggle={() => onAdaptiveAudioChange(!adaptiveAudio)}
                />
                <Section label="Call control">
                  <div style={styles.volumeRow}>
                    <Volume2 size={16} style={{ color: S.textDim, flexShrink: 0 }} />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={volume}
                      onChange={(e) => onVolumeChange(Number(e.target.value))}
                      style={styles.slider}
                    />
                    <span style={styles.volumePct}>{Math.round(volume * 100)}%</span>
                  </div>
                </Section>
              </>
            )}

            {tab === "video" && (
              <>
                {/* Enhancement notice banner */}
                <div style={styles.banner}>
                  <span style={styles.bannerText}>Video enhancement has moved</span>
                  <button
                    style={styles.bannerLink}
                    onClick={() => setShowBackgrounds((v) => !v)}
                  >
                    {showBackgrounds ? "Hide backgrounds" : "Backgrounds and effects"}
                  </button>
                </div>
                <Section label="Camera">
                  <Select
                    value={currentSettings.videoDevice}
                    onChange={(v) => patch({ videoDevice: v })}
                    options={[
                      { value: "", label: "Default camera" },
                      ...devices.video.map((d) => ({ value: d.deviceId, label: d.label || "Camera" })),
                    ]}
                  />
                </Section>
                <Section label="Send resolution (maximum)">
                  <Select
                    value={currentSettings.resolution}
                    onChange={(v) => patch({ resolution: v as MeetingSettings["resolution"] })}
                    options={[
                      { value: "auto", label: "Auto" },
                      ...Object.keys(RESOLUTION_PRESETS).map((r) => ({ value: r, label: r })),
                    ]}
                  />
                </Section>
                <Section label="Receive resolution (maximum)">
                  <Select
                    value={receiveResolution}
                    onChange={onReceiveResolutionChange}
                    options={[
                      { value: "auto", label: "Auto" },
                      ...Object.keys(RESOLUTION_PRESETS).map((r) => ({ value: r, label: r })),
                    ]}
                  />
                </Section>
                <Section label="Backgrounds and effects">
                  <div style={styles.bgRow}>
                    {BG_OPTIONS.map((opt) => {
                      const selected =
                        opt.kind === "none"
                          ? !currentSettings.backgroundBlur && !currentSettings.virtualBackground
                          : opt.kind === "blur"
                            ? currentSettings.backgroundBlur
                            : !currentSettings.backgroundBlur &&
                              currentSettings.virtualBackground === opt.value;
                      return (
                        <button
                          key={opt.label}
                          style={{
                            ...styles.bgOption,
                            outline: selected ? `2px solid ${S.accent}` : "2px solid transparent",
                          }}
                          onClick={() => {
                            if (opt.kind === "blur") patch({ backgroundBlur: true, virtualBackground: null });
                            else patch({ backgroundBlur: false, virtualBackground: opt.value });
                          }}
                          title={opt.label}
                        >
                          <span
                            style={{
                              ...styles.bgSwatch,
                              background:
                                opt.kind === "color"
                                  ? (opt.value as string)
                                  : opt.kind === "blur"
                                    ? "linear-gradient(135deg, #2a2f2b 0%, #565d57 100%)"
                                    : "#e8eaed",
                            }}
                          />
                          <span style={styles.bgLabel}>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <label style={styles.uploadBtn}>
                    Upload image
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === "string") {
                            patch({ backgroundBlur: false, virtualBackground: reader.result });
                          }
                        };
                        reader.readAsDataURL(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </Section>
              </>
            )}

            {tab === "general" && (
              <>
                <ToggleRow
                  label="Send additional diagnostic info to Google"
                  desc="Google uses these system logs to make Meet better for everyone"
                  active={sendDiagnostics}
                  onToggle={() => onSendDiagnosticsChange(!sendDiagnostics)}
                />
                <LabeledControl label="Automatic picture-in-picture" desc="Select when you want picture-in-picture to automatically show">
                  <Select
                    value={autoPiP}
                    onChange={onAutoPiPChange}
                    options={AUTOPIP_OPTIONS.map((o) => ({ value: o, label: o }))}
                  />
                </LabeledControl>
                <ToggleRow
                  label="Desktop notifications"
                  desc="Huddle can show desktop notifications to let you answer incoming video calls and take other actions"
                  active={desktopNotifications}
                  onToggle={() => {
                    if (!desktopNotifications) {
                      // Request permission at the moment the user flips it on.
                      if ("Notification" in window && Notification.permission === "default") {
                        void Notification.requestPermission();
                      }
                    }
                    onDesktopNotificationsChange(!desktopNotifications);
                  }}
                />
                <ToggleRow
                  label="Leave empty calls"
                  desc="Removes you from a call after a few minutes if no one else joins"
                  active={leaveEmptyCalls}
                  onToggle={() => onLeaveEmptyCallsChange(!leaveEmptyCalls)}
                />
                <ToggleRow
                  label="Only contacts can call me"
                  desc="People you've interacted with before can call you"
                  active={onlyContacts}
                  onToggle={() => onOnlyContactsChange(!onlyContacts)}
                />
              </>
            )}

            {tab === "captions" && (
              <>
                <LabeledControl label="Language of the meeting">
                  <Select
                    value={captionLanguage}
                    onChange={onCaptionLanguageChange}
                    options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                  />
                </LabeledControl>
                <div style={styles.radioGroup}>
                  <RadioRow
                    label="No captions"
                    desc=""
                    checked={captionsMode === "none"}
                    onChange={() => { onCaptionsModeChange("none"); onToggleCaptions(false); }}
                  />
                  <RadioRow
                    label="Live captions"
                    desc="Shows you captions for speech in the language of the meeting"
                    checked={captionsMode === "live"}
                    onChange={() => { onCaptionsModeChange("live"); onToggleCaptions(true); }}
                  />
                  <RadioRow
                    label="Translated captions"
                    desc="Select your preferred language. When someone speaks in a different language, captions appear in your preferred language."
                    checked={captionsMode === "translated"}
                    onChange={() => { onCaptionsModeChange("translated"); onToggleCaptions(true); }}
                  />
                </div>
                {captionsMode === "translated" && (
                  <LabeledControl label="Your preferred language">
                    <Select
                      value={preferredLanguage}
                      onChange={onPreferredLanguageChange}
                      options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                    />
                  </LabeledControl>
                )}
                <div style={styles.customizeBlock}>
                  <span style={styles.customizeTitle}>CUSTOMIZE YOUR CAPTIONS</span>
                  <span style={styles.customizeDesc}>
                    Choose your preferred settings to set how captions appear during your calls
                  </span>
                  <div style={styles.customizeRow}>
                    <LabeledControl label="Font size" compact>
                      <Select
                        value={captionFontSize}
                        onChange={(v) => onCaptionStyleChange({ fontSize: v, font: captionFont })}
                        options={FONT_SIZES.map((f) => ({ value: f, label: f }))}
                      />
                    </LabeledControl>
                    <LabeledControl label="Font" compact>
                      <Select
                        value={captionFont}
                        onChange={(v) => onCaptionStyleChange({ fontSize: captionFontSize, font: v })}
                        options={FONTS.map((f) => ({ value: f, label: f }))}
                      />
                    </LabeledControl>
                  </div>
                </div>
              </>
            )}

            {tab === "reactions" && (
              <>
                <ToggleRow
                  label="Show reactions from others"
                  desc="When off, your own reactions still appear"
                  active={showReactionsFromOthers}
                  onToggle={() => onShowReactionsFromOthersChange(!showReactionsFromOthers)}
                />
                <ToggleRow
                  label="Animation"
                  desc="Reactions move on the screen"
                  active={reactionAnimation}
                  onToggle={() => onReactionAnimationChange(!reactionAnimation)}
                />
                <ToggleRow
                  label="Sound"
                  desc="Sound can accompany reactions"
                  active={reactionSound}
                  onToggle={() => onReactionSoundChange(!reactionSound)}
                />
                <LabeledControl label="Accessibility" desc="Select how you want to hear reactions if you are using a screen reader">
                  <Select
                    value={reactionAccessibility}
                    onChange={onReactionAccessibilityChange}
                    options={[
                      "Don't announce reactions",
                      "Announce all reactions",
                      "Announce reactions you're mentioned in",
                    ].map((o) => ({ value: o, label: o }))}
                  />
                </LabeledControl>
                <span style={styles.shortcutHint}>You can also press Shift + R to change how you hear reactions</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small building blocks ───────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <span style={styles.sectionLabelBlue}>{label}</span>
      <div style={styles.sectionBody}>{children}</div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select style={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function ToggleRow({
  label,
  desc,
  active,
  onToggle,
  extra,
}: {
  label: string;
  desc?: string;
  active: boolean;
  onToggle: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div style={styles.toggleRow}>
      <div style={styles.toggleText}>
        <span style={styles.toggleLabel}>{label}</span>
        {desc && <span style={styles.toggleDesc}>{desc}</span>}
        {extra}
      </div>
      <button
        role="switch"
        aria-checked={active}
        style={{
          ...styles.switch,
          background: active ? S.toggleOn : S.toggleOff,
        }}
        onClick={onToggle}
        title={label}
      >
        <span
          style={{
            ...styles.switchThumb,
            transform: active ? "translateX(16px)" : "translateX(0)",
          }}
        >
          {active ? "✓" : "✕"}
        </span>
      </button>
    </div>
  );
}

function LabeledControl({
  label,
  desc,
  children,
  compact,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div style={styles.labeled}>
      <div style={styles.labeledText}>
        <span style={styles.toggleLabel}>{label}</span>
        {desc && <span style={styles.toggleDesc}>{desc}</span>}
      </div>
      <div style={{ width: compact ? 150 : "100%", maxWidth: 320 }}>{children}</div>
    </div>
  );
}

function RadioRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button style={styles.radioRow} onClick={onChange}>
      <span
        style={{
          ...styles.radioOuter,
          borderColor: checked ? S.accent : S.textMuted,
        }}
      >
        {checked && <span style={styles.radioInner} />}
      </span>
      <span style={styles.radioText}>
        <span style={{ ...styles.toggleLabel, color: checked ? S.accent : S.text }}>{label}</span>
        {desc && <span style={styles.toggleDesc}>{desc}</span>}
      </span>
    </button>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    background: S.bg,
    borderRadius: 12,
    width: 720,
    maxWidth: "94vw",
    height: "min(680px, 88vh)",
    boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 22px 14px",
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 500,
    color: S.text,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    color: S.text,
    cursor: "pointer",
  },
  body: {
    flex: 1,
    display: "flex",
    minHeight: 0,
  },
  sidebar: {
    width: 200,
    flexShrink: 0,
    background: S.sidebarBg,
    padding: "8px 0",
    borderRight: `1px solid ${S.border}`,
    overflowY: "auto",
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
    padding: "12px 20px",
    background: "transparent",
    border: "none",
    fontSize: 14,
    fontWeight: 500,
    textAlign: "left",
    cursor: "pointer",
  },
  navItemActive: {
    background: S.accentBg,
  },
  content: {
    flex: 1,
    padding: "8px 28px 28px",
    overflowY: "auto",
  },
  section: {
    marginTop: 18,
  },
  sectionLabelBlue: {
    display: "block",
    fontSize: 14,
    fontWeight: 600,
    color: S.accent,
    marginBottom: 8,
  },
  sectionBody: {
    marginBottom: 6,
  },
  select: {
    width: "100%",
    maxWidth: 360,
    padding: "10px 12px",
    fontSize: 14,
    color: S.text,
    background: S.bg,
    border: `1px solid ${S.border}`,
    borderRadius: 8,
    outline: "none",
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
    padding: "16px 0",
    borderBottom: `1px solid ${S.border}`,
  },
  toggleText: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: 500,
    color: S.text,
  },
  toggleDesc: {
    fontSize: 12.5,
    color: S.textDim,
    lineHeight: 1.45,
  },
  switch: {
    width: 38,
    height: 22,
    borderRadius: 999,
    border: "none",
    padding: 0,
    position: "relative",
    flexShrink: 0,
    cursor: "pointer",
  },
  switchThumb: {
    position: "absolute",
    top: 3,
    left: 3,
    width: 16,
    height: 16,
    borderRadius: "50%",
    background: "#fff",
    color: "#5f6368",
    fontSize: 9,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "transform 160ms cubic-bezier(0.28,0,0.22,1)",
    lineHeight: 1,
  },
  hotkeyRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  hotkeyHint: {
    fontSize: 12,
    color: S.textDim,
  },
  hotkeyInput: {
    width: 90,
    padding: "6px 10px",
    fontSize: 13,
    textAlign: "center",
    border: `1px solid ${S.border}`,
    borderRadius: 8,
    background: S.bg,
    color: S.text,
    outline: "none",
  },
  inlineRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  testBtn: {
    padding: "9px 18px",
    fontSize: 14,
    fontWeight: 500,
    color: S.accent,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  volumeRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  slider: {
    flex: 1,
    maxWidth: 280,
    accentColor: S.accent,
  },
  volumePct: {
    fontSize: 13,
    color: S.textDim,
    minWidth: 40,
  },
  banner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    background: S.accentBg,
    borderRadius: 8,
    padding: "10px 14px",
    marginTop: 12,
  },
  bannerText: {
    fontSize: 13,
    color: S.text,
  },
  bannerLink: {
    fontSize: 13,
    fontWeight: 600,
    color: S.accent,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  bgRow: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: 8,
    marginBottom: 10,
  },
  bgOption: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "8px 4px",
    background: "transparent",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    outlineOffset: 2,
  },
  bgSwatch: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    display: "block",
    border: `1px solid ${S.border}`,
  },
  bgLabel: {
    fontSize: 11,
    color: S.textDim,
  },
  uploadBtn: {
    display: "inline-block",
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 500,
    color: S.accent,
    border: `1px solid ${S.border}`,
    borderRadius: 8,
    cursor: "pointer",
  },
  labeled: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "14px 0",
    borderBottom: `1px solid ${S.border}`,
  },
  labeledText: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
  },
  radioGroup: {
    display: "flex",
    flexDirection: "column",
    padding: "10px 0",
  },
  radioRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "10px 0",
    background: "transparent",
    border: "none",
    textAlign: "left",
    cursor: "pointer",
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    border: "2px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: S.accent,
  },
  radioText: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  customizeBlock: {
    marginTop: 8,
    paddingTop: 16,
  },
  customizeTitle: {
    display: "block",
    fontSize: 13,
    fontWeight: 700,
    color: S.text,
    letterSpacing: "0.02em",
  },
  customizeDesc: {
    display: "block",
    fontSize: 12.5,
    color: S.textDim,
    marginTop: 2,
    marginBottom: 10,
  },
  customizeRow: {
    display: "flex",
    gap: 24,
  },
  shortcutHint: {
    display: "block",
    fontSize: 12.5,
    color: S.textDim,
    marginTop: 12,
  },
};