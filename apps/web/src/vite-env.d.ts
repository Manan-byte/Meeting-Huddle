/// <reference types="vite/client" />

/** Env vars exposed to the client (prefixed VITE_). */
interface ImportMetaEnv {
  /** GitHub OAuth App client id — enables "Continue with GitHub". */
  readonly VITE_GITHUB_CLIENT_ID?: string;
  /** Google OAuth Client id — enables "Continue with Google" (Gmail login). */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}