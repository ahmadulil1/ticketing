import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const MAINTENANCE_SCHEMA = "maintenance";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Environment VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY wajib diisi.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: MAINTENANCE_SCHEMA,
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
