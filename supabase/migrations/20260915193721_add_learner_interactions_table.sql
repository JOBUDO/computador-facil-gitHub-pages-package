-- Stage 1 (AI adaptive learning): append-only log of learner activity (quizzes, practice, help requests, hints).
-- Rollback:
--   drop policy if exists learner_interactions_insert_own on public.learner_interactions;
--   drop policy if exists learner_interactions_select_own on public.learner_interactions;
--   drop table if exists public.learner_interactions;

create table public.learner_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id integer references public.lessons(id) on delete set null,
  skill_key text,
  interaction_type text not null check (
    interaction_type in ('quiz','practice','help_request','explanation_request','lesson_completion','hint')
  ),
  question text,
  result text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index learner_interactions_user_id_idx on public.learner_interactions (user_id);
create index learner_interactions_lesson_id_idx on public.learner_interactions (lesson_id);

alter table public.learner_interactions enable row level security;

create policy learner_interactions_select_own
  on public.learner_interactions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy learner_interactions_insert_own
  on public.learner_interactions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
