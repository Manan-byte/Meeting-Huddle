/**
 * @file AuthContext — user authentication state for the app.
 *
 * Manages the signed-in user via the socket auth events:
 *   - REGISTER / LOGIN: create account or sign in, store the session token
 *   - LOGOUT: clear the token and user
 *   - AUTH_ME: restore the session from a stored token on load
 *
 * The token is kept in localStorage so a reload keeps the user signed in.
 *
 * Connects to: server authHandler (auth:register/login/logout/me),
 *              SocketContext (socket connection), HomePage (login UI)
 */

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Socket } from "socket.io-client";
import { useSocket } from "./SocketContext";

/** A user as exposed by the auth API (never includes password/salt). */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

interface AuthContextValue {
  /** The signed-in user, or null when logged out. */
  user: AuthUser | null;
  /** Whether we're still checking the stored session on load. */
  loading: boolean;
  /** Session token (used to authorize dashboard requests). */
  token: string | null;
  /** Register a new account. Resolves with an error string on failure. */
  register: (name: string, email: string, password: string) => Promise<string | null>;
  /** Sign in with email + password. Resolves with an error string on failure. */
  login: (email: string, password: string) => Promise<string | null>;
  /** Sign out locally and on the server. */
  logout: () => void;
}

const TOKEN_KEY = "huddle_token";

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  token: null,
  register: async () => "Not ready",
  login: async () => "Not ready",
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

/** Shared helper: emit an auth event with ack and resolve the result. */
function emitAck(socket: Socket, event: string, payload: unknown) {
  return new Promise<{ ok: boolean; user?: AuthUser; token?: string; error?: string }>((resolve) => {
    socket.emit(event, payload, (res: { ok: boolean; user?: AuthUser; token?: string; error?: string }) => {
      resolve(res);
    });
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { socket } = useSocket();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore a stored session once the socket is connected.
  useEffect(() => {
    if (!socket) return;
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (!storedToken) {
        setLoading(false);
        return;
      }
      socket.emit("auth:me", { token: storedToken }, (res: { ok: boolean; user?: AuthUser }) => {
        if (res.ok && res.user) {
          setUser(res.user);
          setToken(storedToken);
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
        setLoading(false);
      });
    } catch {
      // localStorage may be unavailable (e.g. tests); treat as logged out
      setLoading(false);
    }
  }, [socket]);

  const register = async (name: string, email: string, password: string): Promise<string | null> => {
    if (!socket) return "Not connected.";
    const res = await emitAck(socket, "auth:register", { name, email, password });
    if (res.ok && res.user && res.token) {
      try { localStorage.setItem(TOKEN_KEY, res.token); } catch { /* ignore */ }
      setUser(res.user);
      setToken(res.token);
      return null;
    }
    return res.error ?? "Registration failed.";
  };

  const login = async (email: string, password: string): Promise<string | null> => {
    if (!socket) return "Not connected.";
    const res = await emitAck(socket, "auth:login", { email, password });
    if (res.ok && res.user && res.token) {
      try { localStorage.setItem(TOKEN_KEY, res.token); } catch { /* ignore */ }
      setUser(res.user);
      setToken(res.token);
      return null;
    }
    return res.error ?? "Login failed.";
  };

  const logout = () => {
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY) ?? token;
      if (socket && storedToken) socket.emit("auth:logout", { token: storedToken });
    } catch { /* ignore */ }
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, token, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}