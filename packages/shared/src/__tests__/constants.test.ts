import { describe, it, expect } from "vitest";
import { SOCKET_EVENTS, ROOM_CONFIG, MEDIA_CONSTRAINTS } from "../constants.js";

describe("SOCKET_EVENTS", () => {
  it("has all required room events", () => {
    expect(SOCKET_EVENTS.CREATE_ROOM).toBe("room:create");
    expect(SOCKET_EVENTS.JOIN_ROOM).toBe("room:join");
    expect(SOCKET_EVENTS.LEAVE_ROOM).toBe("room:leave");
    expect(SOCKET_EVENTS.ROOM_CREATED).toBe("room:created");
    expect(SOCKET_EVENTS.ROOM_JOINED).toBe("room:joined");
  });

  it("has all required signaling events", () => {
    expect(SOCKET_EVENTS.SIGNAL).toBe("signal");
    expect(SOCKET_EVENTS.OFFER).toBe("offer");
    expect(SOCKET_EVENTS.ANSWER).toBe("answer");
    expect(SOCKET_EVENTS.ICE_CANDIDATE).toBe("ice-candidate");
  });

  it("has chat events", () => {
    expect(SOCKET_EVENTS.CHAT_MESSAGE).toBe("chat:message");
    expect(SOCKET_EVENTS.CHAT_HISTORY).toBe("chat:history");
  });
});

describe("ROOM_CONFIG", () => {
  it("has valid code length", () => {
    expect(ROOM_CONFIG.CODE_LENGTH).toBeGreaterThanOrEqual(4);
    expect(ROOM_CONFIG.CODE_LENGTH).toBeLessThanOrEqual(8);
  });

  it("has valid max participants", () => {
    expect(ROOM_CONFIG.MAX_PARTICIPANTS).toBeGreaterThan(0);
    expect(ROOM_CONFIG.MAX_PARTICIPANTS).toBeLessThanOrEqual(50);
  });

  it("code chars are uppercase only (no confusing chars like 0/O/I/1)", () => {
    expect(ROOM_CONFIG.CODE_CHARS).not.toMatch(/[0OI]/);
    expect(ROOM_CONFIG.CODE_CHARS).toBe(ROOM_CONFIG.CODE_CHARS.toUpperCase());
  });
});

describe("MEDIA_CONSTRAINTS", () => {
  it("enables echo cancellation", () => {
    expect(MEDIA_CONSTRAINTS.audio.echoCancellation).toBe(true);
  });

  it("requests HD video", () => {
    const video = MEDIA_CONSTRAINTS.video as { width: { ideal: number } };
    expect(video.width.ideal).toBeGreaterThanOrEqual(720);
  });
});
