-- Stage 1 (AI adaptive learning): optional per-lesson metadata for the mastery engine.
-- All columns are nullable so existing lessons and existing queries keep working unchanged.
-- Rollback:
--   alter table public.lessons
--     drop column if exists prerequisite_skill,
--     drop column if exists mastery_threshold,
--     drop column if exists learning_objective,
--     drop column if exists skill_key;

alter table public.lessons
  add column if not exists skill_key text,
  add column if not exists learning_objective text,
  add column if not exists mastery_threshold integer check (mastery_threshold is null or mastery_threshold between 0 and 100),
  add column if not exists prerequisite_skill text;
