import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleAiTutorRequest, hasActiveAccess } from "./logic.js";

const AI_TIMEOUT_MS = 20000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  // Scoped to the caller's own JWT (never the service-role key): every read
  // and write below is enforced by the same own-row RLS policies the rest of
  // the app relies on, so this function never needs elevated database access.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  let body = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const env = {
    aiApiKey: Deno.env.get("AI_API_KEY") ?? "",
    aiModel: Deno.env.get("AI_MODEL") ?? "",
    aiProvider: Deno.env.get("AI_PROVIDER") || "anthropic"
  };

  const deps = {
    requestId: crypto.randomUUID(),
    log: entry => console.log(JSON.stringify({ fn: "ai-tutor", ...entry })),

    getUser: async () => {
      if (!jwt) return null;
      const { data, error } = await supabase.auth.getUser(jwt);
      if (error || !data?.user) return null;
      return data.user;
    },

    hasActiveAccess: async userId => {
      const { data } = await supabase
        .from("subscriptions")
        .select("status, access_ends_at")
        .eq("user_id", userId)
        .maybeSingle();
      return hasActiveAccess(data);
    },

    getLessonContext: async (_userId, lessonId) => {
      const { data } = await supabase
        .from("lessons")
        .select("id, title, description, mission, learning_objective, skill_key")
        .eq("id", lessonId)
        .maybeSingle();
      return data ?? null;
    },

    getMastery: async (userId, skillKey) => {
      const { data } = await supabase
        .from("learner_mastery")
        .select("mastery_score, attempts, correct_attempts")
        .eq("user_id", userId)
        .eq("skill_key", skillKey)
        .maybeSingle();
      return data ?? null;
    },

    getRecentInteractions: async (userId, { lessonId, skillKey }) => {
      let query = supabase
        .from("learner_interactions")
        .select("question, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (lessonId) query = query.eq("lesson_id", lessonId);
      else if (skillKey) query = query.eq("skill_key", skillKey);
      const { data } = await query;
      return data ?? [];
    },

    callProvider: async ({ url, headers, body: requestBody, extractText }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        if (!response.ok) {
          throw Object.assign(new Error(`AI provider responded ${response.status}`), { category: "provider_error" });
        }
        const json = await response.json();
        return extractText(json);
      } finally {
        clearTimeout(timeout);
      }
    },

    saveInteraction: async row => {
      await supabase.from("learner_interactions").insert(row);
    },

    saveAiSession: async row => {
      await supabase.from("ai_learning_sessions").insert(row);
    }
  };

  const result = await handleAiTutorRequest({ body, env, deps });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...corsHeaders, "content-type": "application/json" }
  });
});
