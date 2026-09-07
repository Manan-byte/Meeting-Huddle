/**
 * @file Password hashing for the Huddle Worker.
 *
 * Cloudflare Workers do not expose Node's crypto.scrypt, so we hash with
 * PBKDF2 (Web Crypto) using 100k iterations. Format: `pbkdf2:ITER:SALT:HEX`.
 * Self-describing prefix allows iteration bumps later without breaking old rows.
 */

const ITERATIONS = 100_000;
const KEY_LEN = 64;

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    KEY_LEN * 8,
  );
  return toHex(bits);
}

/** Hash a password with a fresh random salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hex = await derive(password, salt, ITERATIONS);
  return `pbkdf2:${ITERATIONS}:${toHex(salt.buffer)}:${hex}`;
}

/** Verify a password against a stored hash string. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts[0] !== "pbkdf2" || parts.length !== 4) return false;
  const iterations = Number(parts[1]);
  const salt = new Uint8Array(parts[2].match(/../g)!.map((h) => parseInt(h, 16)));
  const expected = parts[3];
  const actual = await derive(password, salt, iterations);
  return actual === expected;
}
