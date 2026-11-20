// supabase/functions/delete-teacher-cascade/index.ts
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

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
    if (!caller) {
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
      return new Response(JSON.stringify({ error: "Only teachers can delete their class" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all student IDs belonging to this teacher
    const { data: students } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("teacher_id", caller.id)
      .eq("role", "student");

    // Delete each student auth user
    if (students && students.length > 0) {
      for (const student of students) {
        await supabaseAdmin.auth.admin.deleteUser(student.id);
      }
    }

    // Delete the teacher's groups (handled by CASCADE, but explicit for safety)
    await supabaseAdmin.from("groups").delete().eq("teacher_id", caller.id);

    // Delete the teacher auth user (profile deleted by CASCADE)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(caller.id);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});