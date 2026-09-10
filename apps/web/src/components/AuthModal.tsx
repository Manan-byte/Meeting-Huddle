/**
 * @file AuthModal — sign in / sign up / forgot-password dialog.
 *
 * Self-contained auth UI extracted from HomePage: owns its own form state
 * and talks to the auth socket events (auth:register/login/forgot/reset)
 * through useAuth + useSocket. HomePage only decides when to open it and
 * which tab to start on.
 *
 * Connects to: AuthContext (register/login), SocketContext (auth:forgot/reset),
 *              HomePage (open/close, toast)
 */

import { useState } from "react";
import type { CSSProperties } from "react";
import { Plus, Mail, Lock, X, Video, User as UserIcon } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useSocket } from "../contexts/SocketContext";

export type AuthMode = "email" | "register" | "forgot";

interface AuthModalProps {
  /** Tab to open on mount. */
  initialMode?: AuthMode;
  onClose: () => void;
  /** Show a toast in HomePage (e.g. "Signed in."). */
  showToast: (msg: string) => void;
}

export function AuthModal({ initialMode = "email", onClose, showToast }: AuthModalProps) {
  const { socket } = useSocket();
  const { register, login } = useAuth();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  /** Reset code issued by auth:forgot (shown on-screen — no email service). */
  const [resetCode, setResetCode] = useState("");
  /** User-typed reset code for auth:reset. */
  const [resetCodeInput, setResetCodeInput] = useState("");
  /** True once auth:forgot succeeded — show the code + new-password step. */
  const [resetIssued, setResetIssued] = useState(false);

  const resetForm = () => {
    setMode("email");
    setError("");
    setPassword("");
    setEmail("");
    setName("");
    setResetCode("");
    setResetCodeInput("");
    setResetIssued(false);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button style={styles.close} onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <div style={styles.brand}>
          <span style={styles.brandIcon}><Video size={16} color="var(--accent-ink)" /></span>
          <span style={styles.brandText}>Huddle</span>
        </div>

        <h2 style={styles.title}>
          {mode === "register" ? "Create account" : mode === "forgot" ? "Reset password" : "Sign in"}
        </h2>
        {mode !== "forgot" && (
          <p style={styles.sub}>
            {mode === "register"
              ? "Sign up to schedule meetings and invite guests."
              : "Sign in to schedule meetings and invite guests."}
          </p>
        )}

        {mode === "register" ? (
          <>
            {/* Email + name + password register */}
            <div style={styles.field}>
              <UserIcon size={16} style={styles.fieldIcon} />
              <input
                style={styles.input}
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div style={styles.field}>
              <Mail size={16} style={styles.fieldIcon} />
              <input
                style={styles.input}
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div style={styles.field}>
              <Lock size={16} style={styles.fieldIcon} />
              <input
                style={styles.input}
                type="password"
                placeholder="Password (min 6 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <button
              className="dash-primary" style={styles.submit}
              onClick={async () => {
                const err = await register(name, email, password);
                if (err) setError(err);
                else {
                  onClose();
                  resetForm();
                  showToast("Account created — signed in.");
                }
              }}
            >
              <Plus size={16} /> Create account
            </button>
          </>
        ) : mode === "forgot" ? (
          <>
            {/* Forgot password — email → reset code → new password */}
            <button
              style={styles.back}
              onClick={() => { setMode("email"); setError(""); setResetIssued(false); setResetCode(""); }}
            >
              ← Back
            </button>

            {!resetIssued ? (
              <>
                <p style={styles.sub}>
                  Enter your account email. We'll issue a one-time reset code.
                </p>
                <div style={styles.field}>
                  <Mail size={16} style={styles.fieldIcon} />
                  <input
                    style={styles.input}
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {error && <div style={styles.error}>{error}</div>}
                <button
                  className="dash-primary" style={styles.submit}
                  onClick={() => {
                    if (!socket) return;
                    socket.emit("auth:forgot", { email }, (res: { ok: boolean; resetCode?: string; error?: string }) => {
                      if (res.ok && res.resetCode) {
                        setResetCode(res.resetCode);
                        setResetIssued(true);
                        setError("");
                      } else {
                        setError(res.error ?? "Could not issue a reset code.");
                      }
                    });
                  }}
                >
                  Send reset code
                </button>
              </>
            ) : (
              <>
                <div style={styles.note}>
                  Reset code (30 min): <strong>{resetCode}</strong>
                </div>
                <div style={styles.field}>
                  <Lock size={16} style={styles.fieldIcon} />
                  <input
                    style={styles.input}
                    type="text"
                    placeholder="Reset code"
                    value={resetCodeInput}
                    onChange={(e) => setResetCodeInput(e.target.value.toUpperCase())}
                    maxLength={6}
                  />
                </div>
                <div style={styles.field}>
                  <Lock size={16} style={styles.fieldIcon} />
                  <input
                    style={styles.input}
                    type="password"
                    placeholder="New password (min 6 chars)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {error && <div style={styles.error}>{error}</div>}
                <button
                  className="dash-primary" style={styles.submit}
                  onClick={() => {
                    if (!socket) return;
                    socket.emit("auth:reset", { email, code: resetCodeInput, newPassword: password }, (res: { ok: boolean; error?: string }) => {
                      if (res.ok) {
                        onClose();
                        resetForm();
                        showToast("Password updated — sign in with your new password.");
                      } else {
                        setError(res.error ?? "Reset failed. Try again.");
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
            <div style={styles.field}>
              <Mail size={16} style={styles.fieldIcon} />
              <input
                style={styles.input}
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div style={styles.field}>
              <Lock size={16} style={styles.fieldIcon} />
              <input
                style={styles.input}
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div style={styles.forgotRow}>
              <button style={styles.forgot} onClick={() => { setMode("forgot"); setError(""); setResetIssued(false); setResetCode(""); }}>
                Forgot password?
              </button>
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <button
              className="dash-primary" style={styles.submit}
              onClick={async () => {
                const err = await login(email, password);
                if (err) setError(err);
                else {
                  onClose();
                  resetForm();
                  showToast("Signed in.");
                }
              }}
            >
              Sign in
            </button>

            <p style={styles.alt}>
              New to Huddle?{" "}
              <button style={styles.altLink} onClick={() => { setMode("register"); setError(""); }}>
                Sign up with email
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(10,13,20,0.6)",
    backdropFilter: "blur(6px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    WebkitBackdropFilter: "blur(8px)",
  },
  modal: {
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
  close: {
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
  brand: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginBottom: 2,
  },
  brandIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 10,
    background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)",
  },
  brandText: { fontSize: 16, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em", fontFamily: "var(--font-display)" },
  title: { fontSize: 26, fontWeight: 800, color: "var(--text)", margin: 0, textAlign: "center", marginTop: 8, fontFamily: "var(--font-display)", letterSpacing: "-0.03em" },
  sub: { fontSize: 13, color: "var(--text-muted)", margin: 0, textAlign: "center", marginBottom: 10 },
  back: {
    alignSelf: "flex-start",
    padding: "4px 0",
    fontSize: 13,
    fontWeight: 600,
    background: "transparent",
    border: "none",
    color: "var(--accent)",
    cursor: "pointer",
    marginBottom: 2,
  },
  field: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  fieldIcon: {
    position: "absolute",
    left: 12,
    color: "var(--text-dim)",
    pointerEvents: "none",
  },
  input: {
    width: "100%",
    padding: "13px 12px 13px 38px",
    fontSize: 14,
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--border)",
    background: "var(--bg-input)",
    color: "var(--text)",
    outline: "none",
  },
  forgotRow: {
    display: "flex",
    justifyContent: "flex-end",
  },
  forgot: {
    padding: "4px 0",
    fontSize: 12,
    fontWeight: 600,
    background: "transparent",
    border: "none",
    color: "var(--accent)",
    cursor: "pointer",
  },
  error: {
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--danger)",
    background: "color-mix(in srgb, var(--danger) 8%, transparent)",
    borderRadius: 999,
  },
  note: {
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--accent-dark)",
    background: "color-mix(in srgb, var(--accent) 10%, transparent)",
    borderRadius: 999,
  },
  submit: {
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
  alt: {
    fontSize: 13,
    color: "var(--text-muted)",
    textAlign: "center",
    margin: "10px 0 0",
  },
  altLink: {
    padding: 0,
    fontSize: 13,
    fontWeight: 600,
    background: "transparent",
    border: "none",
    color: "var(--accent)",
    cursor: "pointer",
  },
};