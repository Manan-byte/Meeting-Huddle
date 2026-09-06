/**
 * @file D1Client — Cloudflare D1 (serverless SQLite) over the HTTP API.
 *
 * Wraps the Cloudflare D1 query endpoint:
 *   POST /client/v4/accounts/{accountId}/d1/database/{databaseId}/query
 * with `Authorization: Bearer <token>`. `fetch` is injectable so tests can
 * stub it without network.
 *
 * D1 returns one result set per statement; batch (multi-statement) queries
 * return an array of result sets.
 *
 * Connects to: Database (replaces the old db.json persistence), .env
 *              (CF_ACCOUNT_ID, D1_DATABASE_ID, CF_API_TOKEN).
 */

export interface D1Config {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

/** A row returned by D1 (object of column name → value). */
export type D1Row = Record<string, unknown>;

/** One statement's result from the D1 API. */
export interface D1ResultSet {
  results: D1Row[];
  success: boolean;
  meta?: { changes?: number; last_row_id?: number };
}

export interface D1Response {
  success: boolean;
  errors?: { message: string }[];
  result?: D1ResultSet[];
}

/**
 * Minimal Cloudflare D1 HTTP client.
 * Reads credentials from env; `fetchImpl` is injectable for tests.
 */
export class D1Client {
  private readonly config: D1Config | null;
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = globalThis.fetch) {
    this.fetchImpl = fetchImpl;
    const accountId = process.env.CF_ACCOUNT_ID || "";
    const databaseId = process.env.D1_DATABASE_ID || "";
    const apiToken = process.env.CF_API_TOKEN || "";
    this.config = accountId && databaseId && apiToken ? { accountId, databaseId, apiToken } : null;
  }

  /** Whether D1 is configured (credentials present). */
  get configured(): boolean {
    return this.config !== null;
  }

  /**
   * Execute one SQL statement with bound params.
   * @returns rows, or undefined when D1 isn't configured.
   */
  async query(sql: string, params: unknown[] = []): Promise<D1Row[] | undefined> {
    const set = await this.execute([{ sql, params }]);
    return set?.[0]?.results;
  }

  /**
   * Execute one write statement and return its meta (changes / last_row_id),
   * or undefined when D1 isn't configured.
   */
  async queryMeta(sql: string, params: unknown[] = []): Promise<{ changes?: number; last_row_id?: number } | undefined> {
    const set = await this.execute([{ sql, params }]);
    return set?.[0]?.meta;
  }

  /**
   * Execute multiple statements as a batch (e.g. schema init).
   * @returns all result sets, or undefined when D1 isn't configured.
   */
  async batch(statements: { sql: string; params?: unknown[] }[]): Promise<D1ResultSet[] | undefined> {
    return this.execute(statements);
  }

  private async execute(statements: { sql: string; params?: unknown[] }[]): Promise<D1ResultSet[] | undefined> {
    if (!this.config) {
      console.warn("[d1] Cloudflare D1 is not configured (CF_ACCOUNT_ID / D1_DATABASE_ID / CF_API_TOKEN).");
      return undefined;
    }
    const { accountId, databaseId, apiToken } = this.config;
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;

    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql: statements.map((s) => s.sql).join(";"), params: statements[0]?.params ?? [] }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`D1 request failed (${res.status}): ${text}`);
    }
    const body = (await res.json()) as D1Response;
    if (!body.success) {
      const msg = body.errors?.map((e) => e.message).join("; ") ?? "unknown error";
      throw new Error(`D1 error: ${msg}`);
    }
    return body.result;
  }
}
