import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ControlBar } from "../../components/ControlBar";

function renderControlBar(overrides: Record<string, unknown> = {}) {
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
    onToggleSettings: vi.fn(),
    onToggleHandRaise: vi.fn(),
    onToggleInvite: vi.fn(),
    onToggleLayout: vi.fn(),
    onToggleFullscreen: vi.fn(),
    onTogglePiP: vi.fn(),
    onOpenBackgrounds: vi.fn(),
    onOpenCameraOptions: vi.fn(),
    onReport: vi.fn(),
    onHelp: vi.fn(),
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
    isCaptionsEnabled: false,
    onToggleCaptions: vi.fn(),
    onMuteAll: vi.fn(),
  };
  return { ...defaults, ...overrides };
}

/** Open the More menu (right ⋮ button titled "More options"). */
async function openMore(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTitle("More options"));
}

describe("ControlBar", () => {
  it("renders all control buttons in the Meet layout", () => {
    const props = renderControlBar();
    render(<ControlBar {...props} />);

    expect(screen.getByTitle("Mute")).toBeInTheDocument();
    expect(screen.getByTitle("Turn off camera")).toBeInTheDocument();
    expect(screen.getByTitle("Share screen")).toBeInTheDocument();
    expect(screen.getByTitle("Reactions")).toBeInTheDocument();
    expect(screen.getByTitle("Captions")).toBeInTheDocument();
    expect(screen.getByTitle("Raise hand")).toBeInTheDocument();
    expect(screen.getByTitle("More options")).toBeInTheDocument();
    // Single More trigger — no duplicate menu button on the left
    expect(screen.queryByTitle("More")).not.toBeInTheDocument();
    expect(screen.getByTitle("Leave")).toBeInTheDocument();
  });

  it("renders the right rail with Chat and People", () => {
    const props = renderControlBar();
    render(<ControlBar {...props} />);
    expect(screen.getByTitle("Chat")).toBeInTheDocument();
    expect(screen.getByTitle("People")).toBeInTheDocument();
  });

  it("shows the unread chat badge on the rail button", () => {
    const props = renderControlBar({ unreadChat: 3 });
    render(<ControlBar {...props} />);
    expect(screen.getByText("3")).toBeInTheDocument();
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

  it("calls onToggleReactions and onToggleCaptions from the bar", async () => {
    const user = userEvent.setup();
    const props = renderControlBar();
    render(<ControlBar {...props} />);

    await user.click(screen.getByTitle("Reactions"));
    expect(props.onToggleReactions).toHaveBeenCalledOnce();

    await user.click(screen.getByTitle("Captions"));
    expect(props.onToggleCaptions).toHaveBeenCalledOnce();
  });

  it("opens Settings from the More menu", async () => {
    const user = userEvent.setup();
    const props = renderControlBar();
    render(<ControlBar {...props} />);

    await openMore(user);
    await user.click(await screen.findByText("Settings"));
    expect(props.onToggleSettings).toHaveBeenCalledOnce();
  });

  it("opens Adjust view from the More menu", async () => {
    const user = userEvent.setup();
    const props = renderControlBar();
    render(<ControlBar {...props} />);

    await openMore(user);
    await user.click(await screen.findByText("Adjust view"));
    expect(props.onToggleLayout).toHaveBeenCalledOnce();
  });

  it("opens Full screen and picture-in-picture from the More menu", async () => {
    const user = userEvent.setup();
    const props = renderControlBar();
    render(<ControlBar {...props} />);

    await openMore(user);
    await user.click(await screen.findByText("Full screen"));
    expect(props.onToggleFullscreen).toHaveBeenCalledOnce();

    await openMore(user);
    await user.click(await screen.findByText("Open picture-in-picture"));
    expect(props.onTogglePiP).toHaveBeenCalledOnce();
  });

  it("opens Backgrounds and effects from the More menu", async () => {
    const user = userEvent.setup();
    const props = renderControlBar();
    render(<ControlBar {...props} />);

    await openMore(user);
    await user.click(await screen.findByText("Backgrounds and effects"));
    expect(props.onOpenBackgrounds).toHaveBeenCalledOnce();
  });

  it("opens the help dialog from the More menu", async () => {
    const user = userEvent.setup();
    const props = renderControlBar();
    render(<ControlBar {...props} />);

    await openMore(user);
    await user.click(await screen.findByText("Troubleshooting & help"));
    expect(props.onHelp).toHaveBeenCalledOnce();
  });

  it("reports a problem from the More menu", async () => {
    const user = userEvent.setup();
    const props = renderControlBar();
    render(<ControlBar {...props} />);

    await openMore(user);
    await user.click(await screen.findByText("Report a problem"));
    expect(props.onReport).toHaveBeenCalledWith("problem");
  });

  it("reports abuse from the More menu", async () => {
    const user = userEvent.setup();
    const props = renderControlBar();
    render(<ControlBar {...props} />);

    await openMore(user);
    await user.click(await screen.findByText("Report abuse"));
    expect(props.onReport).toHaveBeenCalledWith("abuse");
  });

  it("shows Recording unavailable for non-hosts in the More menu", async () => {
    const user = userEvent.setup();
    const props = renderControlBar({ isHost: false });
    render(<ControlBar {...props} />);

    await openMore(user);
    expect(await screen.findByText("Recording unavailable")).toBeInTheDocument();
    expect(screen.getByText("You're not allowed to record this video call")).toBeInTheDocument();
  });

  it("starts recording from the More menu as host", async () => {
    const user = userEvent.setup();
    const props = renderControlBar({ isHost: true });
    render(<ControlBar {...props} />);

    await openMore(user);
    await user.click(await screen.findByTitle("Start recording"));
    expect(props.onToggleRecord).toHaveBeenCalledOnce();
  });

  it("shows Pause / Stop recording for a host while recording", async () => {
    const user = userEvent.setup();
    const props = renderControlBar({ isHost: true, isRecording: true });
    render(<ControlBar {...props} />);

    await openMore(user);
    expect(await screen.findByTitle("Pause recording")).toBeInTheDocument();
    expect(screen.getByTitle("Stop recording")).toBeInTheDocument();
  });

  it("shows Lower hand when hand is raised", () => {
    const props = renderControlBar({ isHandRaised: true });
    render(<ControlBar {...props} />);
    expect(screen.getByTitle("Lower hand")).toBeInTheDocument();
  });

  it("hides the lock action for non-hosts", async () => {
    const user = userEvent.setup();
    const props = renderControlBar({ isHost: false });
    render(<ControlBar {...props} />);

    await openMore(user);
    expect(await screen.findByText("Invite")).toBeInTheDocument();
    expect(screen.queryByText("Lock room")).not.toBeInTheDocument();
  });

  it("locks the room from the More menu as host", async () => {
    const user = userEvent.setup();
    const props = renderControlBar({ isHost: true, isLocked: false });
    render(<ControlBar {...props} />);

    await openMore(user);
    await user.click(await screen.findByText("Lock room"));
    expect(props.onToggleLock).toHaveBeenCalledOnce();
  });

  it("mutes all participants from the More menu as host", async () => {
    const user = userEvent.setup();
    const props = renderControlBar({ isHost: true });
    render(<ControlBar {...props} />);

    await openMore(user);
    await user.click(await screen.findByText("Mute all participants"));
    expect(props.onMuteAll).toHaveBeenCalledOnce();
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