// ---------------------------------------------------------------------------
// Single shared Supabase client — real auth + the Explorer Passport's
// `visits` table. See .env.local.example for the two required env vars.
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
