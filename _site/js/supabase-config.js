// js/supabase-config.js
var SUPABASE_URL = 'https://uuzuhrgvqurwlbcermii.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_YrLGqHh4sAmgUeu2XFOV5w_Qnydq1y1';
var EDGE_FUNCTION_URL = 'https://uuzuhrgvqurwlbcermii.supabase.co/functions/v1';

if (typeof _supabase === 'undefined') {
  var _supabase = null;
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[supabase-config] Client created successfully.');
  } else {
    console.error('[supabase-config] FATAL: Supabase CDN not loaded.');
  }
}