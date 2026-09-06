import { renderHook } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePushToTalk, DEFAULT_PTT_KEY } from "../../hooks/usePushToTalk";

function makeHook(enabled = false, hotkey = DEFAULT_PTT_KEY) {
  const setMute = vi.fn();
  const onMuteChange = vi.fn();
  const hook = renderHook(
    ({ enabled: e, hotkey: h }) => usePushToTalk({ enabled: e, hotkey: h, setMute, onMuteChange }),
    { initialProps: { enabled, hotkey } },
  );
  return { result: hook.result, rerender: hook.rerender, setMute, onMuteChange };
}

function pressKey(key: string, target?: HTMLElement) {
  if (target) {
    fireEvent.keyDown(target, { key }); // bubbles to window; e.target = input
  } else {
    fireEvent.keyDown(window, { key });
  }
}

function releaseKey(key: string) {
  fireEvent.keyUp(window, { key });
}

describe("usePushToTalk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts muted when the mode is enabled", () => {
    const { onMuteChange, setMute } = makeHook(true);
    expect(onMuteChange).toHaveBeenCalledWith(true);
    expect(setMute).toHaveBeenCalledWith(true);
  });

  it("unmutes on key down and mutes again on key up", () => {
    const { result, onMuteChange, setMute } = makeHook(true);

    pressKey(" ");
    expect(onMuteChange).toHaveBeenLastCalledWith(false);
    expect(setMute).toHaveBeenLastCalledWith(false);

    releaseKey(" ");
    expect(onMuteChange).toHaveBeenLastCalledWith(true);
    expect(setMute).toHaveBeenLastCalledWith(true);
    expect(result.current).toBeDefined();
  });

  it("ignores the hotkey while typing in a text field", () => {
    const { onMuteChange } = makeHook(true);
    const input = document.createElement("input");
    document.body.appendChild(input);

    pressKey(" ", input);
    // Only the initial "enabled → muted" call happened; key press was ignored.
    expect(onMuteChange).toHaveBeenCalledTimes(1);
    expect(onMuteChange).toHaveBeenCalledWith(true);

    document.body.removeChild(input);
  });

  it("ignores key auto-repeat (holding a key does not toggle)", () => {
    const { onMuteChange } = makeHook(true);
    // clear the initial enable call
    onMuteChange.mockClear();

    pressKey(" ");
    pressKey(" "); // simulate e.repeat is hard in jsdom; second call would be duplicate
    // We assert the key handler only fired once (holding guard) by checking
    // calls are all unmute (false) — no spurious re-mute/re-unmute cycle.
    const falseCalls = onMuteChange.mock.calls.filter((c) => c[0] === false);
    expect(falseCalls.length).toBe(1);
  });

  it("unmutes/mutes via the startTalking/stopTalking controls", () => {
    const { result, onMuteChange } = makeHook(true);
    onMuteChange.mockClear();

    result.current.startTalking();
    expect(onMuteChange).toHaveBeenLastCalledWith(false);
    result.current.stopTalking();
    expect(onMuteChange).toHaveBeenLastCalledWith(true);
  });

  it("mutes on window blur so nobody is left broadcasting", () => {
    const { onMuteChange } = makeHook(true);
    onMuteChange.mockClear();

    pressKey(" ");
    expect(onMuteChange).toHaveBeenLastCalledWith(false);

    fireEvent.blur(window);
    expect(onMuteChange).toHaveBeenLastCalledWith(true);
  });

  it("returns to an unmuted baseline when the mode is disabled", () => {
    const { rerender, onMuteChange } = makeHook(true);
    onMuteChange.mockClear();

    rerender({ enabled: false, hotkey: DEFAULT_PTT_KEY });
    expect(onMuteChange).toHaveBeenLastCalledWith(false);
  });
});
