/**
 * @file Chat message handler.
 *
 * Handles the CHAT_MESSAGE socket event:
 *   1. Validates the sender is in a room
 *   2. Stores the message in RoomManager's chat history
 *   3. Broadcasts the message to all room participants
 *
 * Chat messages are persisted in-memory per room and included in the
 * AI Companion's summary generation (via getChatHistory).
 *
 * Connects to: ChatPanel (client), RoomManager.sendMessage/getChatHistory,
 *              meetingHandlers (AI summary uses chat history)
 */

import type { Server, Socket } from "socket.io";
import { SOCKET_EVENTS } from "@meet-app/shared";
import type { RoomManager } from "../services/RoomManager.js";

/**
 * Register the chat message handler.
 * Called once at startup from server/index.ts.
 *
 * @param io - Socket.IO server instance
 * @param roomManager - Used to store messages and look up sender info
 */
export function setupChatHandler(io: Server, roomManager: RoomManager): void {
  io.on("connection", (socket: Socket) => {
    // ── CHAT_MESSAGE ─────────────────────────────────────────────────────
    // Triggered when: user sends a message in ChatPanel
    // Does: validates sender, stores message, broadcasts to room
    socket.on(
      SOCKET_EVENTS.CHAT_MESSAGE,
      (data: { text: string }) => {
        // Find the room this socket belongs to
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room) return;

        // Find the participant object to get the display name
        const participant = room.participants.find(
          (p) => p.id === socket.id
        );
        if (!participant) return;

        // Store message in chat history and create ChatMessage object
        const message = roomManager.sendMessage(
          room.id,
          socket.id,
          participant.name,
          data.text
        );

        // Broadcast to ALL room participants (including sender for confirmation)
        io.to(room.code).emit(SOCKET_EVENTS.CHAT_MESSAGE, message);
      }
    );
  });
}
