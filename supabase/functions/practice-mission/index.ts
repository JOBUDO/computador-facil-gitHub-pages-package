import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleGenerateMissionRequest } from "./logic.js";
import { hasActiveAccess } from "../ai-tutor/logic.js";

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

  // Scoped to the caller's own JWT (never the service-role key), same as ai-tutor and
  // quiz-generate — this function only reads, it writes nothing.
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
    log: entry => console.log(JSON.stringify({ fn: "practice-mission", ...entry })),

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

    countPracticeAttempts: async (userId, skillKey) => {
      const { count } = await supabase
        .from("learner_interactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("skill_key", skillKey)
        .eq("interaction_type", "practice");
      return count ?? 0;
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
    }
  };

  const result = await handleGenerateMissionRequest({ body, env, deps });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...corsHeaders, "content-type": "application/json" }
  });
});
