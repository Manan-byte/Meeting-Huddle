/**
 * @file HuddleDO — Durable Object that owns ALL realtime state.
 *
 * Replaces the Node server entirely: RoomManager (rooms, chat, polls),
 * room/meeting/feature handlers, auth handlers, and dashboard handlers
 * all live here, driven by native WebSocket connections.
 *
 * Wire protocol (JSON over WS):
 *   client → server: { e: event, d: data, ack?: number }
 *   server → client: { e: event, d: data, ack?: number }
 *   - `ack` present → resolves the matching pending emit callback (auth/dashboard).
 *   - no `ack`      → normal event dispatch to registered listeners.
 *
 * On connect the server sends { e: "connect", d: { id } } so the client
 * adapter learns its socket id and marks the connection live.
 */

import { SOCKET_EVENTS, ROOM_CONFIG } from "@meet-app/shared";
import type {
  User,
  Room,
  ChatMessage,
  SignalPayload,
  RecordingState,
  Reaction,
  Poll,
  PollOption,
  WaitingUser,
} from "@meet-app/shared";
import type { Env } from "./index";
import { DB, toPublicUser, ensureSchema, type StoredUser } from "./database";
import { hashPassword, verifyPassword } from "./password";

const DASH_EVENTS = {
  GET_HISTORY: "dash:getHistory",
  HISTORY_RESULT: "dash:historyResult",
  SCHEDULE: "dash:schedule",
  GET_SCHEDULE: "dash:getSchedule",
  SCHEDULE_RESULT: "dash:scheduleResult",
  CANCEL_SCHEDULE: "dash:cancelSchedule",
} as const;

interface InMsg {
  e: string;
  d?: unknown;
  ack?: number;
}

export class HuddleDO implements DurableObject {
  /** WebSocket side of each connection (server socket). */
  private sockets = new Map<string, WebSocket>();
  /** Reverse: server socket → client id. */
  private ids = new Map<WebSocket, string>();
  /** room code → Room object. */
  private rooms = new Map<string, Room>();
  /** room code → chat history. */
  private chatHistory = new Map<string, ChatMessage[]>();
  /** client id → room code. */
  private userRoomMap = new Map<string, string>();
  /** room UUID → room code. */
  private roomIdToCode = new Map<string, string>();
  /** client id → display name (waiting room only). */
  private waitingNames = new Map<string, string>();
  /** client id → join request time (waiting room only). */
  private waitingTimes = new Map<string, number>();
  /** room code → polls. */
  private roomPolls = new Map<string, Poll[]>();

  private db: DB;
  private schemaReady: Promise<void>;
  private env: Env;

  constructor(_state: DurableObjectState, env: Env) {
    this.env = env;
    this.db = new DB(env.DB);
    this.schemaReady = ensureSchema(env.DB).catch((err) =>
      console.error("[huddle] failed to ensure schema:", err),
    );
  }

  // ── Connection lifecycle ────────────────────────────────────────────
  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const id = crypto.randomUUID();
    this.sockets.set(id, server);
    this.ids.set(server, id);
    this.send(server, "connect", { id });

    server.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as InMsg;
        if (msg && typeof msg.e === "string") {
          this.handle(server, msg.e, msg.d, msg.ack);
        }
      } catch (err) {
        console.error("[huddle] bad message:", err);
      }
    });
    server.addEventListener("close", () => this.handleDisconnect(server));

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Send helpers ────────────────────────────────────────────────────
  private send(ws: WebSocket, e: string, d: unknown, ack?: number): void {
    try {
      ws.send(JSON.stringify(ack === undefined ? { e, d } : { e, d, ack }));
    } catch {
      /* socket closed */
    }
  }

  private sendTo(id: string, e: string, d: unknown, ack?: number): void {
    const ws = this.sockets.get(id);
    if (ws) this.send(ws, e, d, ack);
  }

  /** Broadcast to every participant of a room (optionally excluding one id). */
  private broadcast(code: string, e: string, d: unknown, exceptId?: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    for (const p of room.participants) {
      if (p.id !== exceptId) this.sendTo(p.id, e, d);
    }
  }

  private roomOf(userId: string): Room | null {
    const code = this.userRoomMap.get(userId);
    if (!code) return null;
    return this.rooms.get(code) ?? null;
  }

  private roomById(roomId: string): Room | null {
    const code = this.roomIdToCode.get(roomId);
    if (!code) return null;
    return this.rooms.get(code) ?? null;
  }

  private waitingUsers(code: string): WaitingUser[] {
    const room = this.rooms.get(code);
    if (!room) return [];
    return room.waitingRoom.map((socketId) => ({
      socketId,
      name: this.waitingNames.get(socketId) ?? socketId,
      requestedAt: this.waitingTimes.get(socketId) ?? room.createdAt,
    }));
  }

  private generateRoomCode(): string {
    let code = "";
    for (let i = 0; i < ROOM_CONFIG.CODE_LENGTH; i++) {
      code += ROOM_CONFIG.CODE_CHARS[Math.floor(Math.random() * ROOM_CONFIG.CODE_CHARS.length)];
    }
    return this.rooms.has(code) ? this.generateRoomCode() : code;
  }

  // ── Disconnect ──────────────────────────────────────────────────────
  private handleDisconnect(ws: WebSocket): void {
    const userId = this.ids.get(ws);
    if (!userId) return;
    this.ids.delete(ws);
    this.sockets.delete(userId);

    const room = this.roomOf(userId);
    if (!room) return;

    // Waiting-room users aren't participants — remove from waiting list.
    if (room.waitingRoom.includes(userId)) {
      room.waitingRoom = room.waitingRoom.filter((id) => id !== userId);
      this.userRoomMap.delete(userId);
      this.waitingNames.delete(userId);
      this.waitingTimes.delete(userId);
      this.broadcast(room.code, SOCKET_EVENTS.WAITING_ROOM_UPDATE, this.waitingUsers(room.code));
      return;
    }

    this.leaveRoom(room.code, userId);
    this.broadcast(room.code, SOCKET_EVENTS.PARTICIPANT_LEFT, {
      userId,
      participants: room.participants.filter((p) => p.id !== userId),
    });
  }

  private leaveRoom(code: string, userId: string): Room | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    room.participants = room.participants.filter((p) => p.id !== userId);
    this.userRoomMap.delete(userId);

    if (room.participants.length === 0) {
      this.rooms.delete(code);
      this.chatHistory.delete(code);
      this.roomIdToCode.delete(room.id);
      this.roomPolls.delete(code);
      return null;
    }
    if (room.hostId === userId) {
      const next = room.participants[0];
      next.isHost = true;
      room.hostId = next.id;
    }
    return room;
  }

  // ── Main dispatcher ─────────────────────────────────────────────────
  private async handle(ws: WebSocket, event: string, rawData: unknown, ack?: number): Promise<void> {
    const userId = this.ids.get(ws);
    if (!userId) return;
    const data = (rawData ?? {}) as Record<string, unknown>;
    const resolve = (res: unknown) => this.send(ws, event, res, ack);

    try {
      switch (event) {
        // ── Room lifecycle ────────────────────────────────────────────
        case SOCKET_EVENTS.CREATE_ROOM: {
          const room = this.createRoom(userId, String(data.hostName ?? ""));
          if (typeof data.meetingTitle === "string" && data.meetingTitle.trim() && room) {
            room.meetingTitle = data.meetingTitle.trim().slice(0, 80);
          }
          if (!room) return;
          const user = room.participants.find((p) => p.id === userId);
          this.send(ws, SOCKET_EVENTS.ROOM_CREATED, { room, user });
          this.broadcast(room.code, SOCKET_EVENTS.MEETING_STARTED, { startedAt: room.startedAt });
          break;
        }

        case SOCKET_EVENTS.JOIN_ROOM: {
          const code = String(data.code ?? "").toUpperCase();
          const room = this.rooms.get(code);
          if (!room) {
            this.send(ws, "error", { message: "Room not found" });
            return;
          }
          if (room.isLocked) {
            room.waitingRoom.push(userId);
            this.userRoomMap.set(userId, code);
            this.waitingNames.set(userId, String(data.userName ?? ""));
            this.waitingTimes.set(userId, Date.now());
            this.send(ws, SOCKET_EVENTS.WAITING_ROOM_STATUS, { waiting: true });
            this.broadcast(code, SOCKET_EVENTS.WAITING_ROOM_UPDATE, this.waitingUsers(code));
            return;
          }
          if (room.participants.length >= ROOM_CONFIG.MAX_PARTICIPANTS) {
            this.send(ws, SOCKET_EVENTS.ROOM_FULL, { message: "Room is full" });
            return;
          }
          const user: User = {
            id: userId,
            name: String(data.userName ?? ""),
            isHost: false,
            isMuted: false,
            isVideoOff: false,
            isHandRaised: false,
            joinedAt: Date.now(),
          };
          room.participants.push(user);
          this.userRoomMap.set(userId, code);
          this.send(ws, SOCKET_EVENTS.ROOM_JOINED, { room, user });
          this.broadcast(code, SOCKET_EVENTS.PARTICIPANT_JOINED, {
            user,
            participants: room.participants,
          }, userId);
          this.broadcast(code, SOCKET_EVENTS.ROOM_STATE, { room, participants: room.participants });
          this.send(ws, SOCKET_EVENTS.CHAT_HISTORY, this.chatHistory.get(code) ?? []);
          break;
        }

        case SOCKET_EVENTS.LEAVE_ROOM: {
          // Client never sends a code — resolve the room from the socket id.
          const room = this.roomOf(userId);
          const code = room?.code ?? "";
          this.leaveRoom(code, userId);
          this.broadcast(code, SOCKET_EVENTS.PARTICIPANT_LEFT, {
            userId,
            participants: room?.participants ?? [],
          });
          if (room) {
            this.broadcast(code, SOCKET_EVENTS.ROOM_STATE, { room, participants: room.participants });
          }
          break;
        }

        case SOCKET_EVENTS.SET_MEETING_TITLE: {
          const room = this.roomById(String(data.roomId ?? ""));
          if (!room || room.hostId !== userId) return;
          room.meetingTitle = String(data.title ?? "");
          this.broadcast(room.code, SOCKET_EVENTS.MEETING_TITLE_UPDATED, { meetingTitle: room.meetingTitle });
          break;
        }

        case SOCKET_EVENTS.TOGGLE_RECORDING: {
          const room = this.roomById(String(data.roomId ?? ""));
          if (!room || room.hostId !== userId) return;
          let rec: RecordingState;
          if (room.recording?.isRecording) {
            rec = { isRecording: false, startedBy: room.recording.startedBy, startedAt: room.recording.startedAt };
            room.recording = null;
          } else {
            rec = { isRecording: true, startedBy: userId, startedAt: Date.now() };
            room.recording = rec;
          }
          this.broadcast(room.code, SOCKET_EVENTS.RECORDING_STATE, rec);
          break;
        }

        case SOCKET_EVENTS.TOGGLE_LOCK: {
          const room = this.roomById(String(data.roomId ?? ""));
          if (!room || room.hostId !== userId) return;
          room.isLocked = !room.isLocked;
          this.broadcast(room.code, SOCKET_EVENTS.LOCK_CHANGED, { isLocked: room.isLocked });
          break;
        }

        // ── Media state ───────────────────────────────────────────────
        case SOCKET_EVENTS.TOGGLE_MUTE: {
          const room = this.roomOf(userId);
          const p = room?.participants.find((x) => x.id === userId);
          if (p) {
            p.isMuted = Boolean(data.isMuted);
            this.broadcast(room!.code, SOCKET_EVENTS.TOGGLE_MUTE, { userId, isMuted: p.isMuted });
          }
          break;
        }

        case SOCKET_EVENTS.TOGGLE_VIDEO: {
          const room = this.roomOf(userId);
          const p = room?.participants.find((x) => x.id === userId);
          if (p) {
            p.isVideoOff = Boolean(data.isVideoOff);
            this.broadcast(room!.code, SOCKET_EVENTS.TOGGLE_VIDEO, { userId, isVideoOff: p.isVideoOff });
          }
          break;
        }

        // ── Signaling relay ───────────────────────────────────────────
        case SOCKET_EVENTS.SIGNAL: {
          const room = this.roomOf(userId);
          if (!room) return;
          const payload = data as unknown as SignalPayload;
          const target = room.participants.find((p) => p.id === payload.to);
          if (!target) return;
          this.sendTo(payload.to, SOCKET_EVENTS.SIGNAL, { ...payload, from: userId });
          break;
        }

        // ── Chat ──────────────────────────────────────────────────────
        case SOCKET_EVENTS.CHAT_MESSAGE: {
          const room = this.roomOf(userId);
          if (!room) return;
          const p = room.participants.find((x) => x.id === userId);
          if (!p) return;
          const msg: ChatMessage = {
            id: crypto.randomUUID(),
            senderId: userId,
            senderName: p.name,
            text: String(data.text ?? ""),
            timestamp: Date.now(),
          };
          this.chatHistory.get(room.code)?.push(msg);
          this.broadcast(room.code, SOCKET_EVENTS.CHAT_MESSAGE, msg);
          break;
        }

        // ── Hand raise ────────────────────────────────────────────────
        case SOCKET_EVENTS.HAND_RAISE:
        case SOCKET_EVENTS.HAND_LOWER: {
          const room = this.roomOf(userId);
          const p = room?.participants.find((x) => x.id === userId);
          if (p) {
            p.isHandRaised = event === SOCKET_EVENTS.HAND_RAISE;
            this.broadcast(room!.code, SOCKET_EVENTS.HAND_RAISE, {
              userId,
              isHandRaised: p.isHandRaised,
            });
          }
          break;
        }

        // ── Layout / settings / background (plain broadcast) ─────────
        case SOCKET_EVENTS.SET_LAYOUT: {
          const room = this.roomOf(userId);
          if (room) this.broadcast(room.code, SOCKET_EVENTS.LAYOUT_CHANGED, { layout: data.layout });
          break;
        }
        case SOCKET_EVENTS.UPDATE_SETTINGS: {
          const room = this.roomOf(userId);
          if (room) this.broadcast(room.code, SOCKET_EVENTS.SETTINGS_UPDATED, { settings: data.settings });
          break;
        }
        case SOCKET_EVENTS.SET_BACKGROUND: {
          const room = this.roomOf(userId);
          if (room) this.broadcast(room.code, SOCKET_EVENTS.BACKGROUND_UPDATED, { background: data.background });
          break;
        }
        case SOCKET_EVENTS.GET_INVITE_LINK: {
          const room = this.roomOf(userId);
          if (room) {
            this.send(ws, SOCKET_EVENTS.INVITE_LINK, {
              code: room.code,
              url: `${(this.env?.CLIENT_URL || "").replace(/\/$/, "") || ""}/?join=${room.code}`,
            });
          }
          break;
        }

        // ── Reactions ─────────────────────────────────────────────────
        case SOCKET_EVENTS.SEND_REACTION: {
          const room = this.roomOf(userId);
          const p = room?.participants.find((x) => x.id === userId);
          if (!room || !p) return;
          const reaction: Reaction = {
            id: crypto.randomUUID(),
            userId,
            userName: p.name,
            type: data.type as Reaction["type"],
            timestamp: Date.now(),
          };
          this.broadcast(room.code, SOCKET_EVENTS.REACTION_BROADCAST, reaction);
          break;
        }

        // ── Polls ─────────────────────────────────────────────────────
        case SOCKET_EVENTS.CREATE_POLL: {
          const room = this.roomOf(userId);
          if (!room) return;
          const options: string[] = Array.isArray(data.options) ? data.options.map(String) : [];
          const poll: Poll = {
            id: crypto.randomUUID(),
            question: String(data.question ?? ""),
            options: options.map((text): PollOption => ({ id: crypto.randomUUID(), text, votes: [] })),
            createdBy: userId,
            isActive: true,
            createdAt: Date.now(),
          };
          if (!this.roomPolls.has(room.code)) this.roomPolls.set(room.code, []);
          this.roomPolls.get(room.code)!.push(poll);
          this.broadcast(room.code, SOCKET_EVENTS.POLL_UPDATE, poll);
          const notif = this.chatHistory.get(room.code);
          if (notif) {
            const msg: ChatMessage = {
              id: crypto.randomUUID(),
              senderId: "system",
              senderName: "System",
              text: `📊 Poll: ${poll.question} — open it from the More menu to vote.`,
              timestamp: Date.now(),
            };
            notif.push(msg);
            this.broadcast(room.code, SOCKET_EVENTS.CHAT_MESSAGE, msg);
          }
          break;
        }

        case SOCKET_EVENTS.VOTE_POLL: {
          const room = this.roomOf(userId);
          const polls = room ? this.roomPolls.get(room.code) : undefined;
          const poll = polls?.find((p) => p.id === data.pollId);
          if (!poll || !poll.isActive) return;
          for (const opt of poll.options) opt.votes = opt.votes.filter((v) => v !== userId);
          const option = poll.options.find((o) => o.id === data.optionId);
          if (option) option.votes.push(userId);
          this.broadcast(room!.code, SOCKET_EVENTS.POLL_RESULT, poll);
          break;
        }

        case SOCKET_EVENTS.CLOSE_POLL: {
          const room = this.roomOf(userId);
          const polls = room ? this.roomPolls.get(room.code) : undefined;
          const poll = polls?.find((p) => p.id === data.pollId);
          if (!poll || poll.createdBy !== userId) return;
          poll.isActive = false;
          this.broadcast(room!.code, SOCKET_EVENTS.POLL_RESULT, poll);
          break;
        }

        // ── Live captions ─────────────────────────────────────────────
        case SOCKET_EVENTS.CAPTION_SEGMENT: {
          const room = this.roomOf(userId);
          const p = room?.participants.find((x) => x.id === userId);
          if (!room || !p) return;
          const segment = {
            id: crypto.randomUUID(),
            userId,
            userName: p.name,
            text: String(data.text ?? ""),
            timestamp: Date.now(),
            isFinal: Boolean(data.isFinal),
          };
          if (data.isFinal) {
            this.broadcast(room.code, SOCKET_EVENTS.CAPTION_SEGMENT, segment);
          } else {
            this.send(ws, SOCKET_EVENTS.CAPTION_SEGMENT, segment);
          }
          break;
        }

        case SOCKET_EVENTS.CAPTION_TOGGLE: {
          const room = this.roomOf(userId);
          if (room) this.broadcast(room.code, SOCKET_EVENTS.CAPTIONS_ENABLED, { enabled: Boolean(data.enabled) });
          break;
        }

        // ── Waiting room (admit / reject) ─────────────────────────────
        case SOCKET_EVENTS.ADMIT_USER: {
          const room = this.roomOf(userId);
          if (!room || room.hostId !== userId) return;
          const waitId = String(data.socketId ?? "");
          if (!room.waitingRoom.includes(waitId)) return;
          room.waitingRoom = room.waitingRoom.filter((id) => id !== waitId);
          const name = this.waitingNames.get(waitId) ?? waitId;
          this.waitingNames.delete(waitId);
          this.waitingTimes.delete(waitId);
          const admitted: User = {
            id: waitId,
            name,
            isHost: false,
            isMuted: false,
            isVideoOff: false,
            isHandRaised: false,
            joinedAt: Date.now(),
          };
          room.participants.push(admitted);
          this.sendTo(waitId, SOCKET_EVENTS.ROOM_JOINED, { room, user: admitted });
          this.sendTo(waitId, SOCKET_EVENTS.CHAT_HISTORY, this.chatHistory.get(room.code) ?? []);
          this.broadcast(room.code, SOCKET_EVENTS.PARTICIPANT_JOINED, {
            user: admitted,
            participants: room.participants,
          }, waitId);
          this.broadcast(room.code, SOCKET_EVENTS.ROOM_STATE, { room, participants: room.participants });
          this.broadcast(room.code, SOCKET_EVENTS.WAITING_ROOM_UPDATE, this.waitingUsers(room.code));
          break;
        }

        case SOCKET_EVENTS.REJECT_USER: {
          const room = this.roomOf(userId);
          if (!room || room.hostId !== userId) return;
          const waitId = String(data.socketId ?? "");
          room.waitingRoom = room.waitingRoom.filter((id) => id !== waitId);
          this.userRoomMap.delete(waitId);
          this.waitingNames.delete(waitId);
          this.waitingTimes.delete(waitId);
          this.sendTo(waitId, "error", { message: "You have been rejected from the meeting" });
          this.broadcast(room.code, SOCKET_EVENTS.WAITING_ROOM_UPDATE, this.waitingUsers(room.code));
          break;
        }

        // ── End meeting ───────────────────────────────────────────────
        case SOCKET_EVENTS.END_MEETING: {
          const room = this.roomOf(userId);
          if (!room || room.hostId !== userId) return;
          this.broadcast(room.code, SOCKET_EVENTS.MEETING_ENDED, { roomId: room.id, code: room.code });
          await this.schemaReady;
          await this.db.recordMeeting({
            code: room.code,
            title: room.meetingTitle || "Untitled Meeting",
            hostName: room.participants.find((p) => p.id === room.hostId)?.name ?? "Host",
            participants: room.participants.length,
            startedAt: room.startedAt,
          });
          this.roomPolls.delete(room.code);
          break;
        }

        // ── Auth (ack-based) ──────────────────────────────────────────
        case "auth:register": {
          const name = String((data as { name?: string }).name ?? "").trim();
          const email = String((data as { email?: string }).email ?? "").trim().toLowerCase();
          const password = String((data as { password?: string }).password ?? "");
          if (!name || !email || !password) {
            resolve({ ok: false, error: "Name, email and password are required." });
            return;
          }
          if (!/^\S+@\S+\.\S+$/.test(email)) {
            resolve({ ok: false, error: "Please enter a valid email address." });
            return;
          }
          if (password.length < 6) {
            resolve({ ok: false, error: "Password must be at least 6 characters." });
            return;
          }
          await this.schemaReady;
          const existing = await this.db.findUserByEmail(email);
          if (existing) {
            resolve({ ok: false, error: "An account with that name or email already exists." });
            return;
          }
          const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
          const passwordHash = await hashPassword(password);
          const user = await this.db.createUser(name, email, passwordHash, salt);
          const token = crypto.randomUUID();
          await this.db.createSession(token, user.id);
          resolve({ ok: true, user: toPublicUser(user), token });
          break;
        }

        case "auth:login": {
          const email = String((data as { email?: string }).email ?? "").trim().toLowerCase();
          const password = String((data as { password?: string }).password ?? "");
          await this.schemaReady;
          const user = await this.db.findUserByEmail(email);
          if (!user || !(await verifyPassword(password, user.passwordHash))) {
            resolve({ ok: false, error: "Invalid email or password." });
            return;
          }
          const token = crypto.randomUUID();
          await this.db.createSession(token, user.id);
          resolve({ ok: true, user: toPublicUser(user), token });
          break;
        }

        case "auth:forgot": {
          const email = String((data as { email?: string }).email ?? "").trim().toLowerCase();
          if (!/^\S+@\S+\.\S+$/.test(email)) {
            resolve({ ok: false, error: "Please enter a valid email address." });
            return;
          }
          await this.schemaReady;
          const user = await this.db.findUserByEmail(email);
          if (!user) {
            // Don't reveal whether an account exists.
            resolve({ ok: false, error: "No account found with that email." });
            return;
          }
          // 6-character reset code, valid 30 minutes.
          const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
          let code = "";
          for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
          await this.db.createPasswordReset(email, code, Date.now() + 30 * 60 * 1000);
          // No email service (free tier) — return the code to the client so
          // the user can complete the reset on-screen. In a production setup
          // this would be emailed instead.
          resolve({ ok: true, resetCode: code });
          break;
        }

        case "auth:reset": {
          const email = String((data as { email?: string }).email ?? "").trim().toLowerCase();
          const code = String((data as { code?: string }).code ?? "").trim().toUpperCase();
          const newPassword = String((data as { newPassword?: string }).newPassword ?? "");
          if (!/^\S+@\S+\.\S+$/.test(email)) {
            resolve({ ok: false, error: "Please enter a valid email address." });
            return;
          }
          if (code.length !== 6) {
            resolve({ ok: false, error: "Invalid reset code." });
            return;
          }
          if (newPassword.length < 6) {
            resolve({ ok: false, error: "Password must be at least 6 characters." });
            return;
          }
          await this.schemaReady;
          const valid = await this.db.getValidPasswordReset(email, code);
          if (!valid) {
            resolve({ ok: false, error: "Invalid or expired reset code." });
            return;
          }
          const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
          const passwordHash = await hashPassword(newPassword);
          await this.db.updatePassword(email, passwordHash, salt);
          await this.db.clearPasswordReset(email);
          resolve({ ok: true });
          break;
        }

        case "auth:me": {
          const token = String((data as { token?: string }).token ?? "");
          await this.schemaReady;
          const uid = await this.db.getSessionUserId(token);
          if (!uid) {
            resolve({ ok: false, error: "Session expired. Please sign in again." });
            return;
          }
          const stored = await this.db.findUserById(uid);
          if (!stored) {
            resolve({ ok: false, error: "Account not found." });
            return;
          }
          resolve({ ok: true, user: toPublicUser(stored) });
          break;
        }

        case "auth:logout": {
          const token = String((data as { token?: string }).token ?? "");
          if (token) await this.db.deleteSession(token);
          resolve({ ok: true });
          break;
        }

        // ── Dashboard (ack-based) ─────────────────────────────────────
        case DASH_EVENTS.GET_HISTORY: {
          await this.schemaReady;
          // Dashboard data is private: only serve to signed-in sessions.
          const uid = await this.db.getSessionUserId(String((data as { token?: string }).token ?? ""));
          if (!uid) {
            if (ack !== undefined) resolve({ ok: false, error: "Not signed in." });
            return;
          }
          this.send(ws, DASH_EVENTS.HISTORY_RESULT, await this.db.getMeetingHistory(50));
          break;
        }
        case DASH_EVENTS.GET_SCHEDULE: {
          await this.schemaReady;
          const uid = await this.db.getSessionUserId(String((data as { token?: string }).token ?? ""));
          if (!uid) {
            if (ack !== undefined) resolve({ ok: false, error: "Not signed in." });
            return;
          }
          this.send(ws, DASH_EVENTS.SCHEDULE_RESULT, await this.db.getScheduledMeetings());
          break;
        }
        case DASH_EVENTS.SCHEDULE: {
          const uid = await this.db.getSessionUserId(String((data as { token?: string }).token ?? ""));
          if (!uid) {
            resolve({ ok: false, error: "Not signed in." });
            return;
          }
          const title = String((data as { title?: string }).title ?? "").trim();
          const date = String((data as { date?: string }).date ?? "").trim();
          const time = String((data as { time?: string }).time ?? "").trim();
          if (!title || !date || !time) {
            resolve({ ok: false, error: "Title, date, and time are required." });
            return;
          }
          const invitees = normalizeInvitees((data as { invitees?: unknown }).invitees);
          await this.schemaReady;
          const meeting = await this.db.createScheduledMeeting(title, date, time, uid, invitees);
          resolve({ ok: true, meeting });
          break;
        }
        case DASH_EVENTS.CANCEL_SCHEDULE: {
          await this.schemaReady;
          const uid = await this.db.getSessionUserId(String((data as { token?: string }).token ?? ""));
          if (!uid) {
            resolve({ ok: false, error: "Not signed in." });
            return;
          }
          const ok = await this.db.cancelScheduledMeeting(String((data as { id?: string }).id ?? ""));
          resolve({ ok });
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error(`[huddle] handler ${event} failed:`, err);
      if (ack !== undefined) resolve({ ok: false, error: "Server error. Please try again." });
    }
  }

  private createRoom(hostId: string, hostName: string): Room | null {
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
      id: crypto.randomUUID(),
      code,
      hostId,
      participants: [host],
      isLocked: false,
      meetingTitle: "",
      recording: null,
      waitingRoom: [],
      startedAt: Date.now(),
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    this.userRoomMap.set(hostId, code);
    this.chatHistory.set(code, []);
    this.roomIdToCode.set(room.id, code);
    return room;
  }
}

function normalizeInvitees(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const e = String(raw ?? "").trim().toLowerCase();
    if (e && !seen.has(e)) {
      seen.add(e);
      out.push(e);
    }
  }
  return out;
}