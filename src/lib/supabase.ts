import { createClient } from "@supabase/supabase-js";

// `|| undefined` collapses empty strings (unfilled .env.local) to undefined.
const url = (import.meta.env.VITE_SUPABASE_URL as string) || undefined;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || undefined;

/** True when .env.local has been filled in. Used to show a friendly setup notice. */
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  // Non-fatal: the UI surfaces a setup card instead of a blank crash.
  console.warn(
    "[nbme] Supabase not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local"
  );
}

// Placeholder keeps createClient from throwing when unconfigured (e.g. preview
// mode, or before .env.local is filled). Real calls are gated by the UI/PREVIEW.
export const supabase = createClient(url ?? "https://placeholder.supabase.co", anonKey ?? "placeholder-anon-key", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
