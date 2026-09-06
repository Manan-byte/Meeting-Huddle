/**
 * @file AICompanion — AI-powered meeting assistant sidebar panel.
 *
 * Three tabs:
 *   1. Notes: add/view meeting notes (broadcast to all participants)
 *   2. Actions: add/view action items with assignees (track completion)
 *   3. Summary: generate AI summary from chat messages (keyword extraction)
 *
 * Summary generation is client-side: extracts key topics via word frequency
 * and action items from lines starting with TODO/ACTION keywords.
 *
 * Connects to: RoomPage (provides messages, notes, action items, summary),
 *              meetingHandlers (server-side AI events),
 *              shared types (MeetingNote, ActionItem, MeetingSummary)
 */

import { useState, useCallback, useEffect } from "react";
import type { MeetingNote, ActionItem, MeetingSummary } from "@meet-app/shared";
import { SOCKET_EVENTS } from "@meet-app/shared";
import type { Socket } from "socket.io-client";
import { FileText, ListTodo, ClipboardCheck, CheckCircle2 } from "lucide-react";

interface AICompanionProps {
  /** Whether the panel is open. */
  isOpen: boolean;
  /** Callback to close the panel. */
  onClose: () => void;
  /** Socket.IO connection. */
  socket: Socket | null;
  /** Meeting notes (both manual and AI-generated). */
  meetingNotes: MeetingNote[];
  /** Action items (both manual and extracted from chat). */
  actionItems: ActionItem[];
  /** AI-generated meeting summary, or null if not yet generated. */
  meetingSummary: MeetingSummary | null;
  /** Callback to update action items (for toggling done state). */
  onActionItemUpdated: (items: ActionItem[]) => void;
  /** Callback to set the generated summary. */
  onSummaryReady: (summary: MeetingSummary) => void;
  /** Simplified chat messages for keyword extraction. */
  messages: { text: string; senderName: string; timestamp: number }[];
}

/** Active tab in the AI Companion panel. */
type Tab = "notes" | "actions" | "summary";

/**
 * AI Companion panel with three tabs: Notes, Actions, Summary.
 * Provides manual note/action creation and AI-powered summary generation.
 */
export function AICompanion({
  isOpen,
  onClose,
  socket,
  meetingNotes,
  actionItems,
  meetingSummary,
  onActionItemUpdated,
  onSummaryReady,
  messages,
}: AICompanionProps) {
  const [activeTab, setActiveTab] = useState<Tab>("notes");
  const [noteText, setNoteText] = useState("");
  const [actionText, setActionText] = useState("");
  const [assignee, setAssignee] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  /** Auto-live mode: refresh the summary as chat messages arrive. */
  const [isLive, setIsLive] = useState(false);
  /** Add a manual meeting note via socket. */
  const handleAddNote = useCallback(() => {
    if (!noteText.trim() || !socket) return;
    socket.emit(SOCKET_EVENTS.AI_ADD_NOTE, { text: noteText.trim() });
    setNoteText("");
  }, [noteText, socket]);

  /** Add a manual action item via socket. */
  const handleAddAction = useCallback(() => {
    if (!actionText.trim() || !socket) return;
    socket.emit(SOCKET_EVENTS.AI_ACTION_ITEM, {
      text: actionText.trim(),
      assignee: assignee.trim() || null,
    });
    setActionText("");
    setAssignee("");
  }, [actionText, assignee, socket]);

  /** Toggle the done state of an action item (client-side only). */
  const handleToggleActionDone = useCallback(
    (actionId: string) => {
      const updated = actionItems.map((a) =>
        a.id === actionId ? { ...a, done: !a.done } : a,
      );
      onActionItemUpdated(updated);
    },
    [actionItems, onActionItemUpdated],
  );

  /**
   * Generate a meeting summary using client-side keyword extraction.
   * Processes chat messages to find:
   *   - Key topics (most frequent words > 3 chars)
   *   - Action items (lines starting with TODO/ACTION)
   * Simulates a brief delay for UX, then calls onSummaryReady.
   */
  const handleGenerateSummary = useCallback(() => {
    setIsGenerating(true);

    // Client-side keyword extraction from chat messages
    const allText = messages.map((m) => m.text).join(" ");
    const words = allText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3);

    // Word frequency analysis for topic detection
    const freq: Record<string, number> = {};
    for (const w of words) {
      freq[w] = (freq[w] || 0) + 1;
    }
    const keyTopics = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([w]) => w);

    // Extract action items from chat lines starting with TODO/ACTION
    const chatActionItems: ActionItem[] = messages
      .filter((m) => /^(TODO|ACTION|ACTION ITEM)[:\s]/i.test(m.text))
      .map((m, i) => ({
        id: `ai-action-${Date.now()}-${i}`,
        text: m.text.replace(/^(TODO|ACTION|ACTION ITEM)[:\s]*/i, ""),
        assignee: null,
        done: false,
      }));

    const summary: MeetingSummary = {
      notes: meetingNotes,
      actionItems: [...actionItems, ...chatActionItems],
      keyTopics,
      generatedAt: Date.now(),
    };

    // Simulate brief delay for UX
    setTimeout(() => {
      onSummaryReady(summary);
      setIsGenerating(false);
      if (socket) {
        socket.emit(SOCKET_EVENTS.AI_GENERATE_SUMMARY, summary);
      }
    }, 800);
  }, [messages, meetingNotes, actionItems, onSummaryReady, socket]);
  // ── Auto-live summary ───────────────────────────────────────────────
  // When live mode is on, re-generate the summary as chat messages arrive
  // (debounced 1.5s) so the panel stays up to date without manual clicks.
  useEffect(() => {
    if (!isLive || messages.length === 0) return;
    const t = setTimeout(handleGenerateSummary, 1500);
    return () => clearTimeout(t);
  }, [messages, isLive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-start live mode when panel opens and messages already exist
  useEffect(() => {
    if (isOpen && messages.length > 0 && !isLive) setIsLive(true);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  return (
    <div className="ai-companion">
      {/* Header with live toggle + close */}
      <div className="ai-companion-header">
        <h3>AI Companion</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            className={isLive ? "ai-live-btn active" : "ai-live-btn"}
            onClick={() => setIsLive((v) => !v)}
          >
            {isLive ? "● LIVE" : "○ Go Live"}
          </button>
          <button className="ai-companion-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="ai-companion-tabs">
        <button
          className={`ai-tab ${activeTab === "notes" ? "active" : ""}`}
          onClick={() => setActiveTab("notes")}
        >
          <FileText size={14} /> Notes
        </button>
        <button
          className={`ai-tab ${activeTab === "actions" ? "active" : ""}`}
          onClick={() => setActiveTab("actions")}
        >
          <ListTodo size={14} /> Actions
        </button>
        <button
          className={`ai-tab ${activeTab === "summary" ? "active" : ""}`}
          onClick={() => setActiveTab("summary")}
        >
          <ClipboardCheck size={14} /> Summary
        </button>
      </div>

      {/* Tab content */}
      <div className="ai-companion-body">
        {/* Notes tab */}
        {activeTab === "notes" && (
          <>
            <div className="ai-list">
              {meetingNotes.length === 0 && (
                <p className="ai-empty">No notes yet. Add one below.</p>
              )}
              {meetingNotes.map((note) => (
                <div key={note.id} className="ai-note-item">
                  <span className="ai-note-author">
                    {note.author === "ai" ? "AI" : "You"}
                  </span>
                  <p>{note.text}</p>
                </div>
              ))}
            </div>
            <div className="ai-notes-input">
              <input
                className="ai-input"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note..."
                onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
              />
              <button className="ai-btn" onClick={handleAddNote} disabled={!noteText.trim()}>
                Add
              </button>
            </div>
          </>
        )}

        {/* Actions tab */}
        {activeTab === "actions" && (
          <>
            <div className="ai-list">
              {actionItems.length === 0 && (
                <p className="ai-empty">No action items yet.</p>
              )}
              {actionItems.map((item) => (
                <div
                  key={item.id}
                  className={`ai-action-item ${item.done ? "done" : ""}`}
                >
                  <button
                    className="ai-action-check"
                    onClick={() => handleToggleActionDone(item.id)}
                    title={item.done ? "Mark not done" : "Mark done"}
                  >
                    {item.done ? <CheckCircle2 size={16} /> : <span className="ai-check-empty" />}
                  </button>
                  <span className="ai-action-text">{item.text}</span>
                  {item.assignee && (
                    <small className="ai-action-assignee">→ {item.assignee}</small>
                  )}
                </div>
              ))}
            </div>
            <div className="ai-actions-input">
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  className="ai-input"
                  value={actionText}
                  onChange={(e) => setActionText(e.target.value)}
                  placeholder="Action item..."
                  onKeyDown={(e) => e.key === "Enter" && handleAddAction()}
                />
                <button className="ai-btn" onClick={handleAddAction} disabled={!actionText.trim()}>
                  Add
                </button>
              </div>
              <input
                className="ai-input"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="Assignee (optional)"
              />
            </div>
          </>
        )}

        {/* Summary tab */}
        {activeTab === "summary" && (
          <>
            <button
              className="ai-btn ai-btn-generate"
              onClick={handleGenerateSummary}
              disabled={isGenerating}
            >
              {isGenerating ? "Generating..." : "Generate Summary"}
            </button>
            {meetingSummary && (
              <div className="ai-summary">
                <div className="ai-summary-section">
                  <h4>Key Topics</h4>
                  <ul>
                    {meetingSummary.keyTopics.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
                <div className="ai-summary-section">
                  <h4>Notes ({meetingSummary.notes.length})</h4>
                  {meetingSummary.notes.map((n) => (
                    <p key={n.id}>{n.text}</p>
                  ))}
                </div>
                <div className="ai-summary-section">
                  <h4>Action Items ({meetingSummary.actionItems.length})</h4>
                  {meetingSummary.actionItems.map((a) => (
                    <p key={a.id}>
                      {a.done ? "✓" : "○"} {a.text}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
