import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { D1Client } from "./D1Client.js";
import { Database } from "./Database.js";

/** Build a fake Response-like object for the mocked fetch. */
function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

describe("D1Client", () => {
  const OLD = { CF_ACCOUNT_ID: undefined, D1_DATABASE_ID: undefined, CF_API_TOKEN: undefined };
  beforeEach(() => {
    process.env.CF_ACCOUNT_ID = "acct-1";
    process.env.D1_DATABASE_ID = "db-1";
    process.env.CF_API_TOKEN = "tok-1";
  });
  afterEach(() => {
    process.env.CF_ACCOUNT_ID = OLD.CF_ACCOUNT_ID;
    process.env.D1_DATABASE_ID = OLD.D1_DATABASE_ID;
    process.env.CF_API_TOKEN = OLD.CF_API_TOKEN;
  });

  it("queries D1 and returns rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({ success: true, result: [{ results: [{ id: "u1", name: "Alice" }], success: true }] }),
    );
    const client = new D1Client(fetchMock);
    const rows = await client.query("SELECT * FROM users WHERE id = ?", ["u1"]);

    expect(rows).toEqual([{ id: "u1", name: "Alice" }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/client/v4/accounts/acct-1/d1/database/db-1/query");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
  });

  it("throws on D1 API error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({ success: false, errors: [{ message: "boom" }] }),
    );
    const client = new D1Client(fetchMock);
    await expect(client.query("SELECT 1")).rejects.toThrow("boom");
  });

  it("is not configured without credentials", () => {
    delete process.env.CF_ACCOUNT_ID;
    const client = new D1Client(vi.fn());
    expect(client.configured).toBe(false);
  });
});

describe("Database (D1-backed)", () => {
  const OLD = { CF_ACCOUNT_ID: undefined, D1_DATABASE_ID: undefined, CF_API_TOKEN: undefined };
  beforeEach(() => {
    process.env.CF_ACCOUNT_ID = "acct-1";
    process.env.D1_DATABASE_ID = "db-1";
    process.env.CF_API_TOKEN = "tok-1";
  });
  afterEach(() => {
    process.env.CF_ACCOUNT_ID = OLD.CF_ACCOUNT_ID;
    process.env.D1_DATABASE_ID = OLD.D1_DATABASE_ID;
    process.env.CF_API_TOKEN = OLD.CF_API_TOKEN;
  });

  /** In-memory fake D1: matches SQL keywords to rows so CRUD is testable. */
  function makeFakeFetch() {
    const users = new Map<string, Record<string, unknown>>();
    const sessions = new Map<string, Record<string, unknown>>();
    const sched = new Map<string, Record<string, unknown>>();
    const history: Record<string, unknown>[] = [];

    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const { sql, params } = JSON.parse(String(init.body)) as { sql: string; params: unknown[] };
      const [p0, p1, p2, p3, p4, p5, p6] = params as unknown[];
      let rows: Record<string, unknown>[] = [];

      if (sql.includes("CREATE TABLE")) {
        // schema init — no rows
      } else if (sql.includes("INSERT INTO users")) {
        const u = { id: p0, name: p1, email: p2, password_hash: p3, salt: p4, github_id: p5, created_at: p6 };
        users.set(String(p0), u);
        rows = [];
      } else if (sql.includes("SELECT * FROM users") && sql.includes("email")) {
        rows = [...users.values()].filter((u) => u.email === p0);
      } else if (sql.includes("SELECT * FROM users") && sql.includes("github_id")) {
        rows = [...users.values()].filter((u) => u.github_id === p0);
      } else if (sql.includes("SELECT * FROM users") && sql.includes("lower(name)")) {
        rows = [...users.values()].filter((u) => String(u.name).toLowerCase() === p0);
      } else if (sql.includes("SELECT * FROM users") && sql.includes("id")) {
        rows = [...users.values()].filter((u) => u.id === p0);
      } else if (sql.includes("INSERT INTO sessions")) {
        sessions.set(String(p0), { token: p0, user_id: p1, created_at: p2 });
        rows = [];
      } else if (sql.includes("SELECT user_id FROM sessions")) {
        rows = sessions.has(String(p0)) ? [{ user_id: sessions.get(String(p0))!.user_id }] : [];
      } else if (sql.includes("DELETE FROM sessions")) {
        sessions.delete(String(p0));
        rows = [];
      } else if (sql.includes("INSERT INTO scheduled_meetings")) {
        const m = { id: p0, title: p1, date: p2, time: p3, code: p4, created_by: p5, created_at: p6, invitees: null };
        sched.set(String(p0), m);
        rows = [];
      } else if (sql.includes("SELECT * FROM scheduled_meetings")) {
        rows = [...sched.values()];
      } else if (sql.includes("DELETE FROM scheduled_meetings")) {
        const ok = sched.delete(String(p0));
        rows = [];
        return okResponse({ success: true, result: [{ results: rows, success: true, meta: { changes: ok ? 1 : 0 } }] });
      } else if (sql.includes("INSERT INTO meeting_history")) {
        history.push({ id: p0, code: p1, title: p2, host_name: p3, participants: p4, started_at: p5, ended_at: p6 });
        rows = [];
      } else if (sql.includes("SELECT * FROM meeting_history")) {
        rows = history;
      }

      return okResponse({ success: true, result: [{ results: rows, success: true, meta: { changes: rows.length } }] });
    });

    return { fetchMock, users, sessions, sched, history };
  }

  it("creates a user, then finds by email and id", async () => {
    const { fetchMock, users } = makeFakeFetch();
    const db = new Database(new D1Client(fetchMock));

    const created = await db.createUser("Alice", "alice@x.com", "hash", "salt");
    expect(created.id).toBeTruthy();
    expect(users.size).toBe(1);

    const byEmail = await db.findUserByEmail("alice@x.com");
    expect(byEmail?.name).toBe("Alice");
    const byId = await db.findUserById(created.id);
    expect(byId?.email).toBe("alice@x.com");
  });

  it("creates and validates a session", async () => {
    const { fetchMock, sessions } = makeFakeFetch();
    const db = new Database(new D1Client(fetchMock));

    await db.createSession("tok-1", "user-1");
    expect(sessions.size).toBe(1);
    expect(await db.getSessionUserId("tok-1")).toBe("user-1");
    await db.deleteSession("tok-1");
    expect(await db.getSessionUserId("tok-1")).toBeUndefined();
  });

  it("creates, lists, and cancels a scheduled meeting", async () => {
    const { fetchMock, sched } = makeFakeFetch();
    const db = new Database(new D1Client(fetchMock));

    const m = await db.createScheduledMeeting("Sprint", "2026-09-10", "09:00", "host-1", ["a@x.com"]);
    expect(sched.size).toBe(1);
    expect(m.invitees).toEqual(["a@x.com"]);

    const list = await db.getScheduledMeetings();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Sprint");

    expect(await db.cancelScheduledMeeting(m.id)).toBe(true);
    expect(await db.cancelScheduledMeeting(m.id)).toBe(false);
    expect((await db.getScheduledMeetings()).length).toBe(0);
  });

  it("records and lists meeting history", async () => {
    const { fetchMock } = makeFakeFetch();
    const db = new Database(new D1Client(fetchMock));

    await db.recordMeeting({ code: "ABC123", title: "Sync", hostName: "Alice", participants: 3, startedAt: 1 });
    const list = await db.getMeetingHistory();
    expect(list).toHaveLength(1);
    expect(list[0].code).toBe("ABC123");
    expect(list[0].hostName).toBe("Alice");
  });
});
