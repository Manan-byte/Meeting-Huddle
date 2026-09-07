/**
 * @file GitHub OAuth callback for the Huddle Worker.
 *
 * Flow: GitHub redirects here with ?code= → we exchange it for an access
 * token, fetch the profile + primary email, find-or-create a local user
 * (no password — ghost hash), issue a session token, redirect to
 * `CLIENT_URL/?auth_token=<token>` where the web client picks it up.
 */

import type { Env } from "./index";
import { DB, toPublicUser } from "./database";
import { ensureSchema } from "./database";

const GITHUB_ACCESS_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_URL = "https://api.github.com";

function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function handleGithubCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const clientId = env.GITHUB_CLIENT_ID ?? "";
  const clientSecret = env.GITHUB_CLIENT_SECRET ?? "";
  const clientUrl = (env.CLIENT_URL ?? "").replace(/\/$/, "");
  const redirect = (msg: string) => Response.redirect(`${clientUrl}/?auth_error=${encodeURIComponent(msg)}`, 302);

  if (!code) return redirect("GitHub login cancelled or missing code.");
  if (!clientId || !clientSecret) {
    return redirect("GitHub OAuth is not configured on the server (GITHUB_CLIENT_ID/SECRET).");
  }

  try {
    const tokenRes = await fetch(GITHUB_ACCESS_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    const accessToken = tokenData.access_token;
    if (!accessToken) return redirect("GitHub did not return an access token.");

    const authHeaders = { Authorization: `token ${accessToken}`, "User-Agent": "huddle" };

    const userRes = await fetch(`${GITHUB_API_URL}/user`, { headers: authHeaders });
    const profile = (await userRes.json()) as { id: number; name: string | null; login: string; email: string | null };
    if (!profile?.id) return redirect("Could not read GitHub profile.");

    let email = profile.email ?? "";
    if (!email) {
      const emailRes = await fetch(`${GITHUB_API_URL}/user/emails`, { headers: authHeaders });
      const emails = (await emailRes.json()) as { email: string; primary: boolean }[];
      email = emails.find((e) => e.primary)?.email ?? emails[0]?.email ?? "";
    }

    const githubId = String(profile.id);
    const name = profile.name || profile.login || "GitHub User";

    await ensureSchema(env.DB);
    const db = new DB(env.DB);
    let user = await db.findUserByGithubId(githubId);
    if (!user && email) user = await db.findUserByEmail(email);
    if (!user) {
      const salt = randomHex(16);
      const ghostHash = randomHex(64);
      user = await db.createUser(name, email || `${githubId}@github.local`, ghostHash, salt, githubId);
    }

    const token = crypto.randomUUID();
    await db.createSession(token, user.id);
    return Response.redirect(`${clientUrl}/?auth_token=${token}`, 302);
  } catch (err) {
    console.error("[github-oauth] callback failed:", err);
    return redirect("GitHub login failed. Please try again.");
  }
}
