/**
 * @file GitHub OAuth — server-side login via GitHub.
 *
 * Flow (full-page redirect):
 *   1. Client redirects the browser to GitHub's authorize endpoint.
 *   2. GitHub redirects back to this callback with a `?code=`.
 *   3. The server exchanges the code for an access token (GitHub API),
 *      fetches the user's profile + primary email, find-or-creates a local
 *      user, and issues a session token.
 *   4. The server redirects to `${CLIENT_URL}/?auth_token=<token>` — the web
 *      client picks it up, stores it, and restores the session (same as email login).
 *
 * No manual sign-up needed for end users. Setup is one-time (developer):
 *   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, CLIENT_URL in apps/server/.env.
 *
 * Connects to: Express app (route), Database (users/sessions), .env.
 */

import type { Express } from "express";
import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { Database } from "../services/Database.js";

const GITHUB_ACCESS_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_URL = "https://api.github.com";

/**
 * Register the GitHub OAuth callback route.
 * Called once from server/index.ts.
 *
 * @param app - Express app (registers GET /auth/github/callback).
 * @param database - User + session storage.
 */
export function setupGithubOAuth(app: Express, database: Database): void {
  app.get("/auth/github/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const clientId = process.env.GITHUB_CLIENT_ID || "";
    const clientSecret = process.env.GITHUB_CLIENT_SECRET || "";
    const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");

    const fail = (msg: string) => res.redirect(`${clientUrl}/?auth_error=${encodeURIComponent(msg)}`);

    if (!code) return fail("GitHub login cancelled or missing code.");
    if (!clientId || !clientSecret) {
      return fail("GitHub OAuth is not configured on the server (GITHUB_CLIENT_ID/SECRET).");
    }

    try {
      // 1) Exchange code → access token.
      const tokenRes = await fetch(GITHUB_ACCESS_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      });
      const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
      const accessToken = tokenData.access_token;
      if (!accessToken) {
        return fail("GitHub did not return an access token.");
      }

      const authHeaders = { Authorization: `token ${accessToken}`, "User-Agent": "huddle" };

      // 2) Fetch the user profile.
      const userRes = await fetch(`${GITHUB_API_URL}/user`, { headers: authHeaders });
      const profile = (await userRes.json()) as {
        id: number;
        name: string | null;
        login: string;
        email: string | null;
      };
      if (!profile?.id) return fail("Could not read GitHub profile.");

      // 3) Fetch the primary email (scoped user:email) — profile.email may be null.
      let email = profile.email ?? "";
      if (!email) {
        const emailRes = await fetch(`${GITHUB_API_URL}/user/emails`, { headers: authHeaders });
        const emails = (await emailRes.json()) as { email: string; primary: boolean }[];
        email = emails.find((e) => e.primary)?.email ?? emails[0]?.email ?? "";
      }

      const githubId = String(profile.id);
      const name = profile.name || profile.login || "GitHub User";

      // 4) Find-or-create the local user by GitHub id (fall back to email).
      let user = await database.findUserByGithubId(githubId);
      if (!user && email) user = await database.findUserByEmail(email);
      if (!user) {
        // OAuth users have no password — store an unusable hash.
        const salt = crypto.randomBytes(16).toString("hex");
        const ghostHash = crypto.scryptSync(crypto.randomBytes(32), salt, 64).toString("hex");
        user = await database.createUser(name, email || `${githubId}@github.local`, ghostHash, salt, githubId);
      }

      // 5) Issue a session token (same as email login) and send it back.
      const token = uuidv4();
      await database.createSession(token, user.id);
      res.redirect(`${clientUrl}/?auth_token=${token}`);
    } catch (err) {
      console.error("[github-oauth] callback failed:", err);
      fail("GitHub login failed. Please try again.");
    }
  });
}
