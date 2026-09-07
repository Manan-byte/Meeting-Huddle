/**
 * @file D1 persistence for the Huddle Worker.
 *
 * Replaces apps/server Database.ts + D1Client.ts. Uses the native D1 binding
 * (env.DB) instead of the HTTP query API. Schema is identical to the old
 * server so an existing database keeps working.
 */

import type { Env } from "./index";

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  salt: string;
  githubId?: string;
  googleId?: string;
  createdAt: number;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

export interface MeetingRecord {
  id: string;
  code: string;
  title: string;
  hostName: string;
  participants: number;
  startedAt: number;
  endedAt: number;
}

export interface ScheduledMeeting {
  id: string;
  title: string;
  date: string;
  time: string;
  code: string;
  createdBy: string;
  createdAt: number;
  invitees?: string[];
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

function uuid(): string {
  return crypto.randomUUID();
}

export function toPublicUser(u: StoredUser): PublicUser {
  return { id: u.id, name: u.name, email: u.email };
}

/** Ensure tables exist (idempotent). D1 binding does not auto-create tables. */
export async function ensureSchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
      password_hash TEXT NOT NULL, salt TEXT NOT NULL,
      github_id TEXT, google_id TEXT, created_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS meeting_history (
      id TEXT PRIMARY KEY, code TEXT NOT NULL, title TEXT NOT NULL,
      host_name TEXT NOT NULL, participants INTEGER NOT NULL,
      started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS scheduled_meetings (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL,
      time TEXT NOT NULL, code TEXT NOT NULL, created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL, invitees TEXT
    )`),
  ]);

  // Migrate older databases that lack the google_id column (added later).
  try {
    await db.prepare("ALTER TABLE users ADD COLUMN google_id TEXT").run();
  } catch {
    // Column already exists — fine.
  }
}

export class DB {
  constructor(private db: D1Database) {}

  // ── Sessions ────────────────────────────────────────────────────────
  async createSession(token: string, userId: string): Promise<void> {
    await this.db
      .prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)")
      .bind(token, userId, Date.now())
      .run();
  }

  async getSessionUserId(token: string): Promise<string | undefined> {
    const row = await this.db.prepare("SELECT user_id FROM sessions WHERE token = ?").bind(token).first<{ user_id: string }>();
    return row?.user_id;
  }

  async deleteSession(token: string): Promise<void> {
    await this.db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }

  // ── Users ───────────────────────────────────────────────────────────
  private async userFromQuery(sql: string, ...args: unknown[]): Promise<StoredUser | undefined> {
    const row = await this.db.prepare(sql).bind(...args).first<Record<string, unknown>>();
    if (!row) return undefined;
    return {
      id: row.id as string,
      name: row.name as string,
      email: row.email as string,
      passwordHash: row.password_hash as string,
      salt: row.salt as string,
      githubId: (row.github_id as string) ?? undefined,
      googleId: (row.google_id as string) ?? undefined,
      createdAt: row.created_at as number,
    };
  }

  async findUserByEmail(email: string): Promise<StoredUser | undefined> {
    return this.userFromQuery("SELECT * FROM users WHERE email = ?", email.trim().toLowerCase());
  }

  async findUserByGithubId(githubId: string): Promise<StoredUser | undefined> {
    return this.userFromQuery("SELECT * FROM users WHERE github_id = ?", githubId);
  }

  async findUserByGoogleId(googleId: string): Promise<StoredUser | undefined> {
    return this.userFromQuery("SELECT * FROM users WHERE google_id = ?", googleId);
  }

  async findUserById(id: string): Promise<StoredUser | undefined> {
    return this.userFromQuery("SELECT * FROM users WHERE id = ?", id);
  }

  async createUser(name: string, email: string, passwordHash: string, salt: string, githubId?: string, googleId?: string): Promise<StoredUser> {
    const user: StoredUser = {
      id: uuid(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      salt,
      githubId,
      googleId,
      createdAt: Date.now(),
    };
    await this.db
      .prepare("INSERT INTO users (id, name, email, password_hash, salt, github_id, google_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(user.id, user.name, user.email, user.passwordHash, user.salt, user.githubId ?? null, user.googleId ?? null, user.createdAt)
      .run();
    return user;
  }

  // ── Meeting history ─────────────────────────────────────────────────
  async recordMeeting(r: Omit<MeetingRecord, "id" | "endedAt">): Promise<void> {
    await this.db
      .prepare("INSERT INTO meeting_history (id, code, title, host_name, participants, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(uuid(), r.code, r.title, r.hostName, r.participants, r.startedAt, Date.now())
      .run();
  }

  async getMeetingHistory(limit = 50): Promise<MeetingRecord[]> {
    const rows = await this.db.prepare("SELECT * FROM meeting_history ORDER BY ended_at DESC LIMIT ?").bind(limit).all<Record<string, unknown>>();
    return rows.results.map((r) => ({
      id: r.id as string,
      code: r.code as string,
      title: r.title as string,
      hostName: r.host_name as string,
      participants: r.participants as number,
      startedAt: r.started_at as number,
      endedAt: r.ended_at as number,
    }));
  }

  // ── Scheduled meetings ──────────────────────────────────────────────
  async createScheduledMeeting(title: string, date: string, time: string, createdBy: string, invitees?: string[]): Promise<ScheduledMeeting> {
    const item: ScheduledMeeting = {
      id: uuid(),
      title: title.trim(),
      date,
      time,
      code: makeCode(),
      createdBy,
      createdAt: Date.now(),
      invitees: invitees?.length ? invitees : undefined,
    };
    await this.db
      .prepare("INSERT INTO scheduled_meetings (id, title, date, time, code, created_by, created_at, invitees) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(item.id, item.title, item.date, item.time, item.code, item.createdBy, item.createdAt, item.invitees ? JSON.stringify(item.invitees) : null)
      .run();
    return item;
  }

  async getScheduledMeetings(): Promise<ScheduledMeeting[]> {
    const rows = await this.db.prepare("SELECT * FROM scheduled_meetings").all<Record<string, unknown>>();
    const list = rows.results.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      date: r.date as string,
      time: r.time as string,
      code: r.code as string,
      createdBy: r.created_by as string,
      createdAt: r.created_at as number,
      invitees: r.invitees ? (JSON.parse(r.invitees as string) as string[]) : undefined,
    }));
    return list.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  }

  async cancelScheduledMeeting(id: string): Promise<boolean> {
    const res = await this.db.prepare("DELETE FROM scheduled_meetings WHERE id = ?").bind(id).run();
    return (res.meta.changes ?? 0) > 0;
  }
}
