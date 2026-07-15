-- =============================================================================
-- NBME Practice App — custom blocks, review re-attempts, explanation feedback
-- Migration 0007  (bundle — run all three parts together)
--
-- 1. block_sessions.mode gains 'custom' (the diagnosis-driven block builder:
--    a Physiology-only block, etc. — a practice-style session over a filtered set).
-- 2. attempts.is_review — a COLD RE-ATTEMPT from the review deck. CRITICAL: these
--    are excluded from every score/accuracy/trend cut so a re-attempt can never
--    inflate per-form accuracy or the cross-form trend. History is preserved
--    (a re-attempt is a new row, never an overwrite); the flag just quarantines
--    it from exam analytics.
-- 3. explanation_feedback — the in-app "this explanation didn't help" flag, so
--    quality control is a byproduct of use. One row per (user, question); the
--    button toggles it (insert / delete own row).
--
-- Safe to run more than once. Column privileges inherit the table GRANTs; RLS
-- gates every row on user_id = auth.uid(). Owner runs via psql.
-- =============================================================================
begin;

-- 1. 'custom' mode ------------------------------------------------------------
alter table public.block_sessions drop constraint if exists block_sessions_mode_chk;
alter table public.block_sessions
  add constraint block_sessions_mode_chk
  check (mode in ('block', 'full_exam', 'practice', 'custom'));

-- 2. attempts.is_review -------------------------------------------------------
alter table public.attempts
  add column if not exists is_review boolean not null default false;
comment on column public.attempts.is_review is
  'True for a cold re-attempt from the review deck. Excluded from ALL score/accuracy/trend analytics so drilling never inflates exam metrics. History is still preserved.';
-- Speeds up the "exam attempts only" analytics filter (is_review = false).
create index if not exists attempts_user_isreview_idx on public.attempts (user_id, is_review);

-- 3. explanation_feedback -----------------------------------------------------
create table if not exists public.explanation_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  created_at  timestamptz not null default now(),
  -- One standing flag per question per user; the button toggles insert/delete.
  constraint explanation_feedback_uniq unique (user_id, question_id)
);

create index if not exists explanation_feedback_user_idx on public.explanation_feedback (user_id);

alter table public.explanation_feedback enable row level security;

drop policy if exists explanation_feedback_select_own on public.explanation_feedback;
create policy explanation_feedback_select_own
  on public.explanation_feedback for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists explanation_feedback_insert_own on public.explanation_feedback;
create policy explanation_feedback_insert_own
  on public.explanation_feedback for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- DELETE is allowed here (unlike attempts/block_sessions): this is toggleable
-- feedback, not answer history.
drop policy if exists explanation_feedback_delete_own on public.explanation_feedback;
create policy explanation_feedback_delete_own
  on public.explanation_feedback for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on public.explanation_feedback to authenticated;

commit;

-- =============================================================================
-- End migration 0007
-- =============================================================================
