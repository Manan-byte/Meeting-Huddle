/**
 * @file Dashboard handlers — real meeting history, scheduled meetings.
 *
 * Serves the dashboard with real persisted data instead of demo values:
 *   - DASH_GET_HISTORY: recent completed meetings (from Database)
 *   - DASH_SCHEDULE: create an upcoming meeting (title, date, time)
 *   - DASH_GET_SCHEDULE: list scheduled meetings
 *   - DASH_CANCEL_SCHEDULE: remove a scheduled meeting
 *
 * Connects to: Database (persisted storage), client HomePage dashboard.
 */

import type { Server, Socket } from "socket.io";
import type { Database } from "../services/Database.js";

/** Event names for the dashboard data channel. */
export const DASH_EVENTS = {
  GET_HISTORY: "dash:getHistory",
  HISTORY_RESULT: "dash:historyResult",
  SCHEDULE: "dash:schedule",
  GET_SCHEDULE: "dash:getSchedule",
  SCHEDULE_RESULT: "dash:scheduleResult",
  CANCEL_SCHEDULE: "dash:cancelSchedule",
} as const;

/** Normalize a user-supplied list of invitee emails (trim, drop empties/dups). */
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

/**
 * Register dashboard data handlers.
 * Called once at startup from server/index.ts.
 *
 * @param io - Socket.IO server instance
 * @param database - Persisted user/history/schedule storage
 */
export function setupDashboardHandlers(io: Server, database: Database): void {
  io.on("connection", (socket: Socket) => {
    // ── GET_HISTORY ─────────────────────────────────────────────────
    // Triggered when: dashboard mounts / History view opens
    // Does: returns the latest completed meetings to the requester
    socket.on(DASH_EVENTS.GET_HISTORY, async () => {
      socket.emit(DASH_EVENTS.HISTORY_RESULT, await database.getMeetingHistory(50));
    });

    // ── SCHEDULE ────────────────────────────────────────────────────
    // Triggered when: user schedules a meeting in the Schedule view
    // Does: persists the upcoming meeting (with any invited guest emails),
    //       returns it to the requester. Email invites are composed on the
    //       client via the user's own mail client (mailto:) — no SMTP/env.
    socket.on(
      DASH_EVENTS.SCHEDULE,
      async (
        data: { title: string; date: string; time: string; invitees?: unknown },
        ack?: (res: unknown) => void,
      ) => {
        const title = data?.title?.trim() ?? "";
        const date = data?.date?.trim() ?? "";
        const time = data?.time?.trim() ?? "";
        if (!title || !date || !time) {
          ack?.({ ok: false, error: "Title, date, and time are required." });
          return;
        }
        const invitees = normalizeInvitees(data?.invitees);
        const meeting = await database.createScheduledMeeting(title, date, time, socket.id, invitees);
        ack?.({ ok: true, meeting });
      }
    );

    // ── GET_SCHEDULE ────────────────────────────────────────────────
    // Triggered when: Schedule view opens / dashboard mounts
    // Does: returns the upcoming scheduled meetings to the requester
    socket.on(DASH_EVENTS.GET_SCHEDULE, async () => {
      socket.emit(DASH_EVENTS.SCHEDULE_RESULT, await database.getScheduledMeetings());
    });

    // ── CANCEL_SCHEDULE ─────────────────────────────────────────────
    // Triggered when: user cancels a scheduled meeting
    // Does: removes it and confirms
    socket.on(DASH_EVENTS.CANCEL_SCHEDULE, async (data: { id: string }, ack?: (res: unknown) => void) => {
      const ok = await database.cancelScheduledMeeting(data?.id ?? "");
      ack?.({ ok });
    });
  });
}
