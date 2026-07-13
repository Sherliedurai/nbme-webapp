// Dev-only preview mode. Enabled with `VITE_PREVIEW=1 npm run dev`.
// When on, the data layer serves real block-1 content from the local extracted
// JSON (gitignored, licensed) instead of hitting Supabase, and auth is faked so
// the exam screen can be viewed/screenshotted without credentials or a login.
// NEVER enable in a production build.
export const PREVIEW = import.meta.env.VITE_PREVIEW === "1";
