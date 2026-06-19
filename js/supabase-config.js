// js/supabase-config.js
// ============================================================
// Supabase Client Initialization
// ============================================================

const SUPABASE_URL = 'https://uuzuhrgvqurwlbcermii.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YrLGqHh4sAmgUeu2XFOV5w_Qnydq1y1';
const EDGE_FUNCTION_URL = 'https://uuzuhrgvqurwlbcermii.supabase.co/functions/v1';

// Debug: log what the CDN exposed
console.log('[supabase-config] window.supabase =', window.supabase);
console.log('[supabase-config] typeof window.supabase =', typeof window.supabase);

var _supabase;

if (window.supabase && typeof window.supabase.createClient === 'function') {
  // Standard CDN v2 exposure
  _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('[supabase-config] Client created via window.supabase.createClient');
} else if (typeof createClient === 'function') {
  // Some CDN versions expose createClient directly
  _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('[supabase-config] Client created via global createClient');
} else {
  console.error('[supabase-config] FATAL: Could not find createClient. window.supabase is:', window.supabase);
  console.error('[supabase-config] Make sure the Supabase CDN script loads BEFORE this file.');
}

// Debug: verify the client has the expected methods
if (_supabase) {
  console.log('[supabase-config] _supabase.auth =', typeof _supabase.auth);
  console.log('[supabase-config] _supabase.from =', typeof _supabase.from);
} else {
  console.error('[supabase-config] _supabase is undefined — all auth calls will fail.');
}