// ============================================================
// Supabase Client Configuration
// ============================================================
// js/supabase-config.js
// Initialize the Supabase client for browser use.
// The anon key is safe to expose in client-side code when RLS is enabled.

const SUPABASE_URL = "https://uuzuhrgvqurwlbcermii.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_YrLGqHh4sAmgUeu2XFOV5w_Qnydq1y1";
const EDGE_FUNCTION_URL = 'https://uuzuhrgvqurwlbcermii.supabase.co/functions/v1';

// Initialize the Supabase client from the CDN-loaded global
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
