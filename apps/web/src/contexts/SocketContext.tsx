/**
 * @file Socket.IO context — manages the WebSocket connection lifecycle.
 *
 * Creates and maintains a single Socket.IO connection to the server.
 * All components access the socket via the useSocket() hook.
 * The connection is established once on mount and cleaned up on unmount.
 *
 * The socket automatically connects to the same origin as the page
 * (in production) or to localhost:3001 (in development via Vite proxy).
 *
 * Connects to: server/index.ts (Socket.IO server), all socket handlers
 * Used by: useSocket() hook → HomePage, RoomPage, all components that emit/receive events
 */

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { io, type Socket } from "socket.io-client";

/** Shape of the socket context value provided to all children. */
interface SocketContextValue {
  /** The Socket.IO client instance (null until connected). */
  socket: Socket | null;
  /** Whether the socket is currently connected to the server. */
  isConnected: boolean;
}

// Create context with defaults (socket is null until provider mounts)
const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
});

/**
 * Hook to access the Socket.IO connection from any component.
 * Must be used inside a SocketProvider.
 */
export function useSocket() {
  return useContext(SocketContext);
}

/**
 * SocketProvider component — creates and manages the Socket.IO connection.
 * Wraps the entire app tree so all components can access the socket.
 *
 * @param children - Child components that need access to the socket
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Create a new Socket.IO connection
    // Transports: prefer WebSocket, fall back to HTTP long-polling
    const newSocket = io({
      transports: ["websocket", "polling"],
    });

    // Track connection state for UI indicators (e.g. "Connecting..." banner)
    newSocket.on("connect", () => setIsConnected(true));
    newSocket.on("disconnect", () => setIsConnected(false));

    setSocket(newSocket);

    // Cleanup: close the socket connection when the provider unmounts
    return () => {
      newSocket.close();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}
