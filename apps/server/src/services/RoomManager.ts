/**
 * @file RoomManager — central in-memory state manager for all meeting rooms.
 *
 * Maintains four maps for O(1) lookups:
 *   - rooms:        room code → Room object
 *   - chatHistory:  room code → ChatMessage[]
 *   - userRoomMap:  user/socket ID → room code
 *   - roomIdToCode: room UUID → room code
 *   - waitingUserNames: socket ID → display name (for waiting room users)
 *
 * Called by: all socket handlers (roomHandlers, signalingHandler, chatHandler,
 *            featureHandlers, meetingHandlers).
 *
 * Thread safety: N/A — single-threaded Node.js event loop.
 */

import { v4 as uuidv4 } from "uuid";
import type { User, Room, ChatMessage, RecordingState } from "@meet-app/shared";
import { ROOM_CONFIG, type WaitingUser } from "@meet-app/shared";

export class RoomManager {
  /** room code → Room object */
  private rooms = new Map<string, Room>();
  /** room code → array of chat messages */
  private chatHistory = new Map<string, ChatMessage[]>();
  /** user/socket ID → room code (for quick room lookups by user) */
  private userRoomMap = new Map<string, string>();
  /** room UUID → room code (for lookups by room.id instead of room.code) */
  private roomIdToCode = new Map<string, string>();
  /** socket ID → display name (temporary storage for waiting room users) */
  private waitingUserNames = new Map<string, string>();
  /** socket ID → join request time (for waiting room list) */
  private waitingUserTimestamps = new Map<string, number>();

  /**
   * Create a new room with the given host.
   * Initializes the host as the first participant with isHost=true.
   *
   * @param hostId - Socket ID of the room creator (becomes the host)
   * @param hostName - Display name of the host
   * @returns The newly created Room object
   *
   * Called by: roomHandlers → CREATE_ROOM
   */
  createRoom(hostId: string, hostName: string): Room {
    const code = this.generateRoomCode();
    const host: User = {
      id: hostId,
      name: hostName,
      isHost: true,
      isMuted: false,
      isVideoOff: false,
      isHandRaised: false,
      joinedAt: Date.now(),
    };
    const room: Room = {
      id: uuidv4(),
      code,
      hostId,
      participants: [host],
      isLocked: false,
      meetingTitle: '',
      recording: null,
      waitingRoom: [],
      startedAt: Date.now(),
      createdAt: Date.now(),
    };
    // Register in all lookup maps
    this.rooms.set(code, room);
    this.userRoomMap.set(hostId, code);
    this.chatHistory.set(code, []);
    this.roomIdToCode.set(room.id, code);
    return room;
  }

  /**
   * Add a user to an existing room by room code.
   * Validates room existence, capacity, and lock status before joining.
   *
   * @param code - 6-character room code
   * @param userId - Socket ID of the joining user
   * @param userName - Display name of the joining user
   * @returns The updated Room object with the new participant
   * @throws "Room not found" | "Room is full" | "Room is locked"
   *
   * Called by: roomHandlers → JOIN_ROOM (when room is not locked)
   */
  joinRoom(code: string, userId: string, userName: string): Room {
    const room = this.rooms.get(code);
    if (!room) {
      throw new Error("Room not found");
    }
    if (room.participants.length >= ROOM_CONFIG.MAX_PARTICIPANTS) {
      throw new Error("Room is full");
    }
    if (room.isLocked) {
      throw new Error("Room is locked");
    }
    const user: User = {
      id: userId,
      name: userName,
      isHost: false,
      isMuted: false,
      isVideoOff: false,
      isHandRaised: false,
      joinedAt: Date.now(),
    };
    room.participants.push(user);
    this.userRoomMap.set(userId, code);
    return room;
  }

  /**
   * Remove a user from a room. If the room becomes empty, it is deleted.
   * If the leaving user was the host, the next participant becomes host.
   *
   * @param code - Room code
   * @param userId - Socket ID of the leaving user
   * @returns Updated room, or null if the room was deleted (empty)
   *
   * Called by: roomHandlers → LEAVE_ROOM, roomHandlers → disconnect
   */
  leaveRoom(code: string, userId: string): Room | null {
    const room = this.rooms.get(code);
    if (!room) return null;

    room.participants = room.participants.filter((p) => p.id !== userId);
    this.userRoomMap.delete(userId);

    // If room is now empty, clean up all maps
    if (room.participants.length === 0) {
      this.rooms.delete(code);
      this.chatHistory.delete(code);
      this.roomIdToCode.delete(room.id);
      return null;
    }

    // If the host left, promote the first remaining participant to host
    if (room.hostId === userId) {
      const newHost = room.participants[0];
      newHost.isHost = true;
      room.hostId = newHost.id;
    }

    return room;
  }

  /**
   * Look up a room by its short code.
   *
   * @param code - 6-character room code
   * @returns The Room object, or null if not found
   */
  getRoom(code: string): Room | null {
    return this.rooms.get(code) ?? null;
  }

  /**
   * Look up the room a user belongs to by their socket ID.
   * Uses the userRoomMap for O(1) lookup.
   *
   * @param userId - Socket ID
   * @returns The Room object, or null if user is not in any room
   */
  getRoomByUserId(userId: string): Room | null {
    const code = this.userRoomMap.get(userId);
    if (!code) return null;
    return this.rooms.get(code) ?? null;
  }

  /**
   * Alias for getRoomByUserId — since socket IDs are used as user IDs.
   *
   * @param socketId - Socket.IO socket ID
   * @returns The Room object, or null
   */
  getRoomBySocketId(socketId: string): Room | null {
    return this.getRoomByUserId(socketId);
  }

  /**
   * Toggle the mute state of a user in a room.
   *
   * @param roomId - Room UUID (not the short code)
   * @param userId - Socket ID of the user
   * @returns Updated User object with toggled isMuted
   * @throws "Room not found" | "User not found in room"
   *
   * Called by: (indirectly via room state sync)
   */
  toggleMute(roomId: string, userId: string): User {
    const room = this.findRoomById(roomId);
    if (!room) throw new Error("Room not found");
    const user = room.participants.find((p) => p.id === userId);
    if (!user) throw new Error("User not found in room");
    user.isMuted = !user.isMuted;
    return user;
  }

  /**
   * Toggle the video on/off state of a user in a room.
   *
   * @param roomId - Room UUID
   * @param userId - Socket ID of the user
   * @returns Updated User object with toggled isVideoOff
   * @throws "Room not found" | "User not found in room"
   */
  toggleVideo(roomId: string, userId: string): User {
    const room = this.findRoomById(roomId);
    if (!room) throw new Error("Room not found");
    const user = room.participants.find((p) => p.id === userId);
    if (!user) throw new Error("User not found in room");
    user.isVideoOff = !user.isVideoOff;
    return user;
  }

  /**
   * Toggle the lock state of a room. Only the host can lock/unlock.
   * When locked, new joiners are placed in the waiting room instead of joining directly.
   *
   * @param roomId - Room UUID
   * @param userId - Socket ID (must be the host)
   * @throws "Room not found" | "Only host can lock room"
   *
   * Called by: (host controls, not currently wired to a socket event)
   */
  toggleLock(roomId: string, userId: string): void {
    const room = this.findRoomById(roomId);
    if (!room) throw new Error("Room not found");
    if (room.hostId !== userId) throw new Error("Only host can lock room");
    room.isLocked = !room.isLocked;
  }

  /**
   * Store a new chat message and append it to the room's history.
   *
   * @param roomId - Room UUID
   * @param senderId - Socket ID of the message sender
   * @param senderName - Display name of the sender
   * @param text - Message body
   * @returns The created ChatMessage with a new UUID and timestamp
   * @throws "Room not found" (if roomId not in roomIdToCode map)
   *
   * Called by: chatHandler → CHAT_MESSAGE
   */
  sendMessage(
    roomId: string,
    senderId: string,
    senderName: string,
    text: string
  ): ChatMessage {
    const code = this.roomIdToCode.get(roomId);
    if (!code) throw new Error("Room not found");
    const history = this.chatHistory.get(code);
    if (!history) throw new Error("Room not found");
    const message: ChatMessage = {
      id: uuidv4(),
      senderId,
      senderName,
      text,
      timestamp: Date.now(),
    };
    history.push(message);
    return message;
  }

  /**
   * Retrieve the full chat history for a room.
   * Accepts either a room UUID or a room code.
   *
   * @param roomId - Room UUID or code
   * @returns Array of ChatMessage objects (may be empty)
   */
  getChatHistory(roomId: string): ChatMessage[] {
    const code = this.roomIdToCode.get(roomId) ?? roomId;
    return this.chatHistory.get(code) ?? [];
  }

  /**
   * Set or update the meeting title. Only the host can do this.
   *
   * @param roomId - Room UUID
   * @param userId - Socket ID (must be the host)
   * @param title - New meeting title
   * @returns Updated Room object
   * @throws "Room not found" | "Only host can set meeting title"
   *
   * Called by: roomHandlers → SET_MEETING_TITLE
   */
  setMeetingTitle(roomId: string, userId: string, title: string): Room {
    const room = this.findRoomById(roomId);
    if (!room) throw new Error("Room not found");
    if (room.hostId !== userId) throw new Error("Only host can set meeting title");
    room.meetingTitle = title;
    return room;
  }

  /**
   * Toggle the hand-raise state of a user.
   *
   * @param roomId - Room UUID
   * @param userId - Socket ID
   * @returns Updated User with toggled isHandRaised
   * @throws "Room not found" | "User not found in room"
   *
   * Called by: featureHandlers → HAND_RAISE
   */
  toggleHandRaise(roomId: string, userId: string): User {
    const room = this.findRoomById(roomId);
    if (!room) throw new Error("Room not found");
    const user = room.participants.find((p) => p.id === userId);
    if (!user) throw new Error("User not found in room");
    user.isHandRaised = !user.isHandRaised;
    return user;
  }

  /**
   * Toggle recording state. Only the host can start/stop recording.
   * Returns the new RecordingState (with isRecording toggled).
   *
   * @param roomId - Room UUID
   * @param userId - Socket ID (must be the host)
   * @returns Updated RecordingState
   * @throws "Room not found" | "Only host can toggle recording"
   *
   * Called by: roomHandlers → TOGGLE_RECORDING
   */
  toggleRecording(roomId: string, userId: string): RecordingState {
    const room = this.findRoomById(roomId);
    if (!room) throw new Error("Room not found");
    if (room.hostId !== userId) throw new Error("Only host can toggle recording");
    if (room.recording?.isRecording) {
      // Currently recording → stop it
      const prev = room.recording;
      room.recording = null;
      return { isRecording: false, startedBy: prev.startedBy, startedAt: prev.startedAt };
    } else {
      // Not recording → start it
      room.recording = {
        isRecording: true,
        startedBy: userId,
        startedAt: Date.now(),
      };
      return room.recording;
    }
  }

  /**
   * Get the current recording state for a room.
   *
   * @param roomId - Room UUID
   * @returns RecordingState or null if not recording
   * @throws "Room not found"
   */
  getRecordingState(roomId: string): RecordingState | null {
    const room = this.findRoomById(roomId);
    if (!room) throw new Error("Room not found");
    return room.recording;
  }

  /**
   * Add a user to the waiting room when the room is locked.
   * The user cannot join as a participant until admitted by the host.
   *
   * @param code - Room code
   * @param socketId - Socket ID of the waiting user
   * @param name - Display name of the waiting user
   * @returns Updated Room with user added to waitingRoom
   * @throws "Room not found" | "Room is not locked"
   *
   * Called by: roomHandlers → JOIN_ROOM (when room.isLocked)
   */
  addToWaitingRoom(code: string, socketId: string, name: string): Room {
    const room = this.rooms.get(code);
    if (!room) throw new Error("Room not found");
    if (!room.isLocked) throw new Error("Room is not locked");
    room.waitingRoom.push(socketId);
    this.userRoomMap.set(socketId, code);
    this.waitingUserNames.set(socketId, name);
    this.waitingUserTimestamps.set(socketId, Date.now());
    return room;
  }

  /**
   * Build the current waiting-room list as WaitingUser objects (name + time).
   * This is the payload broadcast on WAITING_ROOM_UPDATE — the client
   * (WaitingRoom panel) renders {socketId, name, requestedAt}, not raw IDs.
   *
   * @param code - Room code
   * @returns WaitingUser[] for the room's current waiting users (empty if none)
   */
  getWaitingUsers(code: string): WaitingUser[] {
    const room = this.rooms.get(code);
    if (!room) return [];
    return room.waitingRoom.map((socketId) => ({
      socketId,
      name: this.waitingUserNames.get(socketId) ?? socketId,
      requestedAt: this.waitingUserTimestamps.get(socketId) ?? room.createdAt,
    }));
  }

  /**
   * Admit a user from the waiting room into the room as a full participant.
   * Removes from waitingRoom array and creates a new User object.
   *
   * @param code - Room code
   * @param socketId - Socket ID of the user to admit
   * @returns The newly admitted User object
   * @throws "Room not found" | "User not in waiting room"
   *
   * Called by: meetingHandlers → ADMIT_USER
   */
  admitFromWaitingRoom(code: string, socketId: string): User {
    const room = this.rooms.get(code);
    if (!room) throw new Error("Room not found");
    if (!room.waitingRoom.includes(socketId)) throw new Error("User not in waiting room");
    room.waitingRoom = room.waitingRoom.filter((id) => id !== socketId);
    const name = this.waitingUserNames.get(socketId) ?? socketId;
    this.waitingUserNames.delete(socketId);
    this.waitingUserTimestamps.delete(socketId);
    const user: User = {
      id: socketId,
      name,
      isHost: false,
      isMuted: false,
      isVideoOff: false,
      isHandRaised: false,
      joinedAt: Date.now(),
    };
    room.participants.push(user);
    return user;
  }

  /**
   * Remove a user from the waiting room (reject or disconnect).
   * Cleans up all temporary mappings.
   *
   * @param code - Room code
   * @param socketId - Socket ID of the user to remove
   * @throws "Room not found"
   *
   * Called by: meetingHandlers → REJECT_USER
   */
  removeFromWaitingRoom(code: string, socketId: string): void {
    const room = this.rooms.get(code);
    if (!room) throw new Error("Room not found");
    room.waitingRoom = room.waitingRoom.filter((id) => id !== socketId);
    this.userRoomMap.delete(socketId);
    this.waitingUserNames.delete(socketId);
    this.waitingUserTimestamps.delete(socketId);
  }

  /**
   * Find a room by its UUID (internal ID, not the short code).
   * Uses roomIdToCode map for O(1) lookup.
   *
   * @param id - Room UUID
   * @returns Room object or null
   */
  private findRoomById(id: string): Room | null {
    const code = this.roomIdToCode.get(id);
    if (!code) return null;
    return this.rooms.get(code) ?? null;
  }

  /**
   * Generate a unique 6-character room code.
   * Uses ROOM_CONFIG.CODE_CHARS (excluding ambiguous characters).
   * Recursively retries if the generated code already exists.
   *
   * @returns Unique room code string
   */
  private generateRoomCode(): string {
    let code = "";
    for (let i = 0; i < ROOM_CONFIG.CODE_LENGTH; i++) {
      const idx = Math.floor(Math.random() * ROOM_CONFIG.CODE_CHARS.length);
      code += ROOM_CONFIG.CODE_CHARS[idx];
    }
    // Recurse if code already exists (extremely unlikely with 32^6 ≈ 1B possibilities)
    if (this.rooms.has(code)) {
      return this.generateRoomCode();
    }
    return code;
  }
}
