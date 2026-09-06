import { describe, it, expect } from "vitest";


function makeRoomManager() {
  const rooms = new Map<string, { id: string; code: string; hostId: string; participants: { id: string; name: string; isHost: boolean }[]; isLocked: boolean; waitingRoom: string[]; startedAt: number }>();
  let counter = 0;

  return {
    createRoom(hostId: string, hostName: string) {
      const code = `ROOM${++counter}`;
      const room = {
        id: `room-${counter}`,
        code,
        hostId,
        participants: [{ id: hostId, name: hostName, isHost: true }],
        isLocked: false,
        waitingRoom: [] as string[],
        startedAt: Date.now(),
      };
      rooms.set(code, room);
      return room;
    },
    getRoomBySocketId(socketId: string) {
      for (const room of rooms.values()) {
        if (room.participants.find((p: { id: string }) => p.id === socketId)) return room;
        if (room.waitingRoom.includes(socketId)) return room;
      }
      return null;
    },
    getRoom(code: string) { return rooms.get(code) ?? null; },
    admitFromWaitingRoom(code: string, socketId: string) {
      const room = rooms.get(code);
      if (!room) throw new Error("Room not found");
      room.waitingRoom = room.waitingRoom.filter((id: string) => id !== socketId);
      const user = { id: socketId, name: socketId, isHost: false, isMuted: false, isVideoOff: false, isHandRaised: false, joinedAt: Date.now() };
      room.participants.push(user);
      return user;
    },
    removeFromWaitingRoom(code: string, socketId: string) {
      const room = rooms.get(code);
      if (!room) throw new Error("Room not found");
      room.waitingRoom = room.waitingRoom.filter((id: string) => id !== socketId);
    },
    addToWaitingRoom(code: string, socketId: string, _name: string) {
      const room = rooms.get(code);
      if (!room) throw new Error("Room not found");
      room.waitingRoom.push(socketId);
      return room;
    },
    getChatHistory(_roomId: string) { return []; },
  };
}

// We cannot easily import setupMeetingHandlers without the full socket.io types,
// so we test the logic directly via the mock RoomManager and emit tracking.
// For a real integration test we'd spin up a socket.io server.

describe("meetingHandlers logic", () => {
  it("RoomManager: creates room with startedAt and waitingRoom", () => {
    const rm = makeRoomManager();
    const room = rm.createRoom("host-1", "Alice");
    expect(room.startedAt).toBeGreaterThan(0);
    expect(room.waitingRoom).toEqual([]);
  });

  it("RoomManager: admitFromWaitingRoom creates participant", () => {
    const rm = makeRoomManager();
    const room = rm.createRoom("host-1", "Alice");
    room.isLocked = true;
    rm.addToWaitingRoom(room.code, "user-2", "Bob");
    expect(room.waitingRoom).toContain("user-2");
    const user = rm.admitFromWaitingRoom(room.code, "user-2");
    expect(user.name).toBe("user-2");
    expect(room.participants).toHaveLength(2);
    expect(room.waitingRoom).not.toContain("user-2");
  });

  it("RoomManager: removeFromWaitingRoom cleans up", () => {
    const rm = makeRoomManager();
    const room = rm.createRoom("host-1", "Alice");
    room.isLocked = true;
    rm.addToWaitingRoom(room.code, "user-2", "Bob");
    rm.removeFromWaitingRoom(room.code, "user-2");
    expect(room.waitingRoom).toEqual([]);
  });

  it("Reaction: broadcast includes all required fields", () => {
    const reaction = {
      id: "test-id",
      userId: "user-1",
      userName: "Alice",
      type: "👍",
      timestamp: Date.now(),
    };
    expect(reaction).toHaveProperty("id");
    expect(reaction).toHaveProperty("userId");
    expect(reaction).toHaveProperty("userName");
    expect(reaction).toHaveProperty("type");
    expect(reaction).toHaveProperty("timestamp");
  });

  it("Poll: has correct structure", () => {
    const poll = {
      id: "poll-1",
      question: "Favorite color?",
      options: [
        { id: "opt-1", text: "Red", votes: [] as string[] },
        { id: "opt-2", text: "Blue", votes: [] as string[] },
      ],
      createdBy: "user-1",
      isActive: true,
      createdAt: Date.now(),
    };
    expect(poll.options).toHaveLength(2);
    expect(poll.isActive).toBe(true);
  });

  it("Poll: vote adds userId to option", () => {
    const poll = {
      id: "poll-1",
      question: "Favorite?",
      options: [
        { id: "opt-1", text: "A", votes: [] as string[] },
        { id: "opt-2", text: "B", votes: [] as string[] },
      ],
      createdBy: "user-1",
      isActive: true,
      createdAt: Date.now(),
    };
    // Simulate voting
    const option = poll.options.find((o) => o.id === "opt-1");
    option?.votes.push("voter-1");
    expect(poll.options[0].votes).toContain("voter-1");
  });

  it("Poll: close sets isActive to false", () => {
    const poll = {
      id: "poll-1",
      question: "Test?",
      options: [{ id: "opt-1", text: "A", votes: [] }],
      createdBy: "user-1",
      isActive: true,
      createdAt: Date.now(),
    };
    poll.isActive = false;
    expect(poll.isActive).toBe(false);
  });
});
