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
  Github,
  Mail,
  Lock,
  X,
  CalendarDays,
} from "lucide-react";
import { SOCKET_EVENTS } from "@meet-app/shared";
import type { Room, User } from "@meet-app/shared";
import { useSocket } from "../contexts/SocketContext";
import { useRoom } from "../contexts/RoomContext";
import { useAuth } from "../contexts/AuthContext";
import { PreJoinScreen } from "../components/PreJoinScreen";
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
  const { user, loading: authLoading, login, logout } = useAuth();

  const [history, setHistory] = useState<HistoryMeeting[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledMeeting[]>([]);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"choose" | "email">("choose");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
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
              <button style={styles.signOutBtn} onClick={logout}>Sign out</button>
            </div>
          ) : (
            <button style={styles.signInBtn} onClick={() => setShowAuth(true)}>Sign in</button>
          ))}
        </div>
      </header>

      <main style={styles.main}>
        {/* ── Dashboard / Landing hero ───────────────────────────── */}
        {activeView === "dashboard" && (
          <>
            <section style={styles.hero}>
              <div style={styles.heroLeft}>
                <h1 style={styles.heroTitle}>{viewTitle}</h1>
                <p style={styles.heroSubtitle}>
                  Free, browser-based video meetings — powered by Cloudflare edge infrastructure.
                  Share screens, chat, poll, and record in real time with no install.
                </p>

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
                  <button style={styles.joinBtn} onClick={handleJoin} disabled={!userName.trim() || !joinCode.trim() || isCreating}>
                    <ArrowRight size={16} /> Join
                  </button>
                </div>

                {error && (
                  <div style={styles.error}>
                    <XCircle size={14} /> <span>{error}</span>
                  </div>
                )}
              </div>

              {/* Mock video-call illustration */}
              <div style={styles.heroRight}>
                <div style={styles.mockGrid}>
                  {[
                    { name: "Alice", from: "#4f46e5", to: "#7c3aed" },
                    { name: "Bob", from: "#0ea5e9", to: "#2563eb" },
                    { name: "You", from: "#10b981", to: "#059669" },
                    { name: "Carol", from: "#f59e0b", to: "#ef4444" },
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
            </section>

            {/* Feature strip */}
            <section style={styles.features}>
              {features.map((f) => {
                const Icon = f.icon;
                return (
                  <div className="dash-card" key={f.title} style={styles.featureCard}>
                    <span style={styles.featureIcon}><Icon size={20} /></span>
                    <h3 style={styles.featureTitle}>{f.title}</h3>
                    <p style={styles.featureDesc}>{f.desc}</p>
                  </div>
                );
              })}
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
                    <span style={styles.emptyIcon}>🕓</span>
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
                        <tr key={m.id} style={styles.tr}>
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
                    background: emailMsg.type === "warn" ? "rgba(245,158,11,0.12)" : "rgba(155,234,92,0.15)",
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
                <div style={styles.emptyState}><span style={styles.emptyIcon}>🗓</span><p style={styles.emptyText}>No upcoming meetings scheduled yet.</p></div>
              ) : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Title</th><th style={styles.th}>Code</th><th style={styles.th}>Date</th><th style={styles.th}>Time</th><th style={styles.th}>Invited</th><th style={styles.th}></th></tr></thead>
                  <tbody>
                    {scheduled.map((m) => (
                      <tr key={m.id} style={styles.tr}>
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
                <div style={styles.emptyState}><span style={styles.emptyIcon}>🕓</span><p style={styles.emptyText}>No past meetings yet.</p></div>
              ) : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Title</th><th style={styles.th}>Code</th><th style={styles.th}>Participants</th><th style={styles.th}>Time</th></tr></thead>
                  <tbody>
                    {history.map((m) => (
                      <tr key={m.id} style={styles.tr}>
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

        <footer style={styles.footer}>
          <span style={styles.footerText}>
            Built with <span style={{ color: "var(--accent-dark)" }}>WebRTC</span> &bull;{" "}
            <span style={{ color: "var(--accent-dark)" }}>Socket.IO</span> &bull;{" "}
            <span style={{ color: "var(--accent-dark)" }}>React</span>
          </span>
        </footer>
      </main>

      {/* Toast */}
      {toast && <div style={styles.toast}>{toast}</div>}

      {/* Auth modal — sign in with email or GitHub (no manual registration) */}
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

            {authMode === "choose" ? (
              <>
                {/* GitHub login */}
                <button
                  style={styles.githubBtn}
                  onClick={() => {
                    const cid = import.meta.env.VITE_GITHUB_CLIENT_ID;
                    if (cid) {
                      const redirect = encodeURIComponent(`${window.location.origin}/auth/github/callback`);
                      window.location.href =
                        `https://github.com/login/oauth/authorize?client_id=${cid}&redirect_uri=${redirect}&scope=user:email`;
                    } else {
                      showToast("GitHub login belum dikonfigurasi (VITE_GITHUB_CLIENT_ID).");
                    }
                  }}
                >
                  <Github size={18} />
                  Continue with GitHub
                </button>

                {/* Email login */}
                <button
                  style={styles.emailBtn}
                  onClick={() => { setAuthMode("email"); setAuthError(""); }}
                >
                  <Mail size={18} />
                  Continue with email
                </button>

                <div style={styles.authDivider}><span style={styles.authDividerText}>or</span></div>

                <p style={styles.authAlt}>
                  New to Huddle?{" "}
                  <button style={styles.authAltLink} onClick={() => {
                    const cid = import.meta.env.VITE_GITHUB_CLIENT_ID;
                    if (cid) {
                      const redirect = encodeURIComponent(`${window.location.origin}/auth/github/callback`);
                      window.location.href =
                        `https://github.com/login/oauth/authorize?client_id=${cid}&redirect_uri=${redirect}&scope=user:email`;
                    } else {
                      showToast("GitHub sign-up belum dikonfigurasi (VITE_GITHUB_CLIENT_ID).");
                    }
                  }}>
                    Sign up with GitHub
                  </button>
                </p>
              </>
            ) : (
              <>
                {/* Email + password */}
                <button
                  style={styles.authBack}
                  onClick={() => { setAuthMode("choose"); setAuthError(""); }}
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
                  <button style={styles.authForgot} onClick={() => showToast("Password reset is not configured.")}>
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
                      setShowAuth(false); setAuthMode("choose"); setAuthError(""); setAuthEmail(""); setAuthPassword("");
                      showToast("Signed in.");
                    }
                  }}
                >
                  Sign in
                </button>
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
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    display: "flex",
    flexDirection: "column",
  },
  nav: {
    display: "flex",
    alignItems: "center",
    gap: 24,
    padding: "14px 32px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-raised)",
    position: "sticky",
    top: 0,
    zIndex: 50,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    background: "transparent",
    border: "none",
    cursor: "pointer",
  },
  brandIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 8,
    background: "var(--accent)",
  },
  brandText: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text)",
    letterSpacing: "-0.02em",
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
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  navLinkActive: {
    background: "rgba(155,234,92,0.18)",
    color: "var(--accent-dark)",
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
    background: "var(--accent)",
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
    padding: "40px 48px 24px",
    maxWidth: 1080,
    width: "100%",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 28,
  },
  hero: {
    display: "flex",
    alignItems: "center",
    gap: 48,
  },
  heroLeft: {
    flex: 1,
    minWidth: 0,
  },
  heroTitle: {
    fontSize: 40,
    fontWeight: 800,
    lineHeight: 1.15,
    color: "var(--text)",
    letterSpacing: "-0.03em",
    margin: 0,
    marginBottom: 14,
  },
  heroSubtitle: {
    fontSize: 16,
    lineHeight: 1.6,
    color: "var(--text-muted)",
    margin: 0,
    marginBottom: 24,
  },
  heroForm: {
    display: "flex",
    gap: 10,
    marginBottom: 12,
  },
  heroInput: {
    flex: 1,
    padding: "12px 16px",
    fontSize: 15,
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--bg-input)",
    color: "var(--text)",
    outline: "none",
  },
  heroBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "12px 22px",
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 12,
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
    margin: "8px 0",
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
  },
  joinBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "12px 20px",
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  codeInput: {
    fontFamily: "monospace",
    letterSpacing: "0.1em",
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
    background: "rgba(239,68,68,0.08)",
    borderRadius: 10,
  },
  heroRight: {
    flex: 1,
    minWidth: 0,
  },
  mockGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    background:
      "radial-gradient(ellipse 80% 80% at 50% 20%, rgba(155,234,92,0.14) 0%, transparent 60%), var(--bg-soft)",
    borderRadius: 20,
    padding: 20,
    border: "1px solid var(--border)",
  },
  mockTile: {
    position: "relative",
    aspectRatio: "16/10",
    borderRadius: 12,
    background: "linear-gradient(135deg, #1f2937 0%, #111827 100%)",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  mockAvatar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 56,
    height: 56,
    borderRadius: "50%",
    color: "#fff",
    fontSize: 22,
    fontWeight: 700,
    boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
  },
  mockName: {
    position: "absolute",
    bottom: 8,
    left: 8,
    fontSize: 11,
    fontWeight: 600,
    color: "#fff",
    background: "rgba(0,0,0,0.5)",
    padding: "3px 8px",
    borderRadius: 999,
  },
  features: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 16,
  },
  featureCard: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-xl)",
    padding: 20,
    boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
  },
  featureIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: 12,
    background: "rgba(155,234,92,0.2)",
    color: "var(--accent-dark)",
    marginBottom: 12,
  },
  featureTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text)",
    marginBottom: 4,
  },
  featureDesc: {
    margin: 0,
    fontSize: 13,
    color: "var(--text-muted)",
    lineHeight: 1.5,
  },
  tableCard: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-xl)",
    padding: 20,
    boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text)",
    margin: 0,
  },
  cardMore: {
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text-muted)",
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
    letterSpacing: "0.04em",
    padding: "8px 10px",
    borderBottom: "1px solid var(--border)",
  },
  tr: {
    borderBottom: "1px solid var(--border-soft)",
  },
  td: {
    padding: "10px",
    fontSize: 13,
    color: "var(--text)",
  },
  codePill: {
    padding: "2px 8px",
    borderRadius: 6,
    background: "var(--bg-soft)",
    fontFamily: "monospace",
    fontWeight: 700,
    fontSize: 12,
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
    background: "rgba(155,234,92,0.18)",
    color: "var(--accent-dark)",
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: "24px 0",
    borderRadius: "var(--radius-lg)",
    background: "var(--bg-soft)",
    textAlign: "center",
  },
  emptyIcon: { fontSize: 24 },
  emptyText: { fontSize: 13, color: "var(--text-dim)", margin: 0 },
  view: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  viewCard: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-xl)",
    padding: 24,
    boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  viewTitle: { fontSize: 20, fontWeight: 700, color: "var(--text)", margin: 0 },
  viewDesc: { fontSize: 14, color: "var(--text-muted)", margin: 0 },
  plainInput: {
    flex: 1,
    padding: "11px 14px",
    fontSize: 14,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-input)",
    color: "var(--text)",
    outline: "none",
    minWidth: 0,
  },
  schedPickRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
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
    letterSpacing: "0.04em",
  },
  schedSummary: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 10,
    background: "rgba(155,234,92,0.12)",
    border: "1px solid rgba(155,234,92,0.35)",
    color: "var(--accent-dark)",
    fontSize: 13,
    fontWeight: 600,
  },
  schedSummaryIcon: { flexShrink: 0 },
  emailNote: {
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 10,
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
    fontWeight: 700,
    borderRadius: 12,
    border: "none",
    background: "var(--accent)",
    color: "var(--accent-ink)",
    cursor: "pointer",
  },
  cancelBtn: {
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
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
    borderRadius: 12,
    background: "var(--text)",
    color: "var(--bg)",
    boxShadow: "0 12px 32px rgba(15,23,42,0.2)",
    zIndex: 200,
    animation: "toastIn 0.2s ease",
  },
  authOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    backdropFilter: "blur(3px)",
  },
  authModal: {
    position: "relative",
    width: 400,
    maxWidth: "92vw",
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding: "30px 34px",
    boxShadow: "0 25px 60px rgba(15,23,42,0.25)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  authClose: {
    position: "absolute",
    top: 14,
    right: 14,
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
    width: 26,
    height: 26,
    borderRadius: 7,
    background: "var(--accent)",
  },
  authBrandText: { fontSize: 15, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em" },
  authTitle: { fontSize: 24, fontWeight: 800, color: "var(--text)", margin: 0, textAlign: "center", marginTop: 6 },
  authSub: { fontSize: 13, color: "var(--text-muted)", margin: 0, textAlign: "center", marginBottom: 8 },
  githubBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text)",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  emailBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text)",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  authBack: {
    alignSelf: "flex-start",
    padding: "4px 0",
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    background: "transparent",
    color: "var(--accent-dark)",
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
    padding: "12px 12px 12px 38px",
    fontSize: 14,
    borderRadius: 10,
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
    color: "var(--accent-dark)",
    cursor: "pointer",
  },
  authError: {
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--danger)",
    background: "rgba(239,68,68,0.08)",
    borderRadius: 8,
  },
  authSubmit: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px 20px",
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 10,
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
    color: "var(--accent-dark)",
    cursor: "pointer",
  },
};
