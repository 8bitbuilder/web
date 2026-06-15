// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

console.log("Hello from Functions!");

// This endpoint uses 'publishable' | 'secret' access, apiKey is required.
// Use publishable for Client-facing, key-validated endpoints
// Use secret for Server-to-server, internal calls
export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    // Called by another service with a secret key
    // ctx.supabaseAdmin bypasses RLS — use for privileged operations
    /*
    if (ctx.authMode === "secret") {
      const { user_id } = await req.json();
      const { data } = await ctx.supabaseAdmin.auth.admin.getUserById(user_id);

      return Response.json({
        email: data?.user?.email,
      });
    }
    */

    const { name } = await req.json();

    return Response.json({
      message: `Hello ${name}!`,
    });
  }),
};

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/create-students' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' \
    --data '{"name":"Functions"}'

*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify the calling user is a teacher
    const authHeader = req.headers.get("Authorization")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Client with the user's JWT (to verify identity)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Admin client with service role key (to create auth users)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify the caller
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check that the caller is a teacher
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.role !== "teacher") {
      return new Response(
        JSON.stringify({ error: "Only teachers can create students" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { usernames, password, group_name } = await req.json();
    // usernames: string[] — list of usernames to create
    // password: string — the generated password for all students
    // group_name: string — which group to assign students to

    if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
      return new Response(
        JSON.stringify({ error: "usernames array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!password || password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for existing usernames
    const { data: existingUsers } = await adminClient
      .from("profiles")
      .select("username")
      .in("username", usernames);

    const existingUsernames = (existingUsers || []).map((u: any) => u.username);
    const conflicts = usernames.filter((u: string) =>
      existingUsernames.includes(u)
    );

    if (conflicts.length > 0) {
      return new Response(
        JSON.stringify({
          error: "Some usernames already exist",
          conflicts,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure the group exists for this teacher
    const groupNameToUse = group_name || "Default";
    const { data: existingGroup } = await adminClient
      .from("groups")
      .select("id")
      .eq("teacher_id", user.id)
      .eq("name", groupNameToUse)
      .single();

    if (!existingGroup) {
      await adminClient
        .from("groups")
        .insert({ teacher_id: user.id, name: groupNameToUse });
    }

    // Create each student
    const created: string[] = [];
    const errors: { username: string; error: string }[] = [];

    for (const username of usernames) {
      const syntheticEmail = `${username.toLowerCase()}@students.noemail.invalid`;

      // Create the auth user
      const { data: newUser, error: createError } =
        await adminClient.auth.admin.createUser({
          email: syntheticEmail,
          password: password,
          email_confirm: true, // Auto-confirm so no verification email is sent
          user_metadata: {
            username: username,
            role: "student",
          },
        });

      if (createError) {
        errors.push({ username, error: createError.message });
        continue;
      }

      // Create the profile
      const { error: profileInsertError } = await adminClient
        .from("profiles")
        .insert({
          id: newUser.user.id,
          username: username,
          role: "student",
          teacher_id: user.id,
          group_name: groupNameToUse,
        });

      if (profileInsertError) {
        // Rollback: delete the auth user if profile insert failed
        await adminClient.auth.admin.deleteUser(newUser.user.id);
        errors.push({ username, error: profileInsertError.message });
        continue;
      }

      created.push(username);
    }

    return new Response(
      JSON.stringify({ created, errors, password }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
