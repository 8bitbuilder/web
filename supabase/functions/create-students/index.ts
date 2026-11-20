// supabase/functions/create-students/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the calling user is a teacher
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Confirm caller is a teacher
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (!callerProfile || callerProfile.role !== "teacher") {
      return new Response(JSON.stringify({ error: "Only teachers can create students" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { usernames, group_name } = await req.json();

    if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
      return new Response(JSON.stringify({ error: "Provide an array of usernames" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for existing usernames
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("username")
      .in("username", usernames);

    const existingNames = (existing || []).map((p: any) => p.username);
    const conflicts = usernames.filter((u: string) => existingNames.includes(u));

    if (conflicts.length > 0) {
      return new Response(JSON.stringify({ error: "Username conflicts", conflicts }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create each student
    const created: string[] = [];
    const errors: { username: string; message: string }[] = [];

    for (const username of usernames) {
      const syntheticEmail = `${username.toLowerCase()}@students.noemail.invalid`;
      const internalPassword = crypto.randomUUID() + crypto.randomUUID();

      // The database trigger (handle_new_user) automatically creates the
      // profile row using the metadata passed here — no manual insert needed.
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: syntheticEmail,
        password: internalPassword,
        email_confirm: true,
        user_metadata: {
          username,
          role: "student",
          teacher_id: caller.id,
          group_name: group_name || "Default",
        },
      });

      if (createError) {
        errors.push({ username, message: createError.message });
        continue;
      }

      created.push(username);
    }

    return new Response(JSON.stringify({ created, errors }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});