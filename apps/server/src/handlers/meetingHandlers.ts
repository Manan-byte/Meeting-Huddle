/**
 * @file Meeting feature handlers — reactions, polls, captions, waiting room, AI companion, end meeting.
 *
 * The largest handler file, covering all interactive meeting features:
 *   - Reactions: emoji reactions broadcast to all participants
 *   - Polls: create, vote, close polls (in-memory per room)
 *   - Live Captions: relay speech-to-text segments between participants
 *   - Waiting Room: host admits/rejects users from the waiting room
 *   - End Meeting: host ends the meeting for all participants
 *   - AI Companion: generate summary, add notes, add action items
 *
 * All handlers validate room membership and permissions before processing.
 * Polls are stored in-memory per room (roomPolls Map) and not persisted.
 *
 * Connects to: ReactionBar, ReactionOverlay, PollModal, LiveCaptions,
 *              WaitingRoom, AICompanion, MeetingTimer, RoomPage (client)
 */

import type {
  Server,
  Socket,
} from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { SOCKET_EVENTS } from "@meet-app/shared";
import type {
  RoomManager,
} from "../services/RoomManager.js";
import type {
  Database,
} from "../services/Database.js";
import type {
  Reaction,
  Poll,
  PollOption,
  MeetingNote,
  ActionItem,
  MeetingSummary,
  ChatMessage,
} from "@meet-app/shared";

/**
 * Register all meeting feature handlers.
 * Called once at startup from server/index.ts.
 *
 * @param io - Socket.IO server instance
 * @param roomManager - Used for room lookups, chat history, and waiting room management
 */
export function setupMeetingHandlers(
  io: Server,
  roomManager: RoomManager,
  database: Database
): void {
  // In-memory polls per room (keyed by room code).
  // Not persisted — polls are lost on server restart.
  const roomPolls = new Map<string, Poll[]>();

  io.on("connection", (socket: Socket) => {

    // ════════════════════════════════════════════════════════════════════
    // REACTIONS
    // ════════════════════════════════════════════════════════════════════

    // ── SEND_REACTION ────────────────────────────────────────────────────
    // Triggered when: user clicks an emoji in ReactionBar
    // Does: creates a Reaction object, broadcasts to all room participants
    // → ReactionOverlay (floating animation), ReactionBar (shows count)
    socket.on(
      SOCKET_EVENTS.SEND_REACTION,
      (data: { type: string }) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room) {
          socket.emit("error", { message: "Not in a room" });
          return;
        }
        const participant = room.participants.find(
          (p) => p.id === socket.id
        );
        if (!participant) return;

        const reaction: Reaction = {
          id: uuidv4(),
          userId: socket.id,
          userName: participant.name,
          type: data.type as Reaction["type"],
          timestamp: Date.now(),
        };

        io.to(room.code).emit(SOCKET_EVENTS.REACTION_BROADCAST, reaction);
      }
    );

    // ════════════════════════════════════════════════════════════════════
    // POLLS
    // ════════════════════════════════════════════════════════════════════

    // ── CREATE_POLL ──────────────────────────────────────────────────────
    // Triggered when: user submits a poll in PollModal
    // Does: creates a Poll with options, stores in roomPolls, broadcasts POLL_UPDATE
    // → PollModal (displays the active poll for voting)
    socket.on(
      SOCKET_EVENTS.CREATE_POLL,
      (data: { question: string; options: string[] }) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room) {
          socket.emit("error", { message: "Not in a room" });
          return;
        }

        const pollOptions: PollOption[] = data.options.map((text) => ({
          id: uuidv4(),
          text,
          votes: [],
        }));

        const poll: Poll = {
          id: uuidv4(),
          question: data.question,
          options: pollOptions,
          createdBy: socket.id,
          isActive: true,
          createdAt: Date.now(),
        };

        if (!roomPolls.has(room.code)) {
          roomPolls.set(room.code, []);
        }
        roomPolls.get(room.code)!.push(poll);

        io.to(room.code).emit(SOCKET_EVENTS.POLL_UPDATE, poll);

        // Notify everyone via chat so the poll is visible even when the
        // poll panel is closed.
        const notif = roomManager.sendMessage(
          room.id,
          "system",
          "System",
          `📊 Poll: ${poll.question} — open it from the More menu to vote.`
        );
        io.to(room.code).emit(SOCKET_EVENTS.CHAT_MESSAGE, notif);
      }
    );

    // ── VOTE_POLL ────────────────────────────────────────────────────────
    // Triggered when: user clicks a poll option in PollModal
    // Does: removes previous vote (single-choice), adds new vote, broadcasts POLL_RESULT
    // → PollModal (shows updated vote counts)
    socket.on(
      SOCKET_EVENTS.VOTE_POLL,
      (data: { pollId: string; optionId: string }) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room) {
          socket.emit("error", { message: "Not in a room" });
          return;
        }

        const polls = roomPolls.get(room.code);
        if (!polls) return;

        const poll = polls.find((p) => p.id === data.pollId);
        if (!poll || !poll.isActive) return;

        // Remove vote from other options in same poll (single-choice enforcement)
        for (const opt of poll.options) {
          opt.votes = opt.votes.filter((v) => v !== socket.id);
        }

        // Add vote to selected option
        const option = poll.options.find(
          (o) => o.id === data.optionId
        );
        if (option) {
          option.votes.push(socket.id);
        }

        io.to(room.code).emit(SOCKET_EVENTS.POLL_RESULT, poll);
      }
    );

    // ── CLOSE_POLL ───────────────────────────────────────────────────────
    // Triggered when: poll creator clicks "Close" in PollModal
    // Does: sets isActive=false, broadcasts final POLL_RESULT
    // → PollModal (shows final results)
    socket.on(
      SOCKET_EVENTS.CLOSE_POLL,
      (data: { pollId: string }) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room) {
          socket.emit("error", { message: "Not in a room" });
          return;
        }

        const polls = roomPolls.get(room.code);
        if (!polls) return;

        const poll = polls.find((p) => p.id === data.pollId);
        if (!poll || poll.createdBy !== socket.id) {
          socket.emit("error", {
            message: "Only poll creator can close",
          });
          return;
        }

        poll.isActive = false;
        io.to(room.code).emit(SOCKET_EVENTS.POLL_RESULT, poll);
      }
    );

    // ════════════════════════════════════════════════════════════════════
    // LIVE CAPTIONS
    // ════════════════════════════════════════════════════════════════════

    // ── CAPTION_SEGMENT ──────────────────────────────────────────────────
    // Triggered when: Web Speech API produces a transcript on a client
    // Does: wraps the text in a CaptionSegment, broadcasts finals to room,
    //        returns interim (non-final) results only to the sender
    // → LiveCaptions (displays subtitle overlay)
    socket.on(
      SOCKET_EVENTS.CAPTION_SEGMENT,
      (data: { text: string; isFinal: boolean }) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room) return;

        const participant = room.participants.find(
          (p) => p.id === socket.id
        );
        if (!participant) return;

        const segment = {
          id: uuidv4(),
          userId: socket.id,
          userName: participant.name,
          text: data.text,
          timestamp: Date.now(),
          isFinal: data.isFinal,
        };

        if (data.isFinal) {
          // Final transcripts go to all room participants
          io.to(room.code).emit(SOCKET_EVENTS.CAPTION_SEGMENT, segment);
        } else {
          // Interim (draft) transcripts only to the speaker
          socket.emit(SOCKET_EVENTS.CAPTION_SEGMENT, segment);
        }
      }
    );

    // ── CAPTION_TOGGLE ───────────────────────────────────────────────────
    // Triggered when: user enables captions in LiveCaptions
    // Does: notifies all room participants that captions are enabled
    // → LiveCaptions (starts/stop speech recognition on each client)
    socket.on(SOCKET_EVENTS.CAPTION_TOGGLE, () => {
      const room = roomManager.getRoomBySocketId(socket.id);
      if (!room) return;

      io.to(room.code).emit(SOCKET_EVENTS.CAPTIONS_ENABLED, {
        enabled: true,
      });
    });

    // ════════════════════════════════════════════════════════════════════
    // WAITING ROOM (Admit / Reject)
    // ════════════════════════════════════════════════════════════════════

    // ── ADMIT_USER ───────────────────────────────────────────────────────
    // Triggered when: host clicks "Admit" in WaitingRoom component
    // Does: moves user from waiting room to participants, notifies admitted user
    //        and broadcasts updated participant list to room
    // → WaitingRoom (removes from list), RoomPage (updates participants)
    socket.on(
      SOCKET_EVENTS.ADMIT_USER,
      (data: { socketId: string }) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room) {
          socket.emit("error", { message: "Not in a room" });
          return;
        }
        if (room.hostId !== socket.id) {
          socket.emit("error", { message: "Only host can admit users" });
          return;
        }

        try {
          const admittedUser =
            roomManager.admitFromWaitingRoom(room.code, data.socketId);
          roomManager.getRoomBySocketId(data.socketId); // ensure mapping is updated

          // Notify the admitted user that they've joined the room
          io.to(data.socketId).emit(SOCKET_EVENTS.ROOM_JOINED, room);

          // Notify existing participants of the new joiner
          socket
            .to(room.code)
            .emit(SOCKET_EVENTS.PARTICIPANT_JOINED, {
              user: admittedUser,
              participants: room.participants,
            });

          // Sync full room state to everyone
          io.to(room.code).emit(SOCKET_EVENTS.ROOM_STATE, {
            room,
            participants: room.participants,
          });

          // Refresh the host's waiting list (the admitted user is removed)
          io.to(room.code).emit(
            SOCKET_EVENTS.WAITING_ROOM_UPDATE,
            roomManager.getWaitingUsers(room.code)
          );
        } catch (err) {
          socket.emit("error", { message: (err as Error).message });
        }
      }
    );

    // ── REJECT_USER ──────────────────────────────────────────────────────
    // Triggered when: host clicks "Reject" in WaitingRoom component
    // Does: removes user from waiting room, notifies rejected user with error,
    //        broadcasts updated waiting room list
    // → WaitingRoom (removes from list)
    socket.on(
      SOCKET_EVENTS.REJECT_USER,
      (data: { socketId: string }) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room) {
          socket.emit("error", { message: "Not in a room" });
          return;
        }
        if (room.hostId !== socket.id) {
          socket.emit("error", { message: "Only host can reject users" });
          return;
        }

        try {
          roomManager.removeFromWaitingRoom(room.code, data.socketId);

          // Notify the rejected user with a descriptive error
          io.to(data.socketId).emit("error", {
            message: "You have been rejected from the meeting",
          });

          // Update the waiting room list for all participants
          io.to(room.code).emit(
            SOCKET_EVENTS.WAITING_ROOM_UPDATE,
            roomManager.getWaitingUsers(room.code)
          );
        } catch (err) {
          socket.emit("error", { message: (err as Error).message });
        }
      }
    );

    // ════════════════════════════════════════════════════════════════════
    // END MEETING
    // ════════════════════════════════════════════════════════════════════

    // ── END_MEETING ──────────────────────────────────────────────────────
    // Triggered when: host clicks "End Meeting" button
    // Does: emits MEETING_ENDED to all participants (kicks them out),
    //        cleans up poll data for the room
    // → RoomPage (shows "Meeting Has Ended" screen)
    socket.on(SOCKET_EVENTS.END_MEETING, async () => {
      const room = roomManager.getRoomBySocketId(socket.id);
      if (!room) {
        socket.emit("error", { message: "Not in a room" });
        return;
      }
      if (room.hostId !== socket.id) {
        socket.emit("error", { message: "Only host can end meeting" });
        return;
      }

      // Notify the host
      io.to(room.code).emit(SOCKET_EVENTS.MEETING_ENDED, {
        roomId: room.id,
        code: room.code,
      });

      // Kick all participants by sending MEETING_ENDED to each individually
      for (const participant of room.participants) {
        io.to(participant.id).emit(SOCKET_EVENTS.MEETING_ENDED, {
          roomId: room.id,
          code: room.code,
        });
      }

      // Record the completed meeting in the durable history
      await database.recordMeeting({
        code: room.code,
        title: room.meetingTitle || "Untitled Meeting",
        hostName: room.participants.find((p) => p.id === room.hostId)?.name ?? "Host",
        participants: room.participants.length,
        startedAt: room.startedAt,
      });

      // Clean up in-memory poll data
      roomPolls.delete(room.code);
    });

    // ════════════════════════════════════════════════════════════════════
    // AI COMPANION
    // ════════════════════════════════════════════════════════════════════

    // ── AI_GENERATE_SUMMARY ──────────────────────────────────────────────
    // Triggered when: user clicks "Generate Summary" in AICompanion
    // Does: fetches chat history, extracts action items (TODO/ACTION keywords),
    //        computes word frequency for key topics, creates a MeetingSummary,
    //        emits AI_SUMMARY_READY to the requesting client
    // → AICompanion (displays the generated summary)
    socket.on(SOCKET_EVENTS.AI_GENERATE_SUMMARY, () => {
      const room = roomManager.getRoomBySocketId(socket.id);
      if (!room) {
        socket.emit("error", { message: "Not in a room" });
        return;
      }

      const messages: ChatMessage[] = roomManager.getChatHistory(room.id);

      // Simple simulated AI summary using keyword extraction
      const actionItems: ActionItem[] = [];
      const topicCounts: Record<string, number> = {};
      const notes: MeetingNote[] = [];

      for (const msg of messages) {
        const text = msg.text;
        const lowerText = text.toLowerCase();

        // Extract action items from messages containing task keywords
        if (
          lowerText.includes("todo:") ||
          lowerText.includes("action:") ||
          lowerText.includes("will do") ||
          lowerText.includes("need to")
        ) {
          actionItems.push({
            id: uuidv4(),
            text,
            assignee: null,
            done: false,
          });
        }

        // Simple word frequency analysis for key topic detection
        const words = text.split(/\s+/);
        for (const word of words) {
          const cleaned = word.toLowerCase().replace(/[^a-z]/g, "");
          if (cleaned.length > 3) {
            topicCounts[cleaned] = (topicCounts[cleaned] || 0) + 1;
          }
        }
      }

      // Get top 5 topics sorted by frequency
      const keyTopics = Object.entries(topicCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([topic]) => topic);

      // Add a meta-note about the summary
      notes.push({
        id: uuidv4(),
        text: `Summary generated from ${messages.length} messages`,
        timestamp: Date.now(),
        author: "ai",
      });

      const summary: MeetingSummary = {
        notes,
        actionItems,
        keyTopics,
        generatedAt: Date.now(),
      };

      // Send summary only to the requesting client (not broadcast)
      socket.emit(SOCKET_EVENTS.AI_SUMMARY_READY, summary);
    });

    // ── AI_ADD_NOTE ──────────────────────────────────────────────────────
    // Triggered when: user submits a note in AICompanion "Notes" tab
    // Does: creates a MeetingNote, broadcasts to all room participants
    // → AICompanion (adds note to the notes list)
    socket.on(
      SOCKET_EVENTS.AI_ADD_NOTE,
      (data: { text: string }) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room) {
          socket.emit("error", { message: "Not in a room" });
          return;
        }

        const note: MeetingNote = {
          id: uuidv4(),
          text: data.text,
          timestamp: Date.now(),
          author: socket.id,
        };

        io.to(room.code).emit(SOCKET_EVENTS.AI_NOTE_ADDED, note);
      }
    );

    // ── AI_ACTION_ITEM ───────────────────────────────────────────────────
    // Triggered when: user submits an action item in AICompanion "Actions" tab
    // Does: creates an ActionItem, broadcasts to all room participants
    // → AICompanion (adds item to the action items list)
    socket.on(
      SOCKET_EVENTS.AI_ACTION_ITEM,
      (data: { text: string; assignee: string }) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room) {
          socket.emit("error", { message: "Not in a room" });
          return;
        }

        const actionItem: ActionItem = {
          id: uuidv4(),
          text: data.text,
          assignee: data.assignee ?? null,
          done: false,
        };

        io.to(room.code).emit(
          SOCKET_EVENTS.AI_ACTION_ITEM_UPDATED,
          actionItem
        );
      }
    );
  });
}
