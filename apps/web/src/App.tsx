/**
 * @file Root application component — manages top-level routing between home and room views.
 *
 * Provides the context providers (SocketProvider, RoomProvider) that wrap
 * the entire component tree. All child components access the socket connection
 * and room state via these contexts.
 *
 * Routing is simple state-based (not a router library):
 *   - "home" → HomePage (create/join room)
 *   - "room" → RoomPage (the video meeting)
 *
 * Invite-link support: if the URL contains ?join=CODE, HomePage reads the
 * param and pre-fills the join-code input. The user enters their name and
 * clicks Join (which emits JOIN_ROOM) — the room view is only entered
 * via the onJoinRoom callback. No forced navigation on load.
 */

import { useState } from "react";
import { SocketProvider } from "./contexts/SocketContext";
import { RoomProvider } from "./contexts/RoomContext";
import { AuthProvider } from "./contexts/AuthContext";
import { HomePage } from "./pages/HomePage";
import { RoomPage } from "./pages/RoomPage";

export function App() {
  // Simple state-based routing: "home" or "room"
  const [view, setView] = useState<"home" | "room">("home");

  // Auto-join from URL param ?join=CODE (used by invite links)
  // Invite links use ?join=CODE — HomePage reads the param and pre-fills
  // the join-code input so the user can enter their name and join.
  // No forced navigation here; the room view is entered only via onJoinRoom.
  return (
    // SocketProvider wraps everything — provides the Socket.IO connection
    <SocketProvider>
      {/* AuthProvider — user session (register/login/logout) */}
      <AuthProvider>
        {/* RoomProvider wraps page components — provides room state (participants, messages, etc.) */}
        <RoomProvider>
          {view === "home" ? (
            <HomePage onJoinRoom={() => setView("room")} />
          ) : (
            <RoomPage onLeaveRoom={() => setView("home")} />
          )}
        </RoomProvider>
      </AuthProvider>
    </SocketProvider>
  );
}
