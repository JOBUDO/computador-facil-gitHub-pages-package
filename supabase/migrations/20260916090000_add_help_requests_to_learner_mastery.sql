-- Stage 4 (adaptive explanations): tracks how often a learner asked for help on a skill,
-- separate from mastery_score (which only graded quiz/practice interactions move).
-- Rollback:
--   alter table public.learner_mastery drop column if exists help_requests;

alter table public.learner_mastery
  add column if not exists help_requests integer not null default 0 check (help_requests >= 0);
