import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ControlBar } from "../../components/ControlBar";

function renderControlBar(overrides = {}) {
  const defaults = {
    isMuted: false,
    isVideoOff: false,
    isScreenSharing: false,
    showChat: false,
    showParticipants: false,
    onToggleMute: vi.fn(),
    onToggleVideo: vi.fn(),
    onToggleScreenShare: vi.fn(),
    onToggleChat: vi.fn(),
    onToggleParticipants: vi.fn(),
    onLeave: vi.fn(),
    // New feature props
    onToggleSettings: vi.fn(),
    onToggleHandRaise: vi.fn(),
    onToggleInvite: vi.fn(),
    onToggleLayout: vi.fn(),
    onToggleRecord: vi.fn(),
    isHandRaised: false,
    isRecording: false,
    isRecordingPaused: false,
    isHost: false,
    isLocked: false,
    onToggleLock: vi.fn(),
    isDark: false,
    onToggleDark: vi.fn(),
    layout: "grid" as const,
    onToggleReactions: vi.fn(),
    onTogglePolls: vi.fn(),
    onStopRecord: vi.fn(),
    showReactions: false,
    showPolls: false,
    unreadChat: 0,
    isPushToTalk: false,
    onTogglePushToTalk: vi.fn(),
    onPushToTalkStart: vi.fn(),
    onPushToTalkStop: vi.fn(),
    pushToTalkHotkey: " ",
    onPushToTalkHotkeyChange: vi.fn(),
  };
  return { ...defaults, ...overrides };
}

describe("ControlBar", () => {
  it("renders all control buttons", () => {
    const props = renderControlBar();
    render(<ControlBar {...props} />);

    expect(screen.getByTitle("Mute")).toBeInTheDocument();
    expect(screen.getByTitle("Turn off camera")).toBeInTheDocument();
    expect(screen.getByTitle("Share screen")).toBeInTheDocument();
    expect(screen.getByTitle("Chat")).toBeInTheDocument();
    expect(screen.getByTitle("Participants")).toBeInTheDocument();
    expect(screen.getByTitle("Leave")).toBeInTheDocument();
  });

  it("calls onToggleMute when mute button is clicked", async () => {
    const user = userEvent.setup();
    const props = renderControlBar();
    render(<ControlBar {...props} />);

    await user.click(screen.getByTitle("Mute"));
    expect(props.onToggleMute).toHaveBeenCalledOnce();
  });

  it("calls onToggleVideo when video button is clicked", async () => {
    const user = userEvent.setup();
    const props = renderControlBar();
    render(<ControlBar {...props} />);

    await user.click(screen.getByTitle("Turn off camera"));
    expect(props.onToggleVideo).toHaveBeenCalledOnce();
  });

  it("calls onLeave when leave button is clicked", async () => {
    const user = userEvent.setup();
    const props = renderControlBar();
    render(<ControlBar {...props} />);

    await user.click(screen.getByTitle("Leave"));
    expect(props.onLeave).toHaveBeenCalledOnce();
  });

  it("shows MicOff when muted", () => {
    const props = renderControlBar({ isMuted: true });
    render(<ControlBar {...props} />);
    expect(screen.getByTitle("Unmute")).toBeInTheDocument();
  });

  it("renders new feature buttons", () => {
    const props = renderControlBar();
    render(<ControlBar {...props} />);

    expect(screen.getByTitle("More")).toBeInTheDocument();
    expect(screen.getByTitle("Raise hand")).toBeInTheDocument();
    expect(screen.getByTitle("Invite")).toBeInTheDocument();
    expect(screen.getByTitle("Switch to speaker view")).toBeInTheDocument();
    expect(screen.getByTitle("Start recording")).toBeInTheDocument();
  });

  it("calls onToggleSettings when settings button is clicked in the More menu", async () => {
    const user = userEvent.setup();
    const props = renderControlBar();
    render(<ControlBar {...props} />);

    await user.click(screen.getByTitle("More"));
    await user.click(await screen.findByText("Settings"));
    expect(props.onToggleSettings).toHaveBeenCalledOnce();
  });

  it("calls onToggleRecord when record button is clicked", async () => {
    const user = userEvent.setup();
    const props = renderControlBar();
    render(<ControlBar {...props} />);

    await user.click(screen.getByTitle("Start recording"));
    expect(props.onToggleRecord).toHaveBeenCalledOnce();
  });

  it("shows Pause recording when recording", () => {
    const props = renderControlBar({ isRecording: true });
    render(<ControlBar {...props} />);
    expect(screen.getByTitle("Pause recording")).toBeInTheDocument();
  });

  it("shows Resume recording when recording is paused", () => {
    const props = renderControlBar({ isRecording: true, isRecordingPaused: true });
    render(<ControlBar {...props} />);
    expect(screen.getByTitle("Resume recording")).toBeInTheDocument();
  });

  it("shows Lower hand when hand is raised", () => {
    const props = renderControlBar({ isHandRaised: true });
    render(<ControlBar {...props} />);
    expect(screen.getByTitle("Lower hand")).toBeInTheDocument();
  });

  it("hides the lock button for non-hosts", () => {
    const props = renderControlBar({ isHost: false });
    render(<ControlBar {...props} />);
    expect(screen.queryByTitle(/lock room/i)).not.toBeInTheDocument();
  });

  it("shows the lock button for hosts when room is unlocked", () => {
    const props = renderControlBar({ isHost: true, isLocked: false });
    render(<ControlBar {...props} />);
    expect(screen.getByTitle("Lock room")).toBeInTheDocument();
  });

  it("shows the unlock button for hosts when room is locked", () => {
    const props = renderControlBar({ isHost: true, isLocked: true });
    render(<ControlBar {...props} />);
    expect(screen.getByTitle("Unlock room")).toBeInTheDocument();
  });

  it("calls onToggleLock when the lock button is clicked", async () => {
    const user = userEvent.setup();
    const props = renderControlBar({ isHost: true, isLocked: false });
    render(<ControlBar {...props} />);

    await user.click(screen.getByTitle("Lock room"));
    expect(props.onToggleLock).toHaveBeenCalledOnce();
  });

  it("enables push-to-talk via the PTT toggle button", async () => {
    const user = userEvent.setup();
    const props = renderControlBar();
    render(<ControlBar {...props} />);

    await user.click(screen.getByTitle("Enable push to talk"));
    expect(props.onTogglePushToTalk).toHaveBeenCalledOnce();
  });

  it("turns the mic button into a hold-to-talk control when PTT is active", () => {
    const props = renderControlBar({ isPushToTalk: true });
    render(<ControlBar {...props} />);

    const button = screen.getByTitle("Push to talk — hold to talk (Space)");
    expect(button).toBeInTheDocument();
  });

  it("calls start/stop when the hold-to-talk button is held and released", async () => {
    const user = userEvent.setup();
    const props = renderControlBar({ isPushToTalk: true });
    render(<ControlBar {...props} />);

    const button = screen.getByTitle("Push to talk — hold to talk (Space)");
    await user.pointer({ keys: "[MouseLeft>]", target: button });
    expect(props.onPushToTalkStart).toHaveBeenCalledOnce();
    await user.pointer({ keys: "[/MouseLeft]", target: button });
    expect(props.onPushToTalkStop).toHaveBeenCalledOnce();
  });
});
