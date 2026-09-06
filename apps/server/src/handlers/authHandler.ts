/**
 * @file Auth handlers — register, login, logout, and session validation.
 *
 * Provides real user accounts so Huddle can be published as a product:
 *   - REGISTER: create an account (name, email, password)
 *   - LOGIN: verify credentials, issue a session token
 *   - LOGOUT: invalidate the session token
 *   - AUTH_ME: validate a token on app load (restore session)
 *
 * Passwords are hashed with Node's crypto.scrypt (salted). Session tokens
 * are random UUIDs kept in memory (a restart logs everyone out, which is
 * acceptable for v1; the account data itself persists in the Database).
 *
 * Connects to: Database (users), client AuthContext
 */

import type { Server, Socket } from "socket.io";
import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { Database, toPublicUser } from "../services/Database.js";

/** Derive a salted password hash with scrypt. */
function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

/**
 * Register all auth handlers. Runs inside a shared io.on("connection").
 *
 * @param io - Socket.IO server
 * @param database - Durable user + session storage
 */
export function setupAuthHandlers(io: Server, database: Database): void {
  io.on("connection", (socket: Socket) => {
    // ── REGISTER ────────────────────────────────────────────────────────
    // Triggered when: user creates a new account on the login screen
    // Does: validates fields, hashes password, persists the user, and
    //        returns the new account + a session token
    socket.on(
      "auth:register",
      async (data: { name: string; email: string; password: string }, ack?: (res: unknown) => void) => {
        try {
          const name = data?.name?.trim() ?? "";
          const email = data?.email?.trim().toLowerCase() ?? "";
          const password = data?.password ?? "";

          if (!name || !email || !password) {
            ack?.({ ok: false, error: "Name, email and password are required." });
            return;
          }
          if (!/^\S+@\S+\.\S+$/.test(email)) {
            ack?.({ ok: false, error: "Please enter a valid email address." });
            return;
          }
          if (password.length < 6) {
            ack?.({ ok: false, error: "Password must be at least 6 characters." });
            return;
          }
          if ((await database.findUserByEmail(email)) || (await database.findUserByName(name))) {
            ack?.({ ok: false, error: "An account with that name or email already exists." });
            return;
          }

          const salt = crypto.randomBytes(16).toString("hex");
          const passwordHash = hashPassword(password, salt);
          const user = await database.createUser(name, email, passwordHash, salt);
          const token = uuidv4();
          await database.createSession(token, user.id);
          ack?.({ ok: true, user: toPublicUser(user), token });
        } catch (err) {
          ack?.({ ok: false, error: "Registration failed. Please try again." });
        }
      }
    );

    // ── LOGIN ───────────────────────────────────────────────────────────
    // Triggered when: user signs in with email + password
    socket.on(
      "auth:login",
      async (data: { email: string; password: string }, ack?: (res: unknown) => void) => {
        try {
          const email = data?.email?.trim().toLowerCase() ?? "";
          const password = data?.password ?? "";
          const user = await database.findUserByEmail(email);
          if (!user || hashPassword(password, user.salt) !== user.passwordHash) {
            ack?.({ ok: false, error: "Invalid email or password." });
            return;
          }
          const token = uuidv4();
          await database.createSession(token, user.id);
          ack?.({ ok: true, user: toPublicUser(user), token });
        } catch (err) {
          ack?.({ ok: false, error: "Login failed. Please try again." });
        }
      }
    );

    // ── AUTH_ME ─────────────────────────────────────────────────────────
    // Triggered when: app loads with a stored token (restore session)
    socket.on("auth:me", async (data: { token: string }, ack?: (res: unknown) => void) => {
      const userId = await database.getSessionUserId(data?.token ?? "");
      if (!userId) {
        ack?.({ ok: false, error: "Session expired. Please sign in again." });
        return;
      }
      const stored = await database.findUserById(userId);
      if (!stored) {
        ack?.({ ok: false, error: "Account not found." });
        return;
      }
      ack?.({ ok: true, user: toPublicUser(stored) });
    });

    // ── LOGOUT ─────────────────────────────────────────────────────────
    socket.on("auth:logout", async (data: { token?: string }, ack?: (res: unknown) => void) => {
      const token = data?.token ?? (socket.handshake.auth as { token?: string } | undefined)?.token;
      if (token) await database.deleteSession(token);
      ack?.({ ok: true });
    });
  });
}
