import { createClient } from "@supabase/supabase-js";

// SECURITY: this client uses the service role key and bypasses all RLS
// policies. Only ever import this file inside app/api/**/route.ts (server
// code) — never inside a "use client" component or lib file that runs in
// the browser.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

