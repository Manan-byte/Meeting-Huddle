/**
 * @file SocketContext — realtime connection context.
 *
 * Wraps the WsSocket adapter (raw WebSocket to the Cloudflare Worker's
 * Durable Object), exposing `socket` + `isConnected` to the app — the same
 * surface the old Socket.IO provider exposed, so consumers are unchanged.
 *
 * Connects to: worker/src/huddleDO.ts (Durable Object WebSocket server)
 */

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { WsSocket } from "../lib/wsSocket";
import type { Socket } from "socket.io-client";

/** Shape of the socket context value provided to all children. */
interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
});

export function useSocket() {
  return useContext(SocketContext);
}

/**
 * SocketProvider — creates the WsSocket adapter and stays connected
 * for the app lifetime. Auto-reconnects via the adapter.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const ws = new WsSocket() as unknown as Socket;
    ws.on("connect", () => setIsConnected(true));
    ws.on("disconnect", () => setIsConnected(false));
    setSocket(ws);

    return () => {
      ws.close();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}