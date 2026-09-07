/**
 * @file Google OAuth callback for the Huddle Worker.
 *
 * "Sign in with Google" — same shape as GitHub OAuth:
 *   1. Client redirects to Google's authorize endpoint (?code=).
 *   2. Google redirects here with ?code=.
 *   3. Server exchanges the code for an access token (Google token endpoint),
 *      fetches the profile (id, name, email), find-or-creates a local user
 *      (no password — ghost hash), issues a session token.
 *   4. Redirects to `CLIENT_URL/?auth_token=<token>`.
 *
 * Env: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (secrets), CLIENT_URL (var).
 */

import type { Env } from "./index";
import { DB } from "./database";
import { ensureSchema } from "./database";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function handleGoogleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const clientId = env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = env.GOOGLE_CLIENT_SECRET ?? "";
  const clientUrl = (env.CLIENT_URL ?? "").replace(/\/$/, "");
  const redirectUri = `${clientUrl}/auth/google/callback`;
  const fail = (msg: string) => Response.redirect(`${clientUrl}/?auth_error=${encodeURIComponent(msg)}`, 302);

  if (!code) return fail("Google login cancelled or missing code.");
  if (!clientId || !clientSecret) {
    return fail("Google OAuth is not configured on the server (GOOGLE_CLIENT_ID/SECRET).");
  }

  try {
    // 1) Exchange authorization code → access token.
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
    const accessToken = tokenData.access_token;
    if (!accessToken) return fail("Google did not return an access token.");

    // 2) Fetch the Google profile (id, name, email).
    const userRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = (await userRes.json()) as {
      id: string;
      name?: string | null;
      email?: string | null;
    };
    if (!profile?.id) return fail("Could not read Google profile.");

    const googleId = String(profile.id);
    const email = (profile.email ?? "").trim().toLowerCase();
    const name = profile.name?.trim() || email.split("@")[0] || "Google User";

    // 3) Find-or-create the local user by Google id (fall back to email).
    await ensureSchema(env.DB);
    const db = new DB(env.DB);
    let user = await db.findUserByGoogleId(googleId);
    if (!user && email) user = await db.findUserByEmail(email);
    if (!user) {
      const salt = randomHex(16);
      const ghostHash = randomHex(64);
      user = await db.createUser(name, email || `${googleId}@google.local`, ghostHash, salt, undefined, googleId);
    }

    // 4) Issue a session token and send it back to the client.
    const token = crypto.randomUUID();
    await db.createSession(token, user.id);
    return Response.redirect(`${clientUrl}/?auth_token=${token}`, 302);
  } catch (err) {
    console.error("[google-oauth] callback failed:", err);
    return fail("Google login failed. Please try again.");
  }
}
