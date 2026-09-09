/**
 * @file LiveKit token issuance for Cloudflare Workers.
 *
 * LiveKit access tokens are HS256 JWTs signed with the API secret:
 *   header:  { alg: "HS256", typ: "JWT" }
 *   payload: { iss: apiKey, nbf, exp, video: { roomJoin, room, canPublish, canSubscribe }, name }
 *
 * Workers have Web Crypto (no Node crypto), so we sign with crypto.subtle
 * directly instead of pulling livekit-server-sdk into the bundle.
 */

import type { Env } from "./index";

interface LiveKitClaims {
  iss: string;
  sub: string;
  nbf: number;
  exp: number;
  video: {
    roomJoin: boolean;
    room: string;
    canPublish: boolean;
    canSubscribe: boolean;
  };
  name?: string;
}

/** Whether LiveKit credentials are present. */
export function isLiveKitConfigured(env: Env): boolean {
  return Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
}

function base64Url(input: string | ArrayBuffer): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Sign a payload as an HS256 JWT using the LiveKit API secret. */
export async function issueLiveKitToken(env: Env, room: string, name: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: LiveKitClaims = {
    iss: env.LIVEKIT_API_KEY,
    // `sub` is the LiveKit participant identity. LiveKit rejects (HTTP 400)
    // tokens without it; livekit-server-sdk always sets it.
    // The client passes its socket/user id as `name` and keys remote streams
    // by that same id, so `sub` MUST mirror it — a random UUID here would
    // desync remote media lookup (no remote audio/video ever renders).
    sub: name,
    nbf: now - 10,
    exp: now + 10 * 60, // 10 minutes
    video: {
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
    },
    name,
  };

  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.LIVEKIT_API_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64Url(sig)}`;
}