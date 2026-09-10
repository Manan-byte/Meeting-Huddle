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
  CalendarDays,
} from "lucide-react";
import { SOCKET_EVENTS } from "@meet-app/shared";
import type { Room, User, ChatMessage } from "@meet-app/shared";
import { useSocket } from "../contexts/SocketContext";
import { useRoom } from "../contexts/RoomContext";
import { useAuth } from "../contexts/AuthContext";
import { AuthModal } from "../components/AuthModal";
import type { AuthMode } from "../components/AuthModal";
import { PreJoinScreen } from "../components/PreJoinScreen";
import { ParticleField } from "../components/ParticleField";
import { CalendarPicker, TimePicker, buildInviteMailto } from "../components/SchedulePicker";
import { styles } from "./home/styles";
import "../styles/HomePage.css";

interface HomePageProps {
  /** Called when the user successfully creates/joins a meeting (enter room view). */
  onJoinRoom: () => void;
  /** Called when joining a locked room — enter the room view in waiting state. */
  onWaitingRoom: () => void;
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

export function HomePage({ onJoinRoom, onWaitingRoom }: HomePageProps) {
  const { socket } = useSocket();
  const { setRoom, setCurrentUser, setParticipants, setMessages } = useRoom();
  const { user, loading: authLoading, logout, token } = useAuth();

  const [history, setHistory] = useState<HistoryMeeting[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledMeeting[]>([]);
  /** Auth modal tab (null = closed). */
  const [authModal, setAuthModal] = useState<AuthMode | null>(null);
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

  // Load real dashboard data from the server. Only signed-in users may
  // fetch history/schedule — the server rejects unauthenticated requests.
  useEffect(() => {
    if (!socket || !user || !token) return;
    const onHistory = (rows: HistoryMeeting[]) => setHistory(rows);
    const onSchedule = (rows: ScheduledMeeting[]) => setScheduled(rows);
    socket.on(DASH_EVENTS.HISTORY_RESULT, onHistory);
    socket.on(DASH_EVENTS.SCHEDULE_RESULT, onSchedule);
    socket.emit(DASH_EVENTS.GET_HISTORY, { token });
    socket.emit(DASH_EVENTS.GET_SCHEDULE, { token });
    return () => {
      socket.off(DASH_EVENTS.HISTORY_RESULT, onHistory);
      socket.off(DASH_EVENTS.SCHEDULE_RESULT, onSchedule);
    };
  }, [socket, user, token]);

  useEffect(() => {
    if (user?.name && !userName) setUserName(user.name);
  }, [user, userName]);

  // Invite-link prefill.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("join");
    if (code) setJoinCode(code.toUpperCase());
  }, []);

  // Session restore from a server redirect (?auth_token= or ?auth_error=).
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
      showToast(`Sign-in error: ${error}`);
    }
  }, []);

  const handleCreate = () => {
    if (!socket) return;
    if (!userName.trim()) {
      setError("Please enter your name first to start a meeting. (No account needed.)");
      return;
    }
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
    socket.once("error", (msg) => {
      const raw = typeof msg === "string" ? msg : msg?.message ?? "";
      setError(raw || "Could not create the meeting. Please try again.");
      setIsCreating(false);
      setPreviewing(null);
    });
  };

  const handleJoin = () => {
    if (!socket) return;
    if (!userName.trim()) {
      setError("Please enter your name first to join the meeting. (No account needed.)");
      return;
    }
    if (!joinCode.trim()) {
      setError("Enter the 6-character meeting code from the invite.");
      return;
    }
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
    // The server sends CHAT_HISTORY immediately after ROOM_JOINED (same WS
    // dispatch tick). Register before the room view mounts, or the history
    // message is dropped while no listener exists yet.
    socket.once(SOCKET_EVENTS.CHAT_HISTORY, (history) => {
      if (Array.isArray(history)) setMessages(history as ChatMessage[]);
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
    socket.once("error", (msg) => {
      const raw = typeof msg === "string" ? msg : msg?.message ?? "";
      const friendly =
        raw === "Room not found"
          ? "Meeting not found — it may have ended. Ask the host for a new code, or start your own meeting. (No account needed.)"
          : raw || "Could not join the meeting. Please try again.";
      setError(friendly);
      setIsCreating(false);
      setPreviewing(null);
    });
    // Locked room: the server places us in the waiting room (WAITING_ROOM_STATUS).
    // Enter the room view — RoomPage renders the waiting-room screen there and
    // flips to the live meeting when the host admits us (ROOM_JOINED).
    socket.once(SOCKET_EVENTS.WAITING_ROOM_STATUS, () => {
      setIsCreating(false);
      setPreviewing(null);
      onWaitingRoom();
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
            <>
              <button
                className="hp-signup" style={styles.signUpBtn}
                onClick={() => setAuthModal("register")}
              >
                Sign up
              </button>
              <button className="hp-signin" style={styles.signInBtn} onClick={() => setAuthModal("email")}>Sign in</button>
            </>
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
                      disabled={isCreating}
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
                    <button className="hp-ghost" style={styles.joinBtn} onClick={handleJoin} disabled={isCreating}>
                      <ArrowRight size={16} /> Join
                    </button>
                  </div>

                  <p style={styles.heroHint}>
                    No account needed to join — just enter a name. (Sign in only unlocks
                    scheduling &amp; history.)
                  </p>

                  {error && (
                    <div style={styles.error}>
                      <XCircle size={14} /> <span>{error}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Mock video-call illustration removed — static demo tiles misled users into thinking it was a real meeting. */}
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
                    onClick={() => setAuthModal("email")}
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
                  {schedDate ? formatSchedDate(schedDate) : "Pick a date"} · {schedTime ? formatSchedTime(schedTime) : "pick a time"}
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
                  socket.emit(DASH_EVENTS.SCHEDULE, { title: schedTitle, date: schedDate, time: schedTime, invitees, token }, (res: { ok: boolean; meeting?: ScheduledMeeting; error?: string }) => {
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
                          text: `✅ Meeting scheduled — your email app opened to send invites to ${invitees.length} guest(s) (${invitees.join(", ")}).`,
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
                          <button style={styles.cancelBtn} onClick={() => socket?.emit(DASH_EVENTS.CANCEL_SCHEDULE, { id: m.id, token }, () => { setScheduled((prev) => prev.filter((x) => x.id !== m.id)); showToast("Scheduled meeting cancelled."); })}>Cancel</button>
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

      {/* Auth modal — extracted to AuthModal component */}
      {authModal && (
        <AuthModal
          initialMode={authModal}
          onClose={() => setAuthModal(null)}
          showToast={showToast}
        />
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
