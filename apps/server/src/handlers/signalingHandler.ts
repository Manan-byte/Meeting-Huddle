/**
 * @file WebRTC signaling relay handler.
 *
 * Acts as a simple relay between peers for SDP offers, answers, and ICE candidates.
 * The server does not inspect or modify the signaling payloads — it only routes
 * them from sender to recipient based on the `to` field in SignalPayload.
 *
 * Flow:
 *   1. Client A emits `signal` with { type, from, to, data }
 *   2. Server validates: sender is in a room, recipient is in the same room
 *   3. Server forwards the payload to the recipient via `io.to(payload.to)`
 *   4. Client B receives the `signal` event and processes the SDP/ICE data
 *
 * This enables peer-to-peer WebRTC connections without direct browser-to-browser contact.
 *
 * Connects to: useWebRTC hook (client), RoomManager (room membership validation)
 */

import type { Server, Socket } from "socket.io";
import { SOCKET_EVENTS } from "@meet-app/shared";
import type { SignalPayload } from "@meet-app/shared";
import type { RoomManager } from "../services/RoomManager.js";

/**
 * Register the signaling relay handler.
 * Called once at startup from server/index.ts.
 *
 * @param io - Socket.IO server instance
 * @param roomManager - Used to validate that sender and recipient are in the same room
 */
export function setupSignalingHandler(
  io: Server,
  roomManager: RoomManager
): void {
  io.on("connection", (socket: Socket) => {
    // ── SIGNAL relay ─────────────────────────────────────────────────────
    // Receives a SignalPayload from a client and forwards it to the target.
    // Validates that:
    //   - The sender is in a room (getRoomBySocketId returns non-null)
    //   - The target user is also in the same room (found in participants)
    socket.on(
      SOCKET_EVENTS.SIGNAL,
      (payload: SignalPayload) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room) return;

        const targetSocket = room.participants.find(
          (p) => p.id === payload.to
        );
        if (!targetSocket) return;

        // Relay the payload to the target, stamping the sender's socket ID
        io.to(payload.to).emit(SOCKET_EVENTS.SIGNAL, {
          ...payload,
          from: socket.id,
        });
      }
    );
  });
}
