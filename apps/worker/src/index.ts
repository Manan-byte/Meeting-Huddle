/**
 * @file Huddle Worker entry — Cloudflare Worker + Durable Object backend.
 *
 * Serves:
 *   - Static frontend build (../web/dist via ASSETS binding)
 *   - GET /health
 *   - GET /api/livekit/token?room=&name=
 *   - GET /auth/github/callback
 *   - GET /ws → WebSocket upgrade into the HuddleDO Durable Object
 *
 * All realtime state (rooms, participants, chat, polls, auth, dashboard)
 * lives in a single HuddleDO, which owns every WebSocket connection.
 * Replaces the old Node/Express/Socket.IO server.
 */

import { HuddleDO } from "./huddleDO";
import { isLiveKitConfigured, issueLiveKitToken } from "./livekit";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  HUDDLE_DO: DurableObjectNamespace;
  LIVEKIT_URL: string;
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
  CLIENT_URL: string;
}

export { HuddleDO };

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
};

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (url.pathname === "/health") {
      return json({ ok: true });
    }
    if (url.pathname === "/api/livekit/token") {
      if (!isLiveKitConfigured(env)) {
        return json({ error: "LiveKit is not configured." }, 503);
      }
      const room = url.searchParams.get("room") ?? "";
      const name = url.searchParams.get("name") ?? "participant";
      if (!room) return json({ error: "room is required." }, 400);
      const token = await issueLiveKitToken(env, room, name);
      return json({ token, url: env.LIVEKIT_URL });
    }

    // WebSocket → the single global Durable Object.
    if (url.pathname === "/ws") {
      const stub = env.HUDDLE_DO.get(env.HUDDLE_DO.idFromName("global"));
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} as ExportedHandler<Env>;