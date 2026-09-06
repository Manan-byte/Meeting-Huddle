/**
 * @file PollModal — create, vote on, and view poll results.
 *
 * Three phases:
 *   1. Create: user enters question + 2-6 options, submits via CREATE_POLL
 *   2. Vote: participants click options to vote (single-choice, one vote per user)
 *   3. Results: poll creator closes, everyone sees vote counts and bars
 *
 * Listens for POLL_UPDATE (new poll created) and POLL_RESULT (vote/closure)
 * socket events to update the active poll state.
 *
 * Connects to: RoomPage (provides socket), meetingHandlers (server-side poll storage),
 *              shared constants (POLL_MAX_OPTIONS)
 */

import { useState, useCallback, useEffect } from "react";
import type { Poll } from "@meet-app/shared";
import { SOCKET_EVENTS, POLL_MAX_OPTIONS } from "@meet-app/shared";
import type { Socket } from "socket.io-client";

interface PollModalProps {
  /** Whether the modal is open. */
  isOpen: boolean;
  /** Callback to close the modal. */
  onClose: () => void;
  /** Socket.IO connection. */
  socket: Socket | null;
}

/**
 * Poll modal with create, vote, and result views.
 * Automatically switches between views based on poll state.
 */
export function PollModal({ isOpen, onClose, socket }: PollModalProps) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [activePoll, setActivePoll] = useState<Poll | null>(null);
  const [pollResult, setPollResult] = useState<Poll | null>(null);

  // Listen for poll events from the server
  useEffect(() => {
    if (!socket) return;

    /** Handle new poll created by any participant */
    const handlePollUpdate = (poll: Poll) => {
      setActivePoll(poll);
      setPollResult(null);
    };

    /** Handle poll result (vote update or poll closed) */
    const handlePollResult = (poll: Poll) => {
      setPollResult(poll);
      setActivePoll(null);
    };

    socket.on(SOCKET_EVENTS.POLL_UPDATE, handlePollUpdate);
    socket.on(SOCKET_EVENTS.POLL_RESULT, handlePollResult);

    return () => {
      socket.off(SOCKET_EVENTS.POLL_UPDATE, handlePollUpdate);
      socket.off(SOCKET_EVENTS.POLL_RESULT, handlePollResult);
    };
  }, [socket]);

  /** Add a new option field (up to POLL_MAX_OPTIONS). */
  const addOption = useCallback(() => {
    if (options.length < POLL_MAX_OPTIONS) {
      setOptions((prev) => [...prev, ""]);
    }
  }, [options.length]);

  /** Update the text of a specific option field. */
  const updateOption = useCallback((index: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  }, []);

  /** Remove an option field (minimum 2 options required). */
  const removeOption = useCallback((index: number) => {
    if (options.length > 2) {
      setOptions((prev) => prev.filter((_, i) => i !== index));
    }
  }, [options.length]);

  /** Create and submit a new poll via socket. */
  const handleCreate = useCallback(() => {
    if (!question.trim() || !socket) return;
    const validOptions = options.filter((o) => o.trim());
    if (validOptions.length < 2) return;

    socket.emit(SOCKET_EVENTS.CREATE_POLL, {
      question: question.trim(),
      options: validOptions.map((o) => o.trim()),
    });
    setQuestion("");
    setOptions(["", ""]);
  }, [question, options, socket]);

  /** Cast a vote on a poll option via socket. */
  const handleVote = useCallback(
    (optionId: string) => {
      if (!activePoll || !socket) return;
      socket.emit(SOCKET_EVENTS.VOTE_POLL, {
        pollId: activePoll.id,
        optionId,
      });
    },
    [activePoll, socket],
  );

  /** Close the poll (creator only) via socket. */
  const handleClosePoll = useCallback(() => {
    if (!activePoll || !socket) return;
    socket.emit(SOCKET_EVENTS.CLOSE_POLL, { pollId: activePoll.id });
  }, [activePoll, socket]);

  if (!isOpen) return null;

  // Calculate the maximum vote count for bar width scaling
  const maxVotes = pollResult
    ? Math.max(...pollResult.options.map((o) => o.votes.length), 1)
    : 1;

  return (
    <div className="poll-modal-overlay">
      <div className="poll-modal">
        <div className="poll-modal-header">
          <h3>Polls</h3>
          <button
            className="poll-modal-close"
            onClick={onClose}
            title="Close"
            aria-label="Close polls"
          >
            ✕
          </button>
        </div>
        {/* Create poll form (shown when no active poll or result) */}
        {!activePoll && !pollResult && (
          <div className="poll-create">
            <div className="poll-field">
              <label className="poll-label" htmlFor="poll-question">
                Question
              </label>
              <input
                id="poll-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask something..."
                className="poll-input poll-question-input"
              />
            </div>
            <div className="poll-field">
              <span className="poll-label">Options</span>
              {options.map((opt, i) => (
                <div key={i} className="poll-option-row">
                  <input
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className="poll-input poll-option-input"
                  />
                  {options.length > 2 && (
                    <button
                      className="poll-option-remove"
                      onClick={() => removeOption(i)}
                      title="Remove option"
                      aria-label={`Remove option ${i + 1}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {options.length < POLL_MAX_OPTIONS && (
                <button className="poll-add-option" onClick={addOption}>
                  + Add option
                </button>
              )}
            </div>
            <button
              className="poll-create-btn"
              onClick={handleCreate}
              disabled={!question.trim() || options.filter((o) => o.trim()).length < 2}
            >
              Create Poll
            </button>
          </div>
        )}

        {/* Active poll voting view */}
        {activePoll && (
          <div className="poll-vote">
            <h4>{activePoll.question}</h4>
            <div className="poll-options">
              {activePoll.options.map((opt) => (
                <button
                  key={opt.id}
                  className="poll-vote-option"
                  onClick={() => handleVote(opt.id)}
                >
                  <span className="poll-vote-text">{opt.text}</span>
                  <span className="poll-vote-count">{opt.votes.length}</span>
                </button>
              ))}
            </div>
            <button className="poll-close-btn" onClick={handleClosePoll}>
              Close Poll
            </button>
          </div>
        )}

        {/* Poll results view with vote bars */}
        {pollResult && (
          <div className="poll-results">
            <h4>{pollResult.question}</h4>
            <div className="poll-results-list">
              {pollResult.options.map((opt) => (
                <div key={opt.id} className="poll-result-item">
                  <div className="poll-result-label">
                    <span className="poll-result-text">{opt.text}</span>
                    <span className="poll-result-count">
                      {opt.votes.length} vote{opt.votes.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="poll-result-bar-bg">
                    <div
                      className="poll-result-bar"
                      style={{
                        width: `${(opt.votes.length / maxVotes) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <button className="poll-done-btn" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
