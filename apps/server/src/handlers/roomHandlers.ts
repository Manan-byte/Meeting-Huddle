/**
 * @file Room lifecycle socket handlers.
 *
 * Handles all room-related socket events:
 *   - CREATE_ROOM: create a new room with the caller as host
 *   - JOIN_ROOM: join an existing room by code (or waiting room if locked)
 *   - LEAVE_ROOM: leave a room (auto-promotes next user to host)
 *   - SET_MEETING_TITLE: host renames the meeting
 *   - TOGGLE_RECORDING: host starts/stops recording
 *   - disconnect: auto-leave on browser close/network loss
 *
 * Each handler validates input, calls RoomManager, and broadcasts state
 * changes to all room participants via Socket.IO.
 *
 * Connects to: RoomManager (state), shared types (SOCKET_EVENTS), client RoomPage
 */

import type { Server, Socket } from "socket.io";
import { SOCKET_EVENTS } from "@meet-app/shared";
import type { RoomManager } from "../services/RoomManager.js";

/**
 * Register all room lifecycle handlers on the Socket.IO server.
 * Called once at startup from server/index.ts.
 *
 * @param io - Socket.IO server instance
 * @param roomManager - Shared RoomManager instance for state management
 */
export function setupRoomHandlers(io: Server, roomManager: RoomManager): void {
  io.on("connection", (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // ── CREATE_ROOM ──────────────────────────────────────────────────────
    // Triggered when: user clicks "Create Room" on HomePage
    // Does: creates room, joins socket.io room, emits ROOM_CREATED to caller
    //        and MEETING_STARTED to all (starts timer)
    socket.on(SOCKET_EVENTS.CREATE_ROOM, (data: { hostName: string; meetingTitle?: string }) => {
      try {
        const room = roomManager.createRoom(socket.id, data.hostName);
        if (data.meetingTitle?.trim()) {
          room.meetingTitle = data.meetingTitle.trim().slice(0, 80);
        }
        socket.join(room.code);
        const user = room.participants.find((p) => p.id === socket.id);
        socket.emit(SOCKET_EVENTS.ROOM_CREATED, { room, user });
        // Notify room that meeting timer should start
        io.to(room.code).emit(SOCKET_EVENTS.MEETING_STARTED, {
          startedAt: room.startedAt,
        });
      } catch (err) {
        socket.emit("error", { message: (err as Error).message });
      }
    });

    // ── JOIN_ROOM ────────────────────────────────────────────────────────
    // Triggered when: user clicks "Join" on HomePage, or enters via invite link
    // Does: if room is locked → waiting room; otherwise → add as participant
    // Emits: ROOM_JOINED (to joiner), PARTICIPANT_JOINED (to others), ROOM_STATE (to all)
    socket.on(
      SOCKET_EVENTS.JOIN_ROOM,
      (data: { code: string; userName: string }) => {
        try {
          const room = roomManager.getRoom(data.code);
          if (!room) {
            socket.emit("error", { message: "Room not found" });
            return;
          }

          // If room is locked, add to waiting room instead of participants
          if (room.isLocked) {
            roomManager.addToWaitingRoom(
              data.code,
              socket.id,
              data.userName
            );
            socket.emit(SOCKET_EVENTS.WAITING_ROOM_STATUS, {
              waiting: true,
            });
            io.to(data.code).emit(
              SOCKET_EVENTS.WAITING_ROOM_UPDATE,
              roomManager.getWaitingUsers(data.code)
            );
            return;
          }

          const joinedRoom = roomManager.joinRoom(
            data.code,
            socket.id,
            data.userName
          );
          socket.join(joinedRoom.code);
          const joinedUser = joinedRoom.participants.find((p) => p.id === socket.id);
          socket.emit(SOCKET_EVENTS.ROOM_JOINED, { room: joinedRoom, user: joinedUser });
          socket.to(joinedRoom.code).emit(
            SOCKET_EVENTS.PARTICIPANT_JOINED,
            {
              user: joinedRoom.participants.find(
                (p) => p.id === socket.id
              ),
              participants: joinedRoom.participants,
            }
          );
          io.to(joinedRoom.code).emit(SOCKET_EVENTS.ROOM_STATE, {
            room: joinedRoom,
            participants: joinedRoom.participants,
          });
        } catch (err) {
          const message = (err as Error).message;
          if (message === "Room is full") {
            socket.emit(SOCKET_EVENTS.ROOM_FULL, { message });
          } else {
            socket.emit("error", { message });
          }
        }
      }
    );

    // ── LEAVE_ROOM ───────────────────────────────────────────────────────
    // Triggered when: user clicks "Leave" button in ControlBar
    // Does: removes user from room, broadcasts PARTICIPANT_LEFT and updated ROOM_STATE
    socket.on(SOCKET_EVENTS.LEAVE_ROOM, (data: { code: string }) => {
      try {
        const room = roomManager.leaveRoom(data.code, socket.id);
        socket.leave(data.code);
        io.to(data.code).emit(SOCKET_EVENTS.PARTICIPANT_LEFT, {
          userId: socket.id,
          participants: room?.participants ?? [],
        });
        if (room) {
          io.to(data.code).emit(SOCKET_EVENTS.ROOM_STATE, {
            room,
            participants: room.participants,
          });
        }
      } catch (err) {
        socket.emit("error", { message: (err as Error).message });
      }
    });

    // ── SET_MEETING_TITLE ────────────────────────────────────────────────
    // Triggered when: host clicks/edits the meeting title (MeetingTitle component)
    // Does: updates title in RoomManager, broadcasts to all participants
    socket.on(
      SOCKET_EVENTS.SET_MEETING_TITLE,
      (data: { roomId: string; title: string }) => {
        try {
          const room = roomManager.setMeetingTitle(
            data.roomId,
            socket.id,
            data.title
          );
          io.to(room.code).emit(SOCKET_EVENTS.MEETING_TITLE_UPDATED, {
            meetingTitle: room.meetingTitle,
          });
        } catch (err) {
          socket.emit("error", { message: (err as Error).message });
        }
      }
    );

    // ── TOGGLE_RECORDING ─────────────────────────────────────────────────
    // Triggered when: host clicks the record button in ControlBar
    // Does: toggles recording state, broadcasts RECORDING_STATE to room
    socket.on(
      SOCKET_EVENTS.TOGGLE_RECORDING,
      (data: { roomId: string }) => {
        try {
          const recording = roomManager.toggleRecording(
            data.roomId,
            socket.id
          );
          const room = roomManager.getRoomBySocketId(socket.id);
          if (room) {
            io.to(room.code).emit(SOCKET_EVENTS.RECORDING_STATE, recording);
          }
        } catch (err) {
          socket.emit("error", { message: (err as Error).message });
        }
      }
    );

    // ── TOGGLE_LOCK ─────────────────────────────────────────────────────
    // Triggered when: host clicks the lock button in ControlBar
    // Does: toggles room lock state, broadcasts LOCK_CHANGED to all
    //       participants (new joiners go to waiting room while locked)
    socket.on(
      SOCKET_EVENTS.TOGGLE_LOCK,
      (data: { roomId: string }) => {
        try {
          roomManager.toggleLock(data.roomId, socket.id);
          const room = roomManager.getRoomBySocketId(socket.id);
          if (room) {
            io.to(room.code).emit(SOCKET_EVENTS.LOCK_CHANGED, {
              isLocked: room.isLocked,
            });
          }
        } catch (err) {
          socket.emit("error", { message: (err as Error).message });
        }
      }
    );


    // ── DISCONNECT ───────────────────────────────────────────────────────
    // Triggered when: browser closes, network drops, or socket disconnects
    // Does: auto-removes user from room (same as LEAVE_ROOM), notifies others
    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
      const room = roomManager.getRoomBySocketId(socket.id);
      if (room) {
        // Waiting-room users aren't participants — remove them from the
        // waiting list instead of the participant list.
        if (room.waitingRoom.includes(socket.id)) {
          roomManager.removeFromWaitingRoom(room.code, socket.id);
          io.to(room.code).emit(
            SOCKET_EVENTS.WAITING_ROOM_UPDATE,
            roomManager.getWaitingUsers(room.code)
          );
          return;
        }
        roomManager.leaveRoom(room.code, socket.id);
        io.to(room.code).emit(SOCKET_EVENTS.PARTICIPANT_LEFT, {
          userId: socket.id,
          participants: room.participants.filter(
            (p) => p.id !== socket.id
          ),
        });
      }
    });
  });
}
