/// <reference types="vite/client" />

/** Env vars exposed to the client (prefixed VITE_). Currently none required. */
interface ImportMetaEnv {}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}