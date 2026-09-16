# Supabase schema (adaptive learning)

This folder tracks the SQL that has been applied to the production Supabase project
(`nhmzuqhjhkdklezimmll`) for the AI adaptive-learning feature. It exists for review and
history; the project does not use the Supabase CLI for local development, so these files
are applied directly against the project (dashboard SQL editor or an authorized tool) in
the same order as their filenames. Each file's rollback SQL is included as a comment.

## New tables (Stage 1)

| Table | Purpose | Write access | Notes |
|---|---|---|---|
| `learner_mastery` | One row per learner + `skill_key`, tracking `mastery_score` (0–100), `attempts`, `correct_attempts`, `help_requests` | Learner can select/insert/update their own rows | Unique on `(user_id, skill_key)`; the mastery engine (Stage 2) reads/writes this. `help_requests` (Stage 4) is bumped by `ai-tutor` on every `explanation_request` and never affects `mastery_score` |
| `learner_interactions` | Append-only log of learner activity: quizzes, practice, help requests, hints, lesson completions | Learner can select/insert their own rows (no update/delete — it's a history log) | `interaction_type` is constrained to a fixed set; `metadata` is `jsonb` for free-form detail |
| `ai_learning_sessions` | Append-only log of AI-tutor session outcomes (`recommended_action`, `difficulty_level`, `summary`) | Learner can select/insert their own rows | Written by the frontend directly for now; Stage 3's `ai-tutor` Edge Function may also write to it using the service-role key, which bypasses RLS by design |

`lessons` also gained four **nullable** columns: `skill_key`, `learning_objective`,
`mastery_threshold`, `prerequisite_skill`. Existing rows are unaffected (all `null`);
existing queries and the `lessons_paid_read` RLS policy are unchanged.

## Design decisions

- **RLS pattern**: every new table mirrors the existing own-row pattern used by `profiles`
  and `subscriptions` — `(select auth.uid()) = user_id`, restricted to the `authenticated`
  role. Cross-user access is impossible under RLS.
- **Not entitlement-gated**: unlike `lessons`/`lesson_progress` (which additionally require
  `has_active_access(uid)`), the three new tables are scoped by ownership only. Mastery and
  interaction tracking is orthogonal to paywall status; gating can be added later if needed.
- **No triggers added**: the existing schema does not wire up `update_updated_at_column()` to
  any table (it's defined but unused), so `learner_mastery.updated_at` follows the same
  convention — the application/Edge Function is responsible for setting it on update, exactly
  like `profiles.updated_at` and `subscriptions.updated_at` today.
- **Service-role bypass is intentional**: Stage 3's `ai-tutor` Edge Function will use the
  Supabase service-role key (server-side secret only) to read/write on behalf of the
  authenticated caller after deriving their identity from their access token — never from a
  browser-supplied `user_id`.

## Verifying isolation

Every policy was written to match the structure Supabase's own advisors and the existing
`pg_policies` entries already validate for `profiles`/`subscriptions`/`lesson_progress`. After
applying, `supabase get_advisors` reported no new findings (only the two pre-existing,
unrelated ones: `stripe_events` has no policies by design, and leaked-password-protection is
off in Auth settings — both predate this change).
