/**
 * @file SchedulePicker — custom date (calendar) + time picker for the Schedule view.
 *
 * Replaces the native `<input type="date">` / `<input type="time">` with a
 * polished, consistent picker: a monthly calendar with navigation and a grid of
 * time slots. Both are controlled components that emit the same string formats
 * the server expects (YYYY-MM-DD and HH:MM), so the socket contract is unchanged.
 *
 * Connects to: HomePage (Schedule view) — value/onChange props.
 */

import { useState } from "react";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Local date → "YYYY-MM-DD" (avoids UTC off-by-one from toISOString). */
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" → Date at local midnight. */
function fromISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Start of today (local midnight) — used to disable past dates. */
function todayStart(): Date {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

/** Compare two local-dates by day equality. */
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

interface CalendarPickerProps {
  /** Selected date as "YYYY-MM-DD", or "" when none chosen. */
  value: string;
  onChange: (date: string) => void;
}

/**
 * Monthly calendar. Navigate months with the chevrons; past days are disabled.
 */
export function CalendarPicker({ value, onChange }: CalendarPickerProps) {
  const selected = value ? fromISO(value) : null;
  // Displayed month — starts at the selected date's month, else current month.
  const [view, setView] = useState<Date>(() => selected ?? todayStart());

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStart();
  const canGoPrev = view > new Date(today.getFullYear(), today.getMonth(), 1);

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const shiftMonth = (delta: number) => setView(new Date(year, month + delta, 1));

  return (
    <div style={styles.cal}>
      <div style={styles.calHeader}>
        <button
          style={{ ...styles.navBtn, opacity: canGoPrev ? 1 : 0.3, cursor: canGoPrev ? "pointer" : "default" }}
          onClick={() => canGoPrev && shiftMonth(-1)}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span style={styles.calTitle}>
          {MONTHS[month]} {year}
        </span>
        <button style={styles.navBtn} onClick={() => shiftMonth(1)} aria-label="Next month">
          ›
        </button>
      </div>

      <div style={styles.weekRow}>
        {WEEKDAYS.map((d) => (
          <span key={d} style={styles.weekday}>{d}</span>
        ))}
      </div>

      <div style={styles.dayGrid}>
        {cells.map((day, i) => {
          if (day === null) return <span key={`b${i}`} style={styles.dayCell} />;
          const date = new Date(year, month, day);
          const isPast = date < today;
          const isSelected = selected ? sameDay(date, selected) : false;
          const isToday = sameDay(date, today);
          return (
            <button
              key={day}
              disabled={isPast}
              onClick={() => onChange(toISO(date))}
              style={{
                ...styles.dayBtn,
                ...(isSelected ? styles.daySelected : {}),
                ...(isToday && !isSelected ? styles.dayToday : {}),
              }}
              title={isPast ? "Past date" : undefined}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Hour labels 1–12 (12-hour clock). */
const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** Minute steps offered by the picker. */
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
const AM_PM = ["AM", "PM"] as const;

/** "HH:MM" (24h) → { hour12, minute, ampm } for the digital picker. */
function parse24h(value: string): { hour12: number; minute: string; ampm: "AM" | "PM" } {
  if (!value) return { hour12: 12, minute: "00", ampm: "AM" };
  const [h = 0, m = 0] = value.split(":").map(Number);
  const hh = h % 12 || 12;
  const ampm: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  return { hour12: hh, minute: String(m).padStart(2, "0"), ampm };
}

/** { hour12, minute, ampm } → "HH:MM" (24h), matching the server contract. */
function to24h(hour12: number, minute: string, ampm: "AM" | "PM"): string {
  let h = hour12 % 12; // 12 → 0, else 1..11
  if (ampm === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${minute}`;
}

interface TimePickerProps {
  value: string;
  onChange: (time: string) => void;
}

/**
 * Build a `mailto:` compose URL for a scheduled meeting's guests.
 * Opens the user's own mail client (Gmail, Yahoo, Outlook, …) — no SMTP
 * credentials or server config needed, and it works with any provider.
 *
 * @param invitees - Recipient email addresses.
 * @param meeting - Title/date/time/code of the scheduled meeting.
 * @param clientUrl - Base web URL used to build the join link.
 */
export function buildInviteMailto(
  invitees: string[],
  meeting: { title: string; date: string; time: string; code: string },
  clientUrl: string,
): string {
  const to = invitees.join(",");
  const subject = `Meeting invite: ${meeting.title || "Untitled Meeting"}`;
  const joinUrl = `${clientUrl.replace(/\/$/, "")}/?join=${meeting.code}`;
  const body = [
    `You're invited to a Huddle meeting.`,
    ``,
    `Title: ${meeting.title || "Untitled Meeting"}`,
    `When: ${meeting.date} at ${meeting.time}`,
    `Room code: ${meeting.code}`,
    ``,
    `Join link: ${joinUrl}`,
    ``,
    `See you there!`,
  ].join("\n");
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Digital clock-style time picker: hour (1–12) + minute (5-min steps) + AM/PM.
 * Emits 24-hour "HH:MM" to keep the server contract unchanged.
 */
export function TimePicker({ value, onChange }: TimePickerProps) {
  const { hour12, minute, ampm } = parse24h(value);

  return (
    <div style={styles.timeWrap}>
      <div style={styles.timeCols}>
        {/* Hour */}
        <div style={styles.timeCol}>
          <span style={styles.timeColLabel}>Hour</span>
          <div style={styles.timeList}>
            {HOURS.map((h) => {
              const selected = h === hour12;
              return (
                <button
                  key={h}
                  onClick={() => onChange(to24h(h, minute, ampm))}
                  style={{ ...styles.timeOpt, ...(selected ? styles.timeOptSelected : {}) }}
                >
                  {h}
                </button>
              );
            })}
          </div>
        </div>

        {/* Minute */}
        <div style={styles.timeCol}>
          <span style={styles.timeColLabel}>Min</span>
          <div style={styles.timeList}>
            {MINUTES.map((m) => {
              const selected = m === minute;
              return (
                <button
                  key={m}
                  onClick={() => onChange(to24h(hour12, m, ampm))}
                  style={{ ...styles.timeOpt, ...(selected ? styles.timeOptSelected : {}) }}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>

        {/* AM/PM */}
        <div style={styles.timeCol}>
          <span style={styles.timeColLabel}>Period</span>
          <div style={styles.ampmCol}>
            {AM_PM.map((p) => {
              const selected = p === ampm;
              return (
                <button
                  key={p}
                  onClick={() => onChange(to24h(hour12, minute, p))}
                  style={{ ...styles.ampmBtn, ...(selected ? styles.timeOptSelected : {}) }}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  cal: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
  },
  calHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  navBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text)",
    fontSize: 18,
    lineHeight: 1,
    cursor: "pointer",
  },
  calTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text)",
  },
  weekRow: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    marginBottom: 4,
  },
  weekday: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-dim)",
    textTransform: "uppercase",
    padding: "4px 0",
  },
  dayGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 2,
  },
  dayCell: { height: 32 },
  dayBtn: {
    height: 32,
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: "var(--text)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  daySelected: {
    background: "var(--accent)",
    color: "var(--accent-ink)",
    fontWeight: 700,
  },
  dayToday: {
    boxShadow: "inset 0 0 0 1.5px var(--accent)",
  },
  timeWrap: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
  },
  timeCols: {
    display: "grid",
    gridTemplateColumns: "1.2fr 1.4fr 1fr",
    gap: 10,
    alignItems: "flex-start",
  },
  timeCol: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  },
  timeColLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-dim)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  timeList: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 5,
    maxHeight: 184,
    overflowY: "auto",
  },
  timeOpt: {
    padding: "9px 0",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
  },
  ampmCol: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
  },
  ampmBtn: {
    padding: "9px 0",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text)",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  timeOptSelected: {
    background: "var(--accent)",
    borderColor: "var(--accent)",
    color: "var(--accent-ink)",
    fontWeight: 700,
  },
};
