/**
 * @file Database — Cloudflare D1 (serverless SQLite) persistence for Huddle.
 *
 * Stores durable application data that must survive server restarts:
 *   - users (accounts for auth)
 *   - sessions (login tokens)
 *   - meetingHistory (past meetings)
 *   - scheduledMeetings (upcoming meetings)
 *
 * Storage is Cloudflare D1, accessed over its HTTP API (see D1Client). This
 * replaced the old `db.json` file so data scales with a managed serverless DB
 * and survives across server restarts/deploys. In-memory room state still
 * lives in RoomManager.
 *
 * All methods are async (D1 is a network call). If D1 is not configured, the
 * client logs a warning and methods return empty/undefined (the server still
 * boots; auth/data features are unavailable until configured).
 *
 * Connects to: D1Client, auth/room/dashboard/meeting handlers.
 */

import { v4 as uuidv4 } from "uuid";
import { D1Client } from "./D1Client.js";

/** A persisted user account. */
export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  salt: string;
  /** GitHub account id for OAuth sign-ins (undefined for email/password users). */
  githubId?: string;
  createdAt: number;
}

/** A user as exposed to clients (never includes password/salt). */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

/** A past meeting recorded when a room closes. */
export interface MeetingRecord {
  id: string;
  code: string;
  title: string;
  hostName: string;
  participants: number;
  startedAt: number;
  endedAt: number;
}

/** An upcoming scheduled meeting. */
export interface ScheduledMeeting {
  id: string;
  title: string;
  date: string;
  time: string;
  code: string;
  createdBy: string;
  createdAt: number;
  /** Guest email addresses invited to this meeting (optional). */
  invitees?: string[];
}

/** A persisted login session (survives server restarts). */
export interface StoredSession {
  token: string;
  userId: string;
  createdAt: number;
}

/** Generate a room code matching the shared ROOM_CONFIG alphabet. */
function makeCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export class Database {
  private d1: D1Client;
  /** Whether the schema has been (attempted to be) initialized once. */
  private initPromise: Promise<void> | null = null;

  constructor(d1: D1Client) {
    this.d1 = d1;
  }

  /** Create tables if they don't exist (idempotent). */
  private ensureSchema(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.d1
        .batch([
          {
            sql: `CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
              password_hash TEXT NOT NULL, salt TEXT NOT NULL,
              github_id TEXT, created_at INTEGER NOT NULL
            )`,
          },
          {
            sql: `CREATE TABLE IF NOT EXISTS sessions (
              token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL
            )`,
          },
          {
            sql: `CREATE TABLE IF NOT EXISTS meeting_history (
              id TEXT PRIMARY KEY, code TEXT NOT NULL, title TEXT NOT NULL,
              host_name TEXT NOT NULL, participants INTEGER NOT NULL,
              started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL
            )`,
          },
          {
            sql: `CREATE TABLE IF NOT EXISTS scheduled_meetings (
              id TEXT PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL,
              time TEXT NOT NULL, code TEXT NOT NULL, created_by TEXT NOT NULL,
              created_at INTEGER NOT NULL, invitees TEXT
            )`,
          },
        ])
        .then(() => undefined)
        .catch((err) => console.error("[database] failed to ensure schema:", err));
    }
    return this.initPromise;
  }

  // ── Sessions (persistent auth) ────────────────────────────────────

  /** Store a new session token for a user. */
  async createSession(token: string, userId: string): Promise<void> {
    await this.ensureSchema();
    await this.d1.query("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", [token, userId, Date.now()]);
  }

  /** Look up the user id for a session token, or undefined. */
  async getSessionUserId(token: string): Promise<string | undefined> {
    await this.ensureSchema();
    const rows = await this.d1.query("SELECT user_id FROM sessions WHERE token = ?", [token]);
    return rows?.[0]?.user_id as string | undefined;
  }

  /** Invalidate a session token. */
  async deleteSession(token: string): Promise<void> {
    await this.ensureSchema();
    await this.d1.query("DELETE FROM sessions WHERE token = ?", [token]);
  }

  // ── Users (auth) ──────────────────────────────────────────────────

  async findUserByEmail(email: string): Promise<StoredUser | undefined> {
    await this.ensureSchema();
    return this.userFromRow((await this.d1.query("SELECT * FROM users WHERE email = ?", [email.trim().toLowerCase()]))?.[0]);
  }

  async findUserByGithubId(githubId: string): Promise<StoredUser | undefined> {
    await this.ensureSchema();
    return this.userFromRow((await this.d1.query("SELECT * FROM users WHERE github_id = ?", [githubId]))?.[0]);
  }

  async findUserByName(name: string): Promise<StoredUser | undefined> {
    await this.ensureSchema();
    return this.userFromRow((await this.d1.query("SELECT * FROM users WHERE lower(name) = ?", [name.trim().toLowerCase()]))?.[0]);
  }

  async findUserById(id: string): Promise<StoredUser | undefined> {
    await this.ensureSchema();
    return this.userFromRow((await this.d1.query("SELECT * FROM users WHERE id = ?", [id]))?.[0]);
  }

  async createUser(name: string, email: string, passwordHash: string, salt: string, githubId?: string): Promise<StoredUser> {
    await this.ensureSchema();
    const user: StoredUser = {
      id: uuidv4(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      salt,
      githubId,
      createdAt: Date.now(),
    };
    await this.d1.query(
      "INSERT INTO users (id, name, email, password_hash, salt, github_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [user.id, user.name, user.email, user.passwordHash, user.salt, user.githubId ?? null, user.createdAt],
    );
    return user;
  }

  // ── Meeting history ───────────────────────────────────────────────

  /** Record a completed meeting (called when a room closes). */
  async recordMeeting(record: Omit<MeetingRecord, "id" | "endedAt">): Promise<void> {
    await this.ensureSchema();
    await this.d1.query(
      "INSERT INTO meeting_history (id, code, title, host_name, participants, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [uuidv4(), record.code, record.title, record.hostName, record.participants, record.startedAt, Date.now()],
    );
  }

  /** Most recent meetings, newest first. */
  async getMeetingHistory(limit = 50): Promise<MeetingRecord[]> {
    await this.ensureSchema();
    const rows = (await this.d1.query("SELECT * FROM meeting_history ORDER BY ended_at DESC LIMIT ?", [limit])) ?? [];
    return rows.map((r) => ({
      id: r.id as string,
      code: r.code as string,
      title: r.title as string,
      hostName: r.host_name as string,
      participants: r.participants as number,
      startedAt: r.started_at as number,
      endedAt: r.ended_at as number,
    }));
  }

  // ── Scheduled meetings ────────────────────────────────────────────

  async createScheduledMeeting(title: string, date: string, time: string, createdBy: string, invitees?: string[]): Promise<ScheduledMeeting> {
    await this.ensureSchema();
    const item: ScheduledMeeting = {
      id: uuidv4(),
      title: title.trim(),
      date,
      time,
      code: makeCode(),
      createdBy,
      createdAt: Date.now(),
      invitees: invitees?.length ? invitees : undefined,
    };
    await this.d1.query(
      "INSERT INTO scheduled_meetings (id, title, date, time, code, created_by, created_at, invitees) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [item.id, item.title, item.date, item.time, item.code, item.createdBy, item.createdAt, item.invitees ? JSON.stringify(item.invitees) : null],
    );
    return item;
  }

  async getScheduledMeetings(): Promise<ScheduledMeeting[]> {
    await this.ensureSchema();
    const rows = (await this.d1.query("SELECT * FROM scheduled_meetings")) ?? [];
    const list = rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      date: r.date as string,
      time: r.time as string,
      code: r.code as string,
      createdBy: r.created_by as string,
      createdAt: r.created_at as number,
      invitees: r.invitees ? (JSON.parse(r.invitees as string) as string[]) : undefined,
    }));
    // Sort by date + time ascending (upcoming first).
    return list.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  }

  async cancelScheduledMeeting(id: string): Promise<boolean> {
    await this.ensureSchema();
    const meta = await this.d1.queryMeta("DELETE FROM scheduled_meetings WHERE id = ?", [id]);
    return (meta?.changes ?? 0) > 0;
  }

  // ── Row mapping ───────────────────────────────────────────────────

  private userFromRow(row: { [k: string]: unknown } | undefined): StoredUser | undefined {
    if (!row) return undefined;
    return {
      id: row.id as string,
      name: row.name as string,
      email: row.email as string,
      passwordHash: row.password_hash as string,
      salt: row.salt as string,
      githubId: (row.github_id as string | null) ?? undefined,
      createdAt: row.created_at as number,
    };
  }
}

// Re-export a public user shape (never leaks password/salt).
export function toPublicUser(u: StoredUser): PublicUser {
  return { id: u.id, name: u.name, email: u.email };
}
