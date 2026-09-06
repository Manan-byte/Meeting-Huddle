/**
 * @file Server entry point for the Huddle video conferencing backend.
 *
 * Sets up an Express HTTP server with Socket.IO for real-time communication.
 * Initializes the RoomManager (in-memory state) and wires up all socket
 * event handlers organized by feature domain:
 *
 *   - roomHandlers    → room create/join/leave, recording, meeting title
 *   - signalingHandler → WebRTC signaling relay (offers, answers, ICE)
 *   - chatHandler     → in-room text chat
 *   - featureHandlers → hand raise, layout, settings, invite links
 *   - meetingHandlers → reactions, polls, captions, waiting room, AI companion, end meeting
 *
 * Flow: HTTP server → Socket.IO → RoomManager (state) → broadcast to room participants.
 */

// Load environment variables from .env into process.env
import "dotenv/config";

// Express for the HTTP server (serves as Socket.IO host)
import express from "express";

// Node.js HTTP server wrapping Express (required by Socket.IO)
import { createServer } from "http";

// Node.js path/URL/FS helpers — used to serve the built web client (single-origin production)
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Socket.IO server — handles all real-time WebSocket communication
import { Server } from "socket.io";

// CORS middleware — allows the web client (Vite dev server on :5173) to connect
import cors from "cors";

// In-memory room and participant state manager
import { RoomManager } from "./services/RoomManager.js";

// Socket event handlers organized by feature domain
import { setupRoomHandlers } from "./handlers/roomHandlers.js";       // → room lifecycle
import { setupSignalingHandler } from "./handlers/signalingHandler.js"; // → WebRTC signaling
import { setupChatHandler } from "./handlers/chatHandler.js";         // → text chat
import { setupFeatureHandlers } from "./handlers/featureHandlers.js"; // → hand raise, layout, settings, invite
import { setupMeetingHandlers } from "./handlers/meetingHandlers.js"; // → reactions, polls, captions, AI, waiting room
import { setupAuthHandlers } from "./handlers/authHandler.js";        // → register/login/logout/me
import { setupDashboardHandlers } from "./handlers/dashboardHandler.js"; // → history/schedule
import { setupGithubOAuth } from "./handlers/githubOAuth.js";           // → GitHub OAuth login
import { setupLiveKit } from "./handlers/liveKit.js";                 // → LiveKit SFU video tokens
import { Database } from "./services/Database.js";                    // → persisted users/history/schedule
import { D1Client } from "./services/D1Client.js";                    // → Cloudflare D1 storage

// Server port (defaults to 3001; set via PORT env var)
const PORT = parseInt(process.env.PORT || "3001", 10);

// Allowed CORS origin for the web client (defaults to Vite dev server)
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

// Create Express app and enable CORS for HTTP requests
const app = express();
app.use(cors({ origin: CORS_ORIGIN }));

// Health endpoint for PaaS (Railway/Render) uptime checks.
app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// ── Production: serve the built web client (single-origin) ──────────────
// The Socket.IO client connects to the SAME origin it was loaded from
// (see SocketContext: io() with no URL), so in production the web static
// files and the realtime server must share one port. When apps/web/dist is
// present (built via `pnpm build`), serve it here with an SPA fallback.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This file lives in apps/server/src (dev) or apps/server/dist (build); web dist is apps/web/dist.
const webDist = path.resolve(__dirname, "../../web/dist");

if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));

  // SPA fallback — serve index.html for any GET that isn't /socket.io or an
  // API/auth route so client-side routes (?join=CODE etc.) resolve on refresh.
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/socket.io") || req.path.startsWith("/auth") || req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(webDist, "index.html"));
  });
}

// Wrap Express in a Node HTTP server (Socket.IO needs the raw server)
const httpServer = createServer(app);

// Initialize Socket.IO with CORS matching the Express server
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
  },
});

// Shared in-memory state manager for all rooms, participants, and chat history
const roomManager = new RoomManager();

// Durable storage for accounts, meeting history, and schedules (Cloudflare D1).
const database = new Database(new D1Client());

// Wire up all socket event handlers — each registers its own io.on("connection") listener
setupRoomHandlers(io, roomManager);       // → CREATE_ROOM, JOIN_ROOM, LEAVE_ROOM, etc.
setupSignalingHandler(io, roomManager);   // → SIGNAL (WebRTC relay)
setupChatHandler(io, roomManager);        // → CHAT_MESSAGE
setupFeatureHandlers(io, roomManager);    // → HAND_RAISE, SET_LAYOUT, UPDATE_SETTINGS, etc.
setupMeetingHandlers(io, roomManager, database);    // → reactions, polls, captions, AI companion, waiting room, end meeting
setupAuthHandlers(io, database);          // → register, login, logout, me
setupDashboardHandlers(io, database);     // → history, schedule
setupGithubOAuth(app, database);          // → GET /auth/github/callback (OAuth login)
setupLiveKit(app);                        // → GET /api/livekit/token (SFU video)

// Start listening for HTTP and WebSocket connections
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
