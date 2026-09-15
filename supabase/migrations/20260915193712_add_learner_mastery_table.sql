-- Stage 1 (AI adaptive learning): per-skill mastery tracking, one row per learner+skill.
-- Rollback:
--   drop policy if exists learner_mastery_update_own on public.learner_mastery;
--   drop policy if exists learner_mastery_insert_own on public.learner_mastery;
--   drop policy if exists learner_mastery_select_own on public.learner_mastery;
--   drop table if exists public.learner_mastery;

create table public.learner_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_key text not null,
  mastery_score integer not null default 0 check (mastery_score between 0 and 100),
  attempts integer not null default 0 check (attempts >= 0),
  correct_attempts integer not null default 0 check (correct_attempts >= 0),
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, skill_key)
);

create index learner_mastery_user_id_idx on public.learner_mastery (user_id);

alter table public.learner_mastery enable row level security;

create policy learner_mastery_select_own
  on public.learner_mastery for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy learner_mastery_insert_own
  on public.learner_mastery for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy learner_mastery_update_own
  on public.learner_mastery for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
