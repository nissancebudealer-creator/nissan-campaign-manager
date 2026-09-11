/// <reference types="vite/client" />

interface ImportMetaEnv {
  // The deployed backend's origin, e.g. "https://your-api.onrender.com" — see api.ts and
  // DEPLOYMENT.md. Left unset in local dev, where vite.config.ts's proxy handles /api instead.
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
