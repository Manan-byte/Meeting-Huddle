/**
 * @file Home page — landing + dashboard (Zoom/Google Meet-style).
 *
 * Layout (clean top nav + hero):
 *   - Top nav: Huddle brand, page links (Dashboard/Schedule/History), Sign in.
 *   - Hero (dashboard view): tagline + name input + "New meeting" + join-by-code;
 *     right = mock video-call illustration.
 *   - Feature strip: HD video & screen share, clear audio, chat/polls/reactions.
 *   - Admin views (Schedule/History) full pages below the nav.
 *
 * Copy describes the current Cloudflare (Worker + Durable Object) backend and
 * LiveKit SFU media engine. Real-time create/join + auth + dashboard all flow
 * through the WebSocket in SocketContext.
 */

import { useState, useEffect } from "react";
import {
  Plus,
  ArrowRight,
  XCircle,
  Video,
  LayoutDashboard,
  Clock,
  History,
  Monitor,
  Mic,
  MessagesSquare,
  Mail,
  Lock,
  X,
  CalendarDays,
  User as UserIcon,
} from "lucide-react";
import { SOCKET_EVENTS } from "@meet-app/shared";
import type { Room, User } from "@meet-app/shared";
import { useSocket } from "../contexts/SocketContext";
import { useRoom } from "../contexts/RoomContext";
import { useAuth } from "../contexts/AuthContext";
import { PreJoinScreen } from "../components/PreJoinScreen";
import { ParticleField } from "../components/ParticleField";
import { CalendarPicker, TimePicker, buildInviteMailto } from "../components/SchedulePicker";
import "../styles/HomePage.css";

interface HomePageProps {
  onJoinRoom: () => void;
}

/** A completed meeting from the server's persisted history. */
interface HistoryMeeting {
  id: string;
  code: string;
  title: string;
  hostName: string;
  participants: number;
  startedAt: number;
  endedAt: number;
}

/** An upcoming scheduled meeting. */
interface ScheduledMeeting {
  id: string;
  title: string;
  date: string;
  time: string;
  code: string;
  createdBy: string;
  createdAt: number;
  /** Guest email addresses invited to this meeting. */
  invitees?: string[];
}

/** Socket event names for the dashboard data channel (mirror the server). */
const DASH_EVENTS = {
  GET_HISTORY: "dash:getHistory",
  HISTORY_RESULT: "dash:historyResult",
  SCHEDULE: "dash:schedule",
  GET_SCHEDULE: "dash:getSchedule",
  SCHEDULE_RESULT: "dash:scheduleResult",
  CANCEL_SCHEDULE: "dash:cancelSchedule",
} as const;

/**
 * Accounts allowed to see meeting History / Recent meetings.
 * Only a signed-in user whose email matches one of these can view history.
 */
const ADMIN_EMAILS = ["admin@meet.app"];

/** Format a history record's start time for tables. */
function formatHistoryTime(ts: number): string {
  return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "YYYY-MM-DD" → friendly label (e.g. "Sat, Sep 20, 2026"). */
function formatSchedDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/** "HH:MM" (24h) → "h:mm AM/PM". */
function formatSchedTime(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function HomePage({ onJoinRoom }: HomePageProps) {
  const { socket } = useSocket();
  const { setRoom, setCurrentUser, setParticipants } = useRoom();
  const { user, loading: authLoading, login, register, logout } = useAuth();

  const [history, setHistory] = useState<HistoryMeeting[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledMeeting[]>([]);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"email" | "register" | "forgot">("email");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");
  /** Reset code issued by auth:forgot (shown on-screen — no email service). */
  const [authResetCode, setAuthResetCode] = useState("");
  /** User-typed reset code for auth:reset. */
  const [authResetCodeInput, setAuthResetCodeInput] = useState("");
  /** True once auth:forgot succeeded — show the code + new-password step. */
  const [authResetIssued, setAuthResetIssued] = useState(false);
  const [schedTitle, setSchedTitle] = useState("");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  /** Comma/space-separated guest emails for Gmail invites (Schedule view). */
  const [schedInvitees, setSchedInvitees] = useState("");
  /** Persistent inline note about the last invite submission (e.g. SMTP not configured). */
  const [emailMsg, setEmailMsg] = useState<{ type: "info" | "warn"; text: string } | null>(null);

  const [userName, setUserName] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState<"create" | "join" | null>(null);
  const [activeView, setActiveView] = useState<"dashboard" | "schedule" | "history">("dashboard");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (msg: string) => setToast(msg);
  const goTo = (v: "dashboard" | "schedule" | "history") => setActiveView(v);

  // Load real dashboard data from the server.
  useEffect(() => {
    if (!socket) return;
    const onHistory = (rows: HistoryMeeting[]) => setHistory(rows);
    const onSchedule = (rows: ScheduledMeeting[]) => setScheduled(rows);
    socket.on(DASH_EVENTS.HISTORY_RESULT, onHistory);
    socket.on(DASH_EVENTS.SCHEDULE_RESULT, onSchedule);
    socket.emit(DASH_EVENTS.GET_HISTORY);
    socket.emit(DASH_EVENTS.GET_SCHEDULE);
    return () => {
      socket.off(DASH_EVENTS.HISTORY_RESULT, onHistory);
      socket.off(DASH_EVENTS.SCHEDULE_RESULT, onSchedule);
    };
  }, [socket]);

  useEffect(() => {
    if (user?.name && !userName) setUserName(user.name);
  }, [user, userName]);

  // Invite-link prefill.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("join");
    if (code) setJoinCode(code.toUpperCase());
  }, []);

  // GitHub OAuth callback: the server redirects to /?auth_token=<token>.
  // Store the token; AuthContext restores the session via auth:me on connect.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("auth_token");
    const error = params.get("auth_error");
    if (token) {
      try { localStorage.setItem("huddle_token", token); } catch { /* ignore */ }
      // Strip the query param so a refresh doesn't re-apply the token.
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      showToast(`GitHub login: ${error}`);
    }
  }, []);

  const handleCreate = () => {
    if (!userName.trim() || !socket) return;
    setError("");
    setPreviewing("create");
  };

  const confirmCreate = () => {
    if (!socket) return;
    setIsCreating(true);
    socket.emit(SOCKET_EVENTS.CREATE_ROOM, {
      hostName: userName.trim(),
      meetingTitle: meetingTitle.trim() || undefined,
    });
    socket.once(SOCKET_EVENTS.ROOM_CREATED, (data: { room: Room; user: User }) => {
      setRoom(data.room);
      setCurrentUser(data.user);
      setParticipants(data.room.participants);
      setIsCreating(false);
      setPreviewing(null);
      onJoinRoom();
    });
    socket.once(SOCKET_EVENTS.ROOM_FULL, () => {
      setError("Room is full. Please try again later.");
      setIsCreating(false);
      setPreviewing(null);
    });
  };

  const handleJoin = () => {
    if (!userName.trim() || !joinCode.trim() || !socket) return;
    setError("");
    setPreviewing("join");
  };

  const confirmJoin = () => {
    if (!socket) return;
    setIsCreating(true);
    socket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      code: joinCode.trim().toUpperCase(),
      userName: userName.trim(),
    });
    socket.once(SOCKET_EVENTS.ROOM_JOINED, (data: { room: Room; user: User }) => {
      setRoom(data.room);
      setCurrentUser(data.user);
      setParticipants(data.room.participants);
      setIsCreating(false);
      setPreviewing(null);
      onJoinRoom();
    });
    socket.once(SOCKET_EVENTS.ROOM_FULL, () => {
      setError("Room is full.");
      setIsCreating(false);
      setPreviewing(null);
    });
    socket.once(SOCKET_EVENTS.ROOM_LOCKED, () => {
      setError("Room is locked.");
      setIsCreating(false);
      setPreviewing(null);
    });
  };

  const displayName = user?.name || userName.trim() || "Guest";

  /** True when the signed-in user's email is in the admin allow-list. */
  const isAdmin = !!user && ADMIN_EMAILS.includes(user.email.toLowerCase());

  // Nav. History (meeting records) is admin-only; Schedule requires sign-in
  // (email invites are composed in the user's own mail client).
  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard, view: "dashboard" as const },
    ...(user ? [{ label: "Schedule", icon: Clock, view: "schedule" as const }] : []),
    ...(isAdmin ? [{ label: "History", icon: History, view: "history" as const }] : []),
  ];

  const viewTitle =
    activeView === "dashboard" ? "Meetings that bring people together"
    : activeView === "schedule" ? "Schedule"
    : "History";

  const features = [
    { icon: Monitor, title: "HD video & screen share", desc: "SFU-powered crystal-clear video with one-click screen sharing — scales to many participants." },
    { icon: Mic, title: "Clear audio", desc: "Noise suppression, live speaking indicators, and push-to-talk." },
    { icon: MessagesSquare, title: "Chat, polls & reactions", desc: "Real-time chat, polls, hand raise, emoji reactions, and live captions." },
  ];

  return (
    <div style={styles.page}>
      {/* ── Top nav ─────────────────────────────────────────────── */}
      <header style={styles.nav}>
        <button style={styles.brand} onClick={() => goTo("dashboard")}>
          <span style={styles.brandIcon}><Video size={17} color="var(--accent-ink)" /></span>
          <span style={styles.brandText}>Huddle</span>
        </button>

        <nav style={styles.navLinks}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.view;
            return (
              <button
                key={item.label}
                onClick={() => goTo(item.view)}
                className="hp-nav-link"
                style={{ ...styles.navLink, ...(active ? styles.navLinkActive : {}) }}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div style={styles.navRight}>
          {!authLoading && (user ? (
            <div style={styles.navUser}>
              <span style={styles.navAvatar}>{(displayName[0] || "H").toUpperCase()}</span>
              <span style={styles.navName}>{displayName}</span>
              <button className="hp-ghost" style={styles.signOutBtn} onClick={logout}>Sign out</button>
            </div>
          ) : (
            <button className="hp-signin" style={styles.signInBtn} onClick={() => setShowAuth(true)}>Sign in</button>
          ))}
        </div>
      </header>

      <main style={styles.main}>
        {/* ── Dashboard / Landing hero ───────────────────────────── */}
        {activeView === "dashboard" && (
          <>
            <section className="hp-hero" style={styles.hero}>
              <ParticleField className="hp-particles" />
              <div style={styles.heroLeft}>
                <span style={styles.heroEyebrow}><span style={styles.heroEyebrowDot} />WebRTC · LiveKit · Cloudflare Edge</span>
                <h1 style={styles.heroTitle}>{viewTitle}</h1>
                <p style={styles.heroSubtitle}>
                  Free, browser-based video meetings — powered by Cloudflare edge infrastructure.
                  Share screens, chat, poll, and record in real time with no install.
                </p>

                <div className="hp-hero-card glass" style={styles.heroPanel}>
                  <div style={styles.heroForm}>
                    <input
                      style={styles.heroInput}
                      type="text"
                      placeholder="Enter your name"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                    />
                    <button
                      className="dash-primary"
                      style={styles.heroBtn}
                      onClick={handleCreate}
                      disabled={!userName.trim() || isCreating}
                    >
                      <Video size={16} /> {isCreating ? "Creating..." : "New meeting"}
                    </button>
                  </div>

                  <div style={styles.joinRow}>
                    <div style={styles.divider} />
                    <span style={styles.or}>or join with a code</span>
                    <div style={styles.divider} />
                  </div>

                  <div style={styles.heroForm}>
                    <input
                      style={{ ...styles.heroInput, ...styles.codeInput }}
                      type="text"
                      placeholder="Enter code"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      maxLength={6}
                    />
                    <button className="hp-ghost" style={styles.joinBtn} onClick={handleJoin} disabled={!userName.trim() || !joinCode.trim() || isCreating}>
                      <ArrowRight size={16} /> Join
                    </button>
                  </div>

                  {error && (
                    <div style={styles.error}>
                      <XCircle size={14} /> <span>{error}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Mock video-call illustration */}
              <div className="hp-static" style={styles.heroRight}>
                <div style={styles.mockFrame}>
                  <div style={styles.mockTopbar}>
                    <span style={styles.mockRec}><span style={styles.mockRecDot} />REC</span>
                    <span style={styles.mockTime}>00:24</span>
                    <span style={styles.mockIcons}>&bull;&bull;&bull;</span>
                  </div>
                  <div style={styles.mockGrid}>
                    {[
                      { name: "Alice", from: "#7c6cff", to: "#5658f0" },
                      { name: "Bob", from: "#52a8ff", to: "#2f6bff" },
                      { name: "You", from: "#8b6cff", to: "#5a4be8" },
                      { name: "Carol", from: "#a78bfa", to: "#7c3aed" },
                    ].map((p) => (
                      <div key={p.name} style={styles.mockTile}>
                        <div
                          style={{
                            ...styles.mockAvatar,
                            background: `linear-gradient(135deg, ${p.from} 0%, ${p.to} 100%)`,
                          }}
                        >
                          {p.name[0]}
                        </div>
                        <span style={styles.mockName}>{p.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Feature strip */}
            <section style={styles.featureBand}>
              <div style={styles.featureHeader}>
                <span style={styles.featureEyebrow}>Why Huddle</span>
                <h2 style={styles.featureHeading}>Built for real meetings</h2>
                <p style={styles.featureIntro}>Everything your team needs to meet, present, and decide — in one tab.</p>
              </div>
              <div className="hp-feature-grid" style={styles.features}>
                {features.map((f) => {
                  const Icon = f.icon;
                  return (
                    <div className="hp-feature" key={f.title} style={styles.featureCard}>
                      <span style={styles.featureIcon}><Icon size={20} /></span>
                      <h3 style={styles.featureTitle}>{f.title}</h3>
                      <p style={styles.featureDesc}>{f.desc}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* How it works — 3 steps */}
            <section className="dash-card" style={styles.howSection}>
              <div style={styles.howHeader}>
                <span style={styles.featureEyebrow}>How it works</span>
                <h2 style={styles.howTitle}>Start a meeting in seconds</h2>
              </div>
              <div style={styles.howSteps}>
                <div style={styles.howStep}>
                  <span style={styles.howStepNum}>1</span>
                  <h3 style={styles.howStepTitle}>Enter your name</h3>
                  <p style={styles.howStepDesc}>No account needed to join — just type your name and go.</p>
                </div>
                <div style={styles.howStep}>
                  <span style={styles.howStepNum}>2</span>
                  <h3 style={styles.howStepTitle}>Create or join</h3>
                  <p style={styles.howStepDesc}>Start a new meeting or enter a 6-character code from an invite.</p>
                </div>
                <div style={styles.howStep}>
                  <span style={styles.howStepNum}>3</span>
                  <h3 style={styles.howStepTitle}>Share the code</h3>
                  <p style={styles.howStepDesc}>Send the code to others — video, audio, and chat run instantly in the browser.</p>
                </div>
              </div>
            </section>

            {/* Recent meetings — admin only */}
            {isAdmin && (
              <section className="dash-card" style={styles.tableCard}>
                <div style={styles.cardHeader}>
                  <h2 style={styles.cardTitle}>Recent meetings</h2>
                  <button style={styles.cardMore} onClick={() => goTo("history")}>View all</button>
                </div>
                {history.length === 0 ? (
                  <div style={styles.emptyState}>
                    <span style={styles.emptyIcon}><Clock size={20} /></span>
                    <p style={styles.emptyText}>No past meetings yet — start or join one to see it here.</p>
                  </div>
                ) : (
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Title</th>
                        <th style={styles.th}>Code</th>
                        <th style={styles.th}>Participants</th>
                        <th style={styles.th}>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice(0, 5).map((m) => (
                        <tr key={m.id} className="hp-row" style={styles.tr}>
                          <td style={styles.td}>{m.title}</td>
                          <td style={styles.td}><span style={styles.codePill}>{m.code}</span></td>
                          <td style={styles.td}>{m.participants}</td>
                          <td style={styles.td}>{formatHistoryTime(m.startedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )}
          </>
        )}

        {/* ── Schedule — requires sign-in ───────────────────────── */}
        {activeView === "schedule" && (
          <div style={styles.view}>
            {!user ? (
              <div className="dash-card" style={styles.viewCard}>
                <h2 style={styles.viewTitle}>Schedule a meeting</h2>
                <p style={styles.viewDesc}>
                  Sign in to schedule meetings and invite guests by email. Invites are
                  composed in your own mail client (Gmail, Yahoo, Outlook, …) — no account
                  setup needed.
                </p>
                <div style={styles.authPrompt}>
                  <button
                    className="dash-primary" style={styles.authPromptBtn}
                    onClick={() => setShowAuth(true)}
                  >
                    Sign in
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="dash-card" style={styles.viewCard}>
              <h2 style={styles.viewTitle}>Schedule a meeting</h2>
              <p style={styles.viewDesc}>Plan an upcoming meeting — a room code is generated for it.</p>
              <div style={styles.heroForm}>
                <input style={styles.plainInput} type="text" placeholder="Meeting title" value={schedTitle} onChange={(e) => setSchedTitle(e.target.value)} />
              </div>

              {/* Date + time pickers side by side */}
              <div style={styles.schedPickRow}>
                <div style={styles.schedPickCol}>
                  <span style={styles.schedPickLabel}>Date</span>
                  <CalendarPicker value={schedDate} onChange={setSchedDate} />
                </div>
                <div style={styles.schedPickCol}>
                  <span style={styles.schedPickLabel}>Time</span>
                  <TimePicker value={schedTime} onChange={setSchedTime} />
                </div>
              </div>

              {/* Live summary of the chosen slot */}
              <div style={styles.schedSummary}>
                <CalendarDays size={15} style={styles.schedSummaryIcon} />
                <span style={styles.schedSummaryText}>
                  {schedDate ? formatSchedDate(schedDate) : "Pilih tanggal"} · {schedTime ? formatSchedTime(schedTime) : "pilih jam"}
                </span>
              </div>

              <div style={styles.heroForm}>
                <input
                  style={styles.plainInput}
                  type="text"
                  placeholder="Invite guests (guest@email.com, guest2@email.com)"
                  value={schedInvitees}
                  onChange={(e) => setSchedInvitees(e.target.value)}
                />
              </div>

              {/* Persistent inline email-status note */}
              {emailMsg && (
                <div
                  style={{
                    ...styles.emailNote,
                    background: emailMsg.type === "warn" ? "rgba(245,158,11,0.12)" : "rgba(79, 70, 229,0.15)",
                    color: emailMsg.type === "warn" ? "var(--text)" : "var(--accent-dark)",
                  }}
                >
                  {emailMsg.text}
                </div>
              )}

              <button
                className="dash-primary" style={styles.heroBtn}
                disabled={!schedTitle.trim() || !schedDate || !schedTime}
                onClick={() => {
                  if (!socket || !user) return;
                  const invitees = schedInvitees
                    .split(/[\s,]+/)
                    .map((e) => e.trim())
                    .filter(Boolean);
                  socket.emit(DASH_EVENTS.SCHEDULE, { title: schedTitle, date: schedDate, time: schedTime, invitees }, (res: { ok: boolean; meeting?: ScheduledMeeting; error?: string }) => {
                    if (res.ok && res.meeting) {
                      setScheduled((prev) => [...prev, res.meeting!]);
                      setSchedTitle(""); setSchedDate(""); setSchedTime(""); setSchedInvitees("");
                      if (invitees.length) {
                        // Open the user's own mail client (Gmail/Yahoo/Outlook — any
                        // provider) with a pre-filled invite. No SMTP config needed.
                        const mailto = buildInviteMailto(
                          invitees,
                          { title: res.meeting.title, date: res.meeting.date, time: res.meeting.time, code: res.meeting.code },
                          window.location.origin,
                        );
                        window.location.href = mailto;
                        setEmailMsg({
                          type: "info",
                          text: `✅ Rapat dijadwalkan — aplikasi email Anda terbuka untuk mengirim undangan ke ${invitees.length} tamu (${invitees.join(", ")}).`,
                        });
                      } else {
                        setEmailMsg(null);
                      }
                      showToast(`Scheduled "${res.meeting.title}" — code ${res.meeting.code}`);
                    } else showToast(res.error ?? "Could not schedule.");
                  });
                }}
              >
                <Plus size={16} /> Schedule meeting
              </button>
            </div>
            <div className="dash-card" style={styles.viewCard}>
              <h2 style={styles.viewTitle}>Upcoming meetings</h2>
              {scheduled.length === 0 ? (
                <div style={styles.emptyState}><span style={styles.emptyIcon}><CalendarDays size={20} /></span><p style={styles.emptyText}>No upcoming meetings scheduled yet.</p></div>
              ) : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Title</th><th style={styles.th}>Code</th><th style={styles.th}>Date</th><th style={styles.th}>Time</th><th style={styles.th}>Invited</th><th style={styles.th}></th></tr></thead>
                  <tbody>
                    {scheduled.map((m) => (
                      <tr key={m.id} className="hp-row" style={styles.tr}>
                        <td style={styles.td}>{m.title}</td>
                        <td style={styles.td}><span style={styles.codePill}>{m.code}</span></td>
                        <td style={styles.td}>{m.date}</td>
                        <td style={styles.td}>{m.time}</td>
                        <td style={styles.td}>
                          {m.invitees?.length ? (
                            <span style={styles.invitedChips}>
                              {m.invitees.map((e) => (
                                <span key={e} style={styles.invitedChip}>{e}</span>
                              ))}
                            </span>
                          ) : (
                            <span style={styles.tdMuted}>—</span>
                          )}
                        </td>
                        <td style={styles.td}>
                          <button style={styles.cancelBtn} onClick={() => socket?.emit(DASH_EVENTS.CANCEL_SCHEDULE, { id: m.id }, () => { setScheduled((prev) => prev.filter((x) => x.id !== m.id)); showToast("Scheduled meeting cancelled."); })}>Cancel</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
              </>
            )}
          </div>
        )}

        {/* ── History — admin only ───────────────────────────────── */}
        {isAdmin && activeView === "history" && (
          <div style={styles.view}>
            <div className="dash-card" style={styles.viewCard}>
              <h2 style={styles.viewTitle}>History</h2>
              <p style={styles.viewDesc}>Meeting records — admin only.</p>
              {history.length === 0 ? (
                <div style={styles.emptyState}><span style={styles.emptyIcon}><Clock size={20} /></span><p style={styles.emptyText}>No past meetings yet.</p></div>
              ) : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Title</th><th style={styles.th}>Code</th><th style={styles.th}>Participants</th><th style={styles.th}>Time</th></tr></thead>
                  <tbody>
                    {history.map((m) => (
                      <tr key={m.id} className="hp-row" style={styles.tr}>
                        <td style={styles.td}>{m.title}</td>
                        <td style={styles.td}><span style={styles.codePill}>{m.code}</span></td>
                        <td style={styles.td}>{m.participants}</td>
                        <td style={styles.td}>{formatHistoryTime(m.startedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        <footer className="hp-footer">
          <span className="hp-footer-mark">Huddle</span>
          <span className="hp-footer-line">
            Powered by <span>LiveKit SFU</span> &middot; <span>Cloudflare Workers</span> &middot; <span>React</span> — free video meetings for up to 10 participants per room, right in your browser.
          </span>
        </footer>
      </main>

      {/* Toast */}
      {toast && <div style={styles.toast}>{toast}</div>}

      {/* Auth modal — sign in / sign up with email (no OAuth) */}
      {showAuth && (
        <div style={styles.authOverlay} onClick={() => setShowAuth(false)}>
          <div style={styles.authModal} onClick={(e) => e.stopPropagation()}>
            <button style={styles.authClose} onClick={() => setShowAuth(false)} aria-label="Close">
              <X size={18} />
            </button>

            <div style={styles.authBrand}>
              <span style={styles.authBrandIcon}><Video size={16} color="var(--accent-ink)" /></span>
              <span style={styles.authBrandText}>Huddle</span>
            </div>

            <h2 style={styles.authTitle}>Sign in</h2>
            <p style={styles.authSub}>Sign in to schedule meetings and invite guests.</p>

            {authMode === "register" ? (
              <>
                {/* Email + name + password register */}
                <button
                  style={styles.authBack}
                  onClick={() => { setAuthMode("email"); setAuthError(""); }}
                >
                  ← Back
                </button>
                <div style={styles.authField}>
                  <UserIcon size={16} style={styles.authFieldIcon} />
                  <input
                    style={styles.authInput}
                    type="text"
                    placeholder="Name"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                  />
                </div>
                <div style={styles.authField}>
                  <Mail size={16} style={styles.authFieldIcon} />
                  <input
                    style={styles.authInput}
                    type="email"
                    placeholder="Email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                  />
                </div>
                <div style={styles.authField}>
                  <Lock size={16} style={styles.authFieldIcon} />
                  <input
                    style={styles.authInput}
                    type="password"
                    placeholder="Password (min 6 chars)"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                  />
                </div>

                {authError && <div style={styles.authError}>{authError}</div>}

                <button
                  className="dash-primary" style={styles.authSubmit}
                  onClick={async () => {
                    const err = await register(authName, authEmail, authPassword);
                    if (err) setAuthError(err);
                    else {
                      setShowAuth(false); setAuthMode("email"); setAuthError(""); setAuthName(""); setAuthEmail(""); setAuthPassword("");
                      showToast("Account created — signed in.");
                    }
                  }}
                >
                  <Plus size={16} /> Create account
                </button>
              </>
            ) : authMode === "forgot" ? (
              <>
                {/* Forgot password — email → reset code → new password */}
                <button
                  style={styles.authBack}
                  onClick={() => { setAuthMode("email"); setAuthError(""); setAuthResetIssued(false); setAuthResetCode(""); }}
                >
                  ← Back
                </button>

                {!authResetIssued ? (
                  <>
                    <p style={styles.authSub}>
                      Enter your account email. We'll issue a one-time reset code.
                    </p>
                    <div style={styles.authField}>
                      <Mail size={16} style={styles.authFieldIcon} />
                      <input
                        style={styles.authInput}
                        type="email"
                        placeholder="Email"
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                      />
                    </div>
                    {authError && <div style={styles.authError}>{authError}</div>}
                    <button
                      className="dash-primary" style={styles.authSubmit}
                      onClick={async () => {
                        if (!socket) return;
                        socket.emit("auth:forgot", { email: authEmail }, (res: { ok: boolean; resetCode?: string; error?: string }) => {
                          if (res.ok && res.resetCode) {
                            setAuthResetCode(res.resetCode);
                            setAuthResetIssued(true);
                            setAuthError("");
                          } else {
                            setAuthError(res.error ?? "Could not issue a reset code.");
                          }
                        });
                      }}
                    >
                      Send reset code
                    </button>
                  </>
                ) : (
                  <>
                    <div style={styles.authNote}>
                      Reset code (30 min): <strong>{authResetCode}</strong>
                    </div>
                    <div style={styles.authField}>
                      <Lock size={16} style={styles.authFieldIcon} />
                      <input
                        style={styles.authInput}
                        type="text"
                        placeholder="Reset code"
                        value={authResetCodeInput}
                        onChange={(e) => setAuthResetCodeInput(e.target.value.toUpperCase())}
                        maxLength={6}
                      />
                    </div>
                    <div style={styles.authField}>
                      <Lock size={16} style={styles.authFieldIcon} />
                      <input
                        style={styles.authInput}
                        type="password"
                        placeholder="New password (min 6 chars)"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                      />
                    </div>
                    {authError && <div style={styles.authError}>{authError}</div>}
                    <button
                      className="dash-primary" style={styles.authSubmit}
                      onClick={async () => {
                        if (!socket) return;
                        socket.emit("auth:reset", { email: authEmail, code: authResetCodeInput, newPassword: authPassword }, (res: { ok: boolean; error?: string }) => {
                          if (res.ok) {
                            setShowAuth(false); setAuthMode("email"); setAuthError(""); setAuthPassword(""); setAuthResetIssued(false); setAuthResetCode(""); setAuthResetCodeInput("");
                            showToast("Password updated — sign in with your new password.");
                          } else {
                            setAuthError(res.error ?? "Reset failed. Try again.");
                          }
                        });
                      }}
                    >
                      Reset password
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                {/* Email + password login */}
                <button
                  style={styles.authBack}
                  onClick={() => { setAuthMode("email"); setAuthError(""); }}
                >
                  ← Back
                </button>
                <div style={styles.authField}>
                  <Mail size={16} style={styles.authFieldIcon} />
                  <input
                    style={styles.authInput}
                    type="email"
                    placeholder="Email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                  />
                </div>
                <div style={styles.authField}>
                  <Lock size={16} style={styles.authFieldIcon} />
                  <input
                    style={styles.authInput}
                    type="password"
                    placeholder="Password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                  />
                </div>

                <div style={styles.authForgotRow}>
                  <button style={styles.authForgot} onClick={() => { setAuthMode("forgot"); setAuthError(""); setAuthResetIssued(false); setAuthResetCode(""); }}>
                    Forgot password?
                  </button>
                </div>

                {authError && <div style={styles.authError}>{authError}</div>}

                <button
                  className="dash-primary" style={styles.authSubmit}
                  onClick={async () => {
                    const err = await login(authEmail, authPassword);
                    if (err) setAuthError(err);
                    else {
                      setShowAuth(false); setAuthMode("email"); setAuthError(""); setAuthEmail(""); setAuthPassword("");
                      showToast("Signed in.");
                    }
                  }}
                >
                  Sign in
                </button>

                <p style={styles.authAlt}>
                  New to Huddle?{" "}
                  <button style={styles.authAltLink} onClick={() => { setAuthMode("register"); setAuthError(""); }}>
                    Sign up with email
                  </button>
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Pre-join camera preview */}
      {previewing && (
        <PreJoinScreen
          userName={userName}
          title={previewing === "create" ? meetingTitle || "New Meeting" : `Join: ${joinCode}`}
          isCreating={previewing === "create"}
          meetingTitle={meetingTitle}
          onMeetingTitleChange={setMeetingTitle}
          onJoin={previewing === "create" ? confirmCreate : confirmJoin}
          onCancel={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles — Zoom/Meet-style light landing                            */
/* ------------------------------------------------------------------ */

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    fontFamily: "var(--font-body)",
    display: "flex",
    flexDirection: "column",
  },
  nav: {
    display: "flex",
    alignItems: "center",
    gap: 24,
    padding: "14px 32px",
    borderBottom: "1px solid var(--border)",
    background: "color-mix(in srgb, var(--bg-raised) 78%, transparent)",
    WebkitBackdropFilter: "blur(18px) saturate(160%)",
    backdropFilter: "blur(18px) saturate(160%)",
    position: "sticky",
    top: 0,
    zIndex: 50,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 0,
  },
  brandIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 10,
    background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)",
    boxShadow: "0 4px 12px color-mix(in srgb, var(--accent) 40%, transparent)",
  },
  brandText: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text)",
    letterSpacing: "-0.02em",
    fontFamily: "var(--font-display)",
  },
  navLinks: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  navLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "8px 14px",
    borderRadius: 999,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  navLinkActive: {
    background: "color-mix(in srgb, var(--accent) 12%, transparent)",
    color: "var(--accent)",
    fontWeight: 600,
  },
  navRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  signInBtn: {
    padding: "8px 18px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text)",
    cursor: "pointer",
  },
  navUser: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  navAvatar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)",
    color: "var(--accent-ink)",
    fontWeight: 700,
    fontSize: 13,
  },
  navName: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text)",
  },
  signOutBtn: {
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
  },
main: {
    flex: 1,
    padding: "40px 48px 0",
    maxWidth: 1160,
    width: "100%",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 40,
  },
hero: {
    position: "relative",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    gap: 72,
    padding: "72px 0 24px",
  },
  heroLeft: {
    position: "relative",
    zIndex: 1,
    flex: 1.05,
    minWidth: 0,
  },
  heroEyebrow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    fontWeight: 600,
    color: "var(--accent)",
    background: "color-mix(in srgb, var(--accent) 10%, transparent)",
    border: "1px solid color-mix(in srgb, var(--accent) 22%, transparent)",
    borderRadius: 999,
    padding: "6px 14px",
    marginBottom: 22,
  },
  heroEyebrowDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "var(--accent)",
    boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent)",
  },
  heroTitle: {
    fontSize: 56,
    fontWeight: 800,
    lineHeight: 1.03,
    color: "var(--text)",
    letterSpacing: "-0.045em",
    margin: 0,
    marginBottom: 18,
    fontFamily: "var(--font-display)",
  },
  heroSubtitle: {
    fontSize: 17,
    lineHeight: 1.65,
    color: "var(--text-muted)",
    margin: 0,
    marginBottom: 28,
    maxWidth: 500,
  },
  heroPanel: {
    maxWidth: 500,
    borderRadius: "var(--radius-2xl)",
    padding: "10px",
    boxShadow: "var(--elev-raised)",
    display: "flex",
    flexDirection: "column",
  },
  heroForm: {
    display: "flex",
    gap: 10,
  },
  heroInput: {
    flex: 1,
    padding: "14px 18px",
    fontSize: 15,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--bg-input)",
    color: "var(--text)",
    outline: "none",
    minWidth: 0,
  },
  heroBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "14px 24px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 999,
    border: "none",
    background: "var(--accent)",
    color: "var(--accent-ink)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  joinRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    margin: "14px 8px",
  },
  divider: {
    flex: 1,
    height: 1,
    background: "var(--border)",
  },
  or: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-dim)",
    whiteSpace: "nowrap",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  joinBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "14px 22px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "color-mix(in srgb, var(--bg-soft) 60%, transparent)",
    color: "var(--text)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  codeInput: {
    fontFamily: "var(--font-mono)",
    letterSpacing: "0.16em",
    fontWeight: 700,
    textTransform: "uppercase",
    textAlign: "center",
    fontSize: 16,
  },
  error: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--danger)",
    background: "color-mix(in srgb, var(--danger) 8%, transparent)",
    borderRadius: 999,
    margin: "6px 6px 0",
  },
heroRight: {
    position: "relative",
    zIndex: 1,
    flex: 1,
    minWidth: 0,
  },
  mockFrame: {
    borderRadius: "var(--radius-2xl)",
    overflow: "hidden",
    background: "linear-gradient(160deg, #131722 0%, #0b0e16 100%)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "var(--elev-floating)",
  },
  mockTopbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 18px",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
  },
  mockRec: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.14em",
    fontWeight: 700,
    color: "#ff5f66",
  },
  mockRecDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#ff5f66",
    boxShadow: "0 0 0 3px rgba(255,95,102,0.25)",
    animation: "pulse 1.6s ease-in-out infinite",
  },
  mockTime: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    letterSpacing: "0.06em",
  },
  mockIcons: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    letterSpacing: "0.2em",
  },
  mockGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    padding: 14,
  },
  mockTile: {
    position: "relative",
    aspectRatio: "16/10",
    borderRadius: "var(--radius-lg)",
    background: "linear-gradient(135deg, #1b2233 0%, #121826 100%)",
    border: "1px solid rgba(255,255,255,0.06)",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  mockAvatar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 54,
    height: 54,
    borderRadius: "50%",
    color: "#fff",
    fontSize: 22,
    fontWeight: 700,
    boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
  },
  mockName: {
    position: "absolute",
    bottom: 8,
    left: 8,
    fontSize: 11,
    fontWeight: 600,
    color: "rgba(255,255,255,0.92)",
    background: "rgba(10,12,18,0.55)",
    WebkitBackdropFilter: "blur(6px)",
    backdropFilter: "blur(6px)",
    padding: "3px 9px",
    borderRadius: 999,
    letterSpacing: "0.02em",
  },
  featureBand: {
    background: "var(--bg-soft)",
    borderRadius: "var(--radius-2xl)",
    padding: "56px 40px 48px",
    border: "1px solid var(--border-soft)",
  },
  featureHeader: {
    textAlign: "center",
    marginBottom: 36,
  },
  featureEyebrow: {
    display: "inline-block",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    fontWeight: 700,
    color: "var(--accent)",
    marginBottom: 12,
  },
  featureHeading: {
    fontSize: 32,
    fontWeight: 800,
    color: "var(--text)",
    letterSpacing: "-0.03em",
    margin: 0,
    fontFamily: "var(--font-display)",
  },
  featureIntro: {
    fontSize: 15,
    color: "var(--text-muted)",
    margin: "10px auto 0",
    maxWidth: 460,
  },
  features: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 18,
  },
  featureCard: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-xl)",
    padding: 26,
    boxShadow: "var(--elev-ring)",
    display: "flex",
    flexDirection: "column",
    textAlign: "left",
  },
  featureIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: 14,
    background: "color-mix(in srgb, var(--accent) 12%, transparent)",
    color: "var(--accent)",
    marginBottom: 16,
  },
  featureTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text)",
    marginBottom: 6,
    fontFamily: "var(--font-display)",
    letterSpacing: "-0.01em",
  },
  featureDesc: {
    margin: 0,
    fontSize: 13.5,
    color: "var(--text-muted)",
    lineHeight: 1.6,
  },
  howSection: {
    marginTop: 24,
    padding: "44px 40px",
    borderRadius: "var(--radius-2xl)",
  },
  howHeader: {
    textAlign: "center",
    marginBottom: 32,
  },
  howTitle: {
    fontSize: 28,
    fontWeight: 800,
    color: "var(--text)",
    letterSpacing: "-0.03em",
    margin: 0,
    fontFamily: "var(--font-display)",
  },
  howSteps: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 18,
  },
  howStep: {
    textAlign: "center",
    padding: "8px 12px",
  },
  howStepNum: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    borderRadius: "50%",
    background: "var(--accent)",
    color: "var(--accent-ink)",
    fontSize: 15,
    fontWeight: 800,
    marginBottom: 12,
    fontFamily: "var(--font-display)",
  },
  howStepTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text)",
    marginBottom: 6,
  },
  howStepDesc: {
    margin: 0,
    fontSize: 13.5,
    lineHeight: 1.55,
    color: "var(--text-muted)",
    maxWidth: 260,
    marginLeft: "auto",
    marginRight: "auto",
  },
  tableCard: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-xl)",
    padding: 26,
    boxShadow: "var(--elev-ring)",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: "var(--text)",
    margin: 0,
    fontFamily: "var(--font-display)",
    letterSpacing: "-0.02em",
  },
  cardMore: {
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--accent)",
    cursor: "pointer",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-dim)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  },
  tr: {
    borderBottom: "1px solid var(--border-soft)",
  },
  td: {
    padding: "12px",
    fontSize: 14,
    color: "var(--text)",
    verticalAlign: "middle",
  },
  codePill: {
    padding: "3px 10px",
    borderRadius: 6,
    background: "color-mix(in srgb, var(--accent) 10%, transparent)",
    color: "var(--accent)",
    fontFamily: "var(--font-mono)",
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: "0.06em",
  },
  tdMuted: { color: "var(--text-dim)" },
  invitedChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    maxWidth: 220,
  },
  invitedChip: {
    padding: "2px 8px",
    borderRadius: 999,
    background: "color-mix(in srgb, var(--accent) 12%, transparent)",
    color: "var(--accent)",
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    padding: "44px 24px",
    borderRadius: "var(--radius-lg)",
    background: "color-mix(in srgb, var(--bg-soft) 60%, transparent)",
    border: "1px dashed var(--border)",
    textAlign: "center",
  },
  emptyIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 46,
    height: 46,
    borderRadius: "50%",
    background: "var(--bg-hover)",
    color: "var(--text-dim)",
  },
  emptyText: { fontSize: 14, color: "var(--text-dim)", margin: 0 },
  view: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  viewCard: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-xl)",
    padding: 28,
    boxShadow: "var(--elev-ring)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  viewTitle: { fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0, fontFamily: "var(--font-display)", letterSpacing: "-0.02em" },
  viewDesc: { fontSize: 14, color: "var(--text-muted)", margin: 0 },
  plainInput: {
    flex: 1,
    padding: "12px 16px",
    fontSize: 14,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--bg-input)",
    color: "var(--text)",
    outline: "none",
    minWidth: 0,
  },
  schedPickRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
  schedPickCol: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  },
  schedPickLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  schedSummary: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    borderRadius: 999,
    background: "color-mix(in srgb, var(--accent) 10%, transparent)",
    border: "1px solid color-mix(in srgb, var(--accent) 26%, transparent)",
    color: "var(--accent)",
    fontSize: 13,
    fontWeight: 600,
  },
  schedSummaryIcon: { flexShrink: 0 },
  emailNote: {
    padding: "10px 16px",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 999,
    lineHeight: 1.5,
  },
  authPrompt: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    padding: "16px 0",
  },
  authPromptBtn: {
    padding: "12px 28px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 999,
    border: "none",
    background: "var(--accent)",
    color: "var(--accent-ink)",
    cursor: "pointer",
  },
  cancelBtn: {
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 999,
    border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
    background: "color-mix(in srgb, var(--danger) 8%, transparent)",
    color: "var(--danger)",
    cursor: "pointer",
  },
  footer: { marginTop: "auto", paddingTop: 20 },
  footerText: { fontSize: 12, color: "var(--text-dim)" },
  toast: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    padding: "12px 20px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 999,
    background: "var(--text)",
    color: "var(--bg)",
    boxShadow: "var(--elev-floating)",
    zIndex: 200,
    animation: "toastIn 0.2s ease",
  },
  authOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(10,13,20,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    WebkitBackdropFilter: "blur(8px)",
    backdropFilter: "blur(8px)",
  },
  authModal: {
    position: "relative",
    width: 400,
    maxWidth: "92vw",
    background: "color-mix(in srgb, var(--bg-card) 82%, transparent)",
    WebkitBackdropFilter: "blur(24px) saturate(160%)",
    backdropFilter: "blur(24px) saturate(160%)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-2xl)",
    padding: "32px 36px",
    boxShadow: "var(--elev-floating)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  authClose: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 30,
    height: 30,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    border: "none",
    background: "var(--bg-soft)",
    color: "var(--text-muted)",
    cursor: "pointer",
  },
  authBrand: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  authBrandIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 9,
    background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)",
  },
  authBrandText: { fontSize: 16, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em", fontFamily: "var(--font-display)" },
  authTitle: { fontSize: 26, fontWeight: 800, color: "var(--text)", margin: 0, textAlign: "center", marginTop: 8, fontFamily: "var(--font-display)", letterSpacing: "-0.03em" },
  authSub: { fontSize: 13, color: "var(--text-muted)", margin: 0, textAlign: "center", marginBottom: 10 },
  githubBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "13px 16px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text)",
    cursor: "pointer",
  },
  googleBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "13px 16px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "#fff",
    color: "var(--text)",
    cursor: "pointer",
  },
  emailBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "13px 16px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text)",
    cursor: "pointer",
  },
  authBack: {
    alignSelf: "flex-start",
    padding: "4px 0",
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    background: "transparent",
    color: "var(--accent)",
    cursor: "pointer",
    marginBottom: 2,
  },
  authDivider: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "var(--text-dim)",
    fontSize: 12,
    margin: "4px 0",
    width: "100%",
  },
  authDividerLine: {
    flex: 1,
    height: 1,
    background: "var(--border)",
  },
  authDividerText: { whiteSpace: "nowrap" },
  authField: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  authFieldIcon: {
    position: "absolute",
    left: 12,
    color: "var(--text-dim)",
    pointerEvents: "none",
  },
  authInput: {
    width: "100%",
    padding: "13px 12px 13px 38px",
    fontSize: 14,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--bg-input)",
    color: "var(--text)",
    outline: "none",
  },
  authForgotRow: {
    display: "flex",
    justifyContent: "flex-end",
  },
  authForgot: {
    padding: "4px 0",
    fontSize: 12,
    fontWeight: 600,
    border: "none",
    background: "transparent",
    color: "var(--accent)",
    cursor: "pointer",
  },
  authError: {
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--danger)",
    background: "color-mix(in srgb, var(--danger) 8%, transparent)",
    borderRadius: 999,
  },
  authNote: {
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text)",
    background: "color-mix(in srgb, var(--accent) 10%, transparent)",
    border: "1px solid var(--border)",
    borderRadius: 999,
    textAlign: "center",
  },
  authSubmit: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "13px 20px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 999,
    border: "none",
    background: "var(--accent)",
    color: "var(--accent-ink)",
    cursor: "pointer",
    marginTop: 2,
  },
  authAlt: {
    fontSize: 13,
    color: "var(--text-muted)",
    textAlign: "center",
    margin: "10px 0 0",
  },
  authAltLink: {
    padding: 0,
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    background: "transparent",
    color: "var(--accent)",
    cursor: "pointer",
  },
};
