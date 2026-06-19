// supabase/functions/student-login/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { username } = await req.json();

    if (!username) {
      return new Response(JSON.stringify({ error: "Username is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the student profile
    const { data: profile, error: lookupError } = await supabaseAdmin
      .from("profiles")
      .select("id, username, role")
      .eq("username", username)
      .eq("role", "student")
      .single();

    if (lookupError || !profile) {
      return new Response(JSON.stringify({ error: "Student not found. Check your username and try again." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const syntheticEmail = `${username.toLowerCase()}@students.noemail.invalid`;

    // Generate a magic link server-side
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: syntheticEmail,
    });

    if (linkError || !linkData) {
      return new Response(JSON.stringify({ error: "Login failed. Please try again." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract the token hash and verify it to create a session
    // The properties object contains the hashed_token
    const tokenHash = linkData.properties?.hashed_token;

    if (!tokenHash) {
      return new Response(JSON.stringify({ error: "Could not generate login token." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use verifyOtp to exchange the token for a session
    const { data: sessionData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });

    if (verifyError || !sessionData.session) {
      return new Response(JSON.stringify({ error: "Login verification failed." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      session: sessionData.session,
      username: profile.username,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});