/**
 * @file Feature handlers — hand raise, layout, settings, virtual background, invite.
 *
 * Handles miscellaneous feature socket events that don't fit into room lifecycle
 * or meeting-specific categories:
 *   - HAND_RAISE: toggle hand raise state (broadcast to room)
 *   - SET_LAYOUT: toggle between grid and speaker layout (broadcast)
 *   - UPDATE_SETTINGS: broadcast settings changes to all participants
 *   - SET_BACKGROUND: broadcast virtual background changes
 *   - GET_INVITE_LINK: return the room's invite URL to the requesting client
 *
 * All handlers follow the same pattern: validate room membership, update state,
 * and broadcast the change to all room participants.
 *
 * Connects to: ControlBar buttons (client), RoomManager, invite links
 */

import type { Server, Socket } from "socket.io";
import { SOCKET_EVENTS } from "@meet-app/shared";
import type { RoomManager } from "../services/RoomManager.js";

/**
 * Register all feature handlers.
 * Called once at startup from server/index.ts.
 *
 * @param io - Socket.IO server instance
 * @param roomManager - Used for room lookups and hand raise toggling
 */
export function setupFeatureHandlers(io: Server, roomManager: RoomManager): void {
  io.on("connection", (socket: Socket) => {
    // ── HAND_RAISE ───────────────────────────────────────────────────────
    // Triggered when: user clicks the hand raise button in ControlBar
    // Does: toggles isHandRaised on the user, broadcasts to room
    // → HandRaiseButton, VideoPlayer (shows ✋ badge)
    socket.on(SOCKET_EVENTS.HAND_RAISE, (data: { roomId: string }) => {
      try {
        const user = roomManager.toggleHandRaise(data.roomId, socket.id);
        const room = roomManager.getRoomBySocketId(socket.id);
        if (room) {
          io.to(room.code).emit(SOCKET_EVENTS.HAND_RAISE, {
            userId: user.id,
            isHandRaised: user.isHandRaised,
          });
        }
      } catch (err) {
        socket.emit("error", { message: (err as Error).message });
      }
    });

    // ── SET_LAYOUT ───────────────────────────────────────────────────────
    // Triggered when: user clicks layout toggle button
    // Does: broadcasts the new layout mode to all room participants
    // → LayoutToggle, VideoGrid/SpeakerView (switches layout)
    socket.on(SOCKET_EVENTS.SET_LAYOUT, (data: { roomId: string; layout: string }) => {
      try {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (room) {
          io.to(room.code).emit(SOCKET_EVENTS.LAYOUT_CHANGED, {
            layout: data.layout,
          });
        }
      } catch (err) {
        socket.emit("error", { message: (err as Error).message });
      }
    });

    // ── UPDATE_SETTINGS ──────────────────────────────────────────────────
    // Triggered when: user applies new settings in SettingsPanel
    // Does: broadcasts updated settings to all participants
    // → SettingsPanel, useWebRTC (resolution/device changes)
    socket.on(SOCKET_EVENTS.UPDATE_SETTINGS, (data: { roomId: string; settings: Record<string, unknown> }) => {
      try {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (room) {
          io.to(room.code).emit(SOCKET_EVENTS.SETTINGS_UPDATED, {
            settings: data.settings,
          });
        }
      } catch (err) {
        socket.emit("error", { message: (err as Error).message });
      }
    });

    // ── SET_BACKGROUND ───────────────────────────────────────────────────
    // Triggered when: user selects a virtual background in SettingsPanel
    // Does: broadcasts the new background to all participants
    // → VideoPlayer (renders virtual background layer)
    socket.on(SOCKET_EVENTS.SET_BACKGROUND, (data: { roomId: string; background: string | null }) => {
      try {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (room) {
          io.to(room.code).emit(SOCKET_EVENTS.BACKGROUND_UPDATED, {
            background: data.background,
          });
        }
      } catch (err) {
        socket.emit("error", { message: (err as Error).message });
      }
    });

    // ── GET_INVITE_LINK ──────────────────────────────────────────────────
    // Triggered when: user opens the InviteModal
    // Does: returns the invite URL (client origin + room code) to the caller only
    // → InviteModal (displays the link for copying/sharing)
    socket.on(SOCKET_EVENTS.GET_INVITE_LINK, (_data: { roomId: string }) => {
      try {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (room) {
          socket.emit(SOCKET_EVENTS.INVITE_LINK, {
            code: room.code,
            url: `${process.env.CLIENT_URL || "http://localhost:5173"}/?join=${room.code}`,
          });
        }
      } catch (err) {
        socket.emit("error", { message: (err as Error).message });
      }
    });
  });
}
