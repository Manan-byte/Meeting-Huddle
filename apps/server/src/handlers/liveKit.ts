/**
 * @file LiveKit — issues LiveKit access tokens for the video room (SFU).
 *
 * The video engine is LiveKit (a Selective Forwarding Unit), replacing the
 * old P2P WebRTC mesh. Each participant requests a short-lived JWT token
 * scoped to a room name; the client uses it to join the LiveKit SFU server,
 * which forwards media selectively — so a meeting can scale to dozens of
 * participants per room (and millions of users across distributed servers).
 *
 * The server is the only party holding the API secret, so tokens are issued
 * here, never in the client.
 *
 * Connects to: Express app (route), .env (LIVEKIT_URL/API_KEY/API_SECRET).
 */

import type { Express, Request } from "express";
import { AccessToken } from "livekit-server-sdk";

const LIVEKIT_URL = process.env.LIVEKIT_URL || "";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";

/** Whether LiveKit is configured (credentials present). */
export function isLiveKitConfigured(): boolean {
  return Boolean(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
}

/**
 * Register the LiveKit token endpoint.
 * Called once from server/index.ts.
 *
 * @param app - Express app (registers GET /api/livekit/token).
 */
export function setupLiveKit(app: Express): void {
  app.get("/api/livekit/token", async (req: Request, res) => {
    const room = typeof req.query.room === "string" ? req.query.room : "";
    const name = typeof req.query.name === "string" ? req.query.name : "participant";
    if (!isLiveKitConfigured()) {
      res.status(503).json({ error: "LiveKit is not configured." });
      return;
    }
    if (!room) {
      res.status(400).json({ error: "room is required." });
      return;
    }

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: name || `user-${Math.random().toString(36).slice(2, 8)}`,
      ttl: "10m",
    });
    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
    res.json({ token: await at.toJwt(), url: LIVEKIT_URL });
  });
}
