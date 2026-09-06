import { describe, it, expect, beforeEach } from "vitest";
import { RoomManager } from "./RoomManager.js";
import { ROOM_CONFIG } from "@meet-app/shared";

describe("RoomManager", () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  describe("createRoom", () => {
    it("creates a room with a 6-character code", () => {
      const room = manager.createRoom("host-1", "Alice");
      expect(room.code).toHaveLength(ROOM_CONFIG.CODE_LENGTH);
      expect(room.code).toMatch(new RegExp(`^[${ROOM_CONFIG.CODE_CHARS}]+$`));
    });

    it("sets the host correctly", () => {
      const room = manager.createRoom("host-1", "Alice");
      expect(room.hostId).toBe("host-1");
      expect(room.participants).toHaveLength(1);
      expect(room.participants[0].isHost).toBe(true);
      expect(room.participants[0].name).toBe("Alice");
    });

    it("initializes meetingTitle as empty string", () => {
      const room = manager.createRoom("host-1", "Alice");
      expect(room.meetingTitle).toBe("");
    });

    it("initializes recording as null", () => {
      const room = manager.createRoom("host-1", "Alice");
      expect(room.recording).toBeNull();
    });

    it("initializes host isHandRaised as false", () => {
      const room = manager.createRoom("host-1", "Alice");
      expect(room.participants[0].isHandRaised).toBe(false);
    });
    it("initializes startedAt as a number", () => {
      const room = manager.createRoom("host-1", "Alice");
      expect(room.startedAt).toBeGreaterThan(0);
    });

    it("initializes waitingRoom as empty array", () => {
      const room = manager.createRoom("host-1", "Alice");
      expect(room.waitingRoom).toEqual([]);
    });
  });

  describe("joinRoom", () => {
    it("adds a participant to an existing room", () => {
      const room = manager.createRoom("host-1", "Alice");
      const joined = manager.joinRoom(room.code, "user-2", "Bob");
      expect(joined.participants).toHaveLength(2);
      expect(joined.participants[1].name).toBe("Bob");
      expect(joined.participants[1].isHost).toBe(false);
    });

    it("throws on invalid code", () => {
      expect(() => manager.joinRoom("ZZZZZZ", "user-2", "Bob")).toThrow(
        "Room not found"
      );
    });

    it("throws when room is full", () => {
      const room = manager.createRoom("host-1", "Alice");
      for (let i = 2; i <= ROOM_CONFIG.MAX_PARTICIPANTS; i++) {
        manager.joinRoom(room.code, `user-${i}`, `User${i}`);
      }
      expect(() =>
        manager.joinRoom(room.code, "overflow", "Overflow")
      ).toThrow("Room is full");
    });

    it("throws when room is locked", () => {
      const room = manager.createRoom("host-1", "Alice");
      manager.toggleLock(room.id, "host-1");
      expect(() =>
        manager.joinRoom(room.code, "user-2", "Bob")
      ).toThrow("Room is locked");
    });

    it("initializes isHandRaised as false for new participant", () => {
      const room = manager.createRoom("host-1", "Alice");
      const joined = manager.joinRoom(room.code, "user-2", "Bob");
      expect(joined.participants[1].isHandRaised).toBe(false);
    });
  });

  describe("leaveRoom", () => {
    it("removes a participant", () => {
      const room = manager.createRoom("host-1", "Alice");
      manager.joinRoom(room.code, "user-2", "Bob");
      const result = manager.leaveRoom(room.code, "user-2");
      expect(result).not.toBeNull();
      expect(result!.participants).toHaveLength(1);
      expect(result!.participants[0].id).toBe("host-1");
    });

    it("transfers host to next participant when host leaves", () => {
      const room = manager.createRoom("host-1", "Alice");
      manager.joinRoom(room.code, "user-2", "Bob");
      const result = manager.leaveRoom(room.code, "host-1");
      expect(result).not.toBeNull();
      expect(result!.hostId).toBe("user-2");
      expect(result!.participants[0].isHost).toBe(true);
    });

    it("deletes room when empty", () => {
      const room = manager.createRoom("host-1", "Alice");
      const result = manager.leaveRoom(room.code, "host-1");
      expect(result).toBeNull();
      expect(manager.getRoom(room.code)).toBeNull();
    });
  });

  describe("toggleMute", () => {
    it("flips isMuted", () => {
      const room = manager.createRoom("host-1", "Alice");
      const user = manager.toggleMute(room.id, "host-1");
      expect(user.isMuted).toBe(true);
      const user2 = manager.toggleMute(room.id, "host-1");
      expect(user2.isMuted).toBe(false);
    });
  });

  describe("toggleVideo", () => {
    it("flips isVideoOff", () => {
      const room = manager.createRoom("host-1", "Alice");
      const user = manager.toggleVideo(room.id, "host-1");
      expect(user.isVideoOff).toBe(true);
      const user2 = manager.toggleVideo(room.id, "host-1");
      expect(user2.isVideoOff).toBe(false);
    });
  });

  describe("toggleLock", () => {
    it("only works for host", () => {
      const room = manager.createRoom("host-1", "Alice");
      manager.joinRoom(room.code, "user-2", "Bob");
      manager.toggleLock(room.id, "host-1");
      const updated = manager.getRoom(room.code);
      expect(updated!.isLocked).toBe(true);
      expect(() => manager.toggleLock(room.id, "user-2")).toThrow(
        "Only host can lock room"
      );
    });
  });

  describe("sendMessage", () => {
    it("stores and returns a message", () => {
      const room = manager.createRoom("host-1", "Alice");
      const msg = manager.sendMessage(room.id, "host-1", "Alice", "Hello!");
      expect(msg.text).toBe("Hello!");
      expect(msg.senderName).toBe("Alice");
      expect(msg.id).toBeDefined();
    });
  });

  describe("getChatHistory", () => {
    it("returns all messages for a room", () => {
      const room = manager.createRoom("host-1", "Alice");
      manager.sendMessage(room.id, "host-1", "Alice", "Hello!");
      manager.sendMessage(room.id, "host-1", "Alice", "World!");
      const history = manager.getChatHistory(room.id);
      expect(history).toHaveLength(2);
      expect(history[0].text).toBe("Hello!");
      expect(history[1].text).toBe("World!");
    });
  });

  describe("setMeetingTitle", () => {
    it("sets the meeting title as host", () => {
      const room = manager.createRoom("host-1", "Alice");
      const updated = manager.setMeetingTitle(room.id, "host-1", "Sprint Planning");
      expect(updated.meetingTitle).toBe("Sprint Planning");
    });

    it("throws if non-host tries to set title", () => {
      const room = manager.createRoom("host-1", "Alice");
      manager.joinRoom(room.code, "user-2", "Bob");
      expect(() =>
        manager.setMeetingTitle(room.id, "user-2", "Hacked")
      ).toThrow("Only host can set meeting title");
    });
  });

  describe("toggleHandRaise", () => {
    it("flips isHandRaised for a user", () => {
      const room = manager.createRoom("host-1", "Alice");
      const user = manager.toggleHandRaise(room.id, "host-1");
      expect(user.isHandRaised).toBe(true);
      const user2 = manager.toggleHandRaise(room.id, "host-1");
      expect(user2.isHandRaised).toBe(false);
    });

    it("works for non-host participants", () => {
      const room = manager.createRoom("host-1", "Alice");
      manager.joinRoom(room.code, "user-2", "Bob");
      const user = manager.toggleHandRaise(room.id, "user-2");
      expect(user.isHandRaised).toBe(true);
      expect(user.name).toBe("Bob");
    });
  });

  describe("toggleRecording", () => {
    it("starts recording as host", () => {
      const room = manager.createRoom("host-1", "Alice");
      const recording = manager.toggleRecording(room.id, "host-1");
      expect(recording.isRecording).toBe(true);
      expect(recording.startedBy).toBe("host-1");
      expect(recording.startedAt).toBeDefined();
    });

    it("stops recording when called again by host", () => {
      const room = manager.createRoom("host-1", "Alice");
      manager.toggleRecording(room.id, "host-1");
      const recording = manager.toggleRecording(room.id, "host-1");
      expect(recording.isRecording).toBe(false);
    });

    it("throws if non-host tries to toggle recording", () => {
      const room = manager.createRoom("host-1", "Alice");
      manager.joinRoom(room.code, "user-2", "Bob");
      expect(() =>
        manager.toggleRecording(room.id, "user-2")
      ).toThrow("Only host can toggle recording");
    });
  });

  describe("getRecordingState", () => {
    it("returns null when not recording", () => {
      const room = manager.createRoom("host-1", "Alice");
      expect(manager.getRecordingState(room.id)).toBeNull();
    });

    it("returns recording state when recording", () => {
      const room = manager.createRoom("host-1", "Alice");
      manager.toggleRecording(room.id, "host-1");
      const state = manager.getRecordingState(room.id);
      expect(state).not.toBeNull();
      expect(state!.isRecording).toBe(true);
    });
  });

  describe("waiting room", () => {
    it("adds user to waiting room when locked", () => {
      const room = manager.createRoom("host-1", "Alice");
      manager.toggleLock(room.id, "host-1");
      manager.addToWaitingRoom(room.code, "user-2", "Bob");
      expect(room.waitingRoom).toContain("user-2");
    });

    it("admits user from waiting room", () => {
      const room = manager.createRoom("host-1", "Alice");
      manager.toggleLock(room.id, "host-1");
      manager.addToWaitingRoom(room.code, "user-2", "Bob");
      const user = manager.admitFromWaitingRoom(room.code, "user-2");
      expect(user.name).toBe("Bob");
      expect(room.participants).toHaveLength(2);
      expect(room.waitingRoom).not.toContain("user-2");
    });

    it("removes user from waiting room", () => {
      const room = manager.createRoom("host-1", "Alice");
      manager.toggleLock(room.id, "host-1");
      manager.addToWaitingRoom(room.code, "user-2", "Bob");
      manager.removeFromWaitingRoom(room.code, "user-2");
      expect(room.waitingRoom).not.toContain("user-2");
    });

    it("throws when admitting non-waiting user", () => {
      const room = manager.createRoom("host-1", "Alice");
      manager.toggleLock(room.id, "host-1");
      expect(() => manager.admitFromWaitingRoom(room.code, "nobody")).toThrow("User not in waiting room");
    });

    it("getWaitingUsers returns WaitingUser objects with names, not raw IDs", () => {
      const room = manager.createRoom("host-1", "Alice");
      manager.toggleLock(room.id, "host-1");
      manager.addToWaitingRoom(room.code, "user-2", "Bob");
      manager.addToWaitingRoom(room.code, "user-3", "Carol");

      const users = manager.getWaitingUsers(room.code);
      expect(users).toHaveLength(2);
      expect(users[0]).toEqual({
        socketId: "user-2",
        name: "Bob",
        requestedAt: expect.any(Number),
      });
      // Admit removes the user from the waiting list
      manager.admitFromWaitingRoom(room.code, "user-2");
      expect(manager.getWaitingUsers(room.code)).toHaveLength(1);
    });
  });
});
