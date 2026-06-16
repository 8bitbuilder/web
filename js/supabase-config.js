// ============================================================
// Supabase Client Configuration
// ============================================================
// The anon key is safe to expose in client-side code when RLS is enabled.

const SUPABASE_URL = "https://uuzuhrgvqurwlbcermii.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_YrLGqHh4sAmgUeu2XFOV5w_Qnydq1y1";

// Initialize the Supabase client from the CDN-loaded global
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper to get the current session
async function getSession() {
  const {
    data: { session },
  } = await _supabase.auth.getSession();
  return session;
}

// Helper to get the current user
async function getUser() {
  const {
    data: { user },
  } = await _supabase.auth.getUser();
  return user;
}

// Helper to call an Edge Function
async function callEdgeFunction(functionName, body) {
  const session = await getSession();
  const headers = {
    "Content-Type": "application/json",
  };
  if (session) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/${functionName}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Edge function call failed");
  }
  return data;
}