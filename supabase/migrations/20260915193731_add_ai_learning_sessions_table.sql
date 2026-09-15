-- Stage 1 (AI adaptive learning): append-only log of AI-tutor session outcomes and recommendations.
-- Rollback:
--   drop policy if exists ai_learning_sessions_insert_own on public.ai_learning_sessions;
--   drop policy if exists ai_learning_sessions_select_own on public.ai_learning_sessions;
--   drop table if exists public.ai_learning_sessions;

create table public.ai_learning_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id integer references public.lessons(id) on delete set null,
  difficulty_level text,
  recommended_action text check (
    recommended_action is null or recommended_action in ('advance','practice','reinforce','review_prerequisite')
  ),
  summary text,
  created_at timestamptz not null default now()
);

create index ai_learning_sessions_user_id_idx on public.ai_learning_sessions (user_id);
create index ai_learning_sessions_lesson_id_idx on public.ai_learning_sessions (lesson_id);

alter table public.ai_learning_sessions enable row level security;

create policy ai_learning_sessions_select_own
  on public.ai_learning_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy ai_learning_sessions_insert_own
  on public.ai_learning_sessions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
