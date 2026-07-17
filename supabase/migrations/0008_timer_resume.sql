-- =============================================================================
-- NBME Practice App — cross-device timer/resume + reasoning-time capture
-- Migration 0008
--
-- Timed blocks become pausable and resumable from ANY device: the in-progress
-- state lives in Supabase (an unsubmitted block_session + a block_progress row
-- per answered question), never localStorage — so it survives a closed laptop
-- and is verifiable with a query.
--
-- Three parts:
--   1. block_sessions gains the pause/resume clock + an "interrupted" flag.
--   2. attempts gains first_answer_seconds — reasoning time, distinct from the
--      total dwell already in seconds_spent (practice auto-pauses the clock while
--      the explanation is open; this column keeps time-to-first-answer clean).
--   3. block_progress — the partial answers for an unsubmitted block. Kept OUT of
--      `attempts` on purpose (see its comment): attempts stays the immutable,
--      scored, final record.
--
-- The four analytics levels (question / block / NBME / universal) need NO new
-- columns — they all derive from questions(nbme_form, block_number, q_number,
-- tags) + attempts + block_sessions(mode, paused). Only pacing/stamina gain a
-- filter: exclude paused (interrupted) blocks, because their timing isn't clean.
-- A paused block still counts for score/accuracy.
--
-- Safe to run more than once. GRANTs are in the migration (per CLAUDE.md). RLS
-- gates every row on user_id = (select auth.uid()). HARD RULE: you run this in
-- psql; the app never writes schema.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1. block_sessions — pause/resume clock + interrupted flag
-- -----------------------------------------------------------------------------
alter table public.block_sessions
  add column if not exists time_limit_seconds   int,                         -- 1800 for a timed block; null = untimed
  add column if not exists paused                boolean not null default false, -- ever paused (interrupted) — permanent
  add column if not exists paused_at             timestamptz,                -- start of the CURRENT suspension; non-null <=> suspended now
  add column if not exists total_paused_seconds  int not null default 0,     -- accumulated suspended time across all pauses
  add column if not exists current_index         int not null default 0;     -- 0-based question to restore to

comment on column public.block_sessions.time_limit_seconds is
  'Block time budget in seconds (1800 for a timed block). Null for untimed. Resume recomputes remaining time from this.';
comment on column public.block_sessions.paused is
  'True once the block has been paused at least once (interrupted). Permanent. Excluded from pacing/stamina (unclean timing); still counts for score/accuracy.';
comment on column public.block_sessions.paused_at is
  'When the CURRENT suspension began. Non-null while suspended; null while actively running. Rolled into total_paused_seconds on resume.';
comment on column public.block_sessions.total_paused_seconds is
  'Total seconds this session sat paused. Subtracted from wall-clock so the countdown only advances while active.';
comment on column public.block_sessions.current_index is
  'The 0-based index of the question to land on when resuming.';

-- Remaining time (seconds), computed at read time — no drift stored:
--   running (paused_at is null):
--     time_limit_seconds - (EXTRACT(EPOCH FROM now()      - started_at) - total_paused_seconds)
--   suspended (paused_at is not null):
--     time_limit_seconds - (EXTRACT(EPOCH FROM paused_at  - started_at) - total_paused_seconds)

alter table public.block_sessions drop constraint if exists block_sessions_paused_secs_chk;
alter table public.block_sessions
  add constraint block_sessions_paused_secs_chk check (total_paused_seconds >= 0);
alter table public.block_sessions drop constraint if exists block_sessions_current_index_chk;
alter table public.block_sessions
  add constraint block_sessions_current_index_chk check (current_index >= 0);
alter table public.block_sessions drop constraint if exists block_sessions_time_limit_chk;
alter table public.block_sessions
  add constraint block_sessions_time_limit_chk check (time_limit_seconds is null or time_limit_seconds > 0);

-- Fast "does she have an unfinished block to resume?" lookup.
create index if not exists block_sessions_user_unfinished_idx
  on public.block_sessions (user_id, started_at desc) where not is_complete;

-- -----------------------------------------------------------------------------
-- 2. attempts — reasoning time (time-to-first-answer)
-- -----------------------------------------------------------------------------
alter table public.attempts
  add column if not exists first_answer_seconds int;   -- shown -> first commit; reasoning time (null if never answered)

comment on column public.attempts.first_answer_seconds is
  'Seconds from the question first appearing to the FIRST answer commit — reasoning time, distinct from total dwell (seconds_spent). Practice stops this clock once an answer is checked.';

alter table public.attempts drop constraint if exists attempts_first_answer_secs_chk;
alter table public.attempts
  add constraint attempts_first_answer_secs_chk
  check (first_answer_seconds is null or first_answer_seconds >= 0);

-- -----------------------------------------------------------------------------
-- 3. block_progress — partial answers for an unsubmitted block
--
-- WHY a separate table, not "partial rows in attempts":
--   * Exam-safety — the answer key is NOT on the client during a live block, so
--     is_correct cannot be computed until submit. Partial rows in attempts would
--     mean is_correct=null placeholders polluting every analytics query.
--   * attempts stays immutable + final (CLAUDE.md: "a redo inserts a fresh row;
--     history is never overwritten"). Partial edits (changing an answer, striking
--     an option) happen HERE and are DELETED when the block is finalized.
-- On submit: read block_progress, fetch the key, INSERT final attempts, then
-- delete the progress rows. DELETE is allowed here (scratch state, not history)
-- — a deliberate exception to the no-delete rule that governs attempts/sessions.
-- -----------------------------------------------------------------------------
create table if not exists public.block_progress (
  block_session_id     uuid not null references public.block_sessions(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  question_id          uuid not null references public.questions(id),
  selected_letter      text,                              -- current answer (may change before submit)
  first_letter         text,                              -- first-instinct commit, captured once
  first_answer_seconds int,                               -- reasoning time so far
  seconds_spent        int  not null default 0,           -- accumulated dwell so far
  flagged              boolean not null default false,
  struck_letters       jsonb  not null default '[]'::jsonb, -- eliminated options, to restore the exact view
  highlight_html       text,                              -- saved vignette highlight markup
  updated_at           timestamptz not null default now(),

  primary key (block_session_id, question_id),
  constraint block_progress_selected_chk check (selected_letter is null or selected_letter ~ '^[A-Z]$'),
  constraint block_progress_first_chk    check (first_letter    is null or first_letter    ~ '^[A-Z]$'),
  constraint block_progress_seconds_chk  check (seconds_spent >= 0),
  constraint block_progress_first_secs_chk check (first_answer_seconds is null or first_answer_seconds >= 0)
);

create index if not exists block_progress_user_idx on public.block_progress (user_id);

alter table public.block_progress enable row level security;

drop policy if exists block_progress_select_own on public.block_progress;
create policy block_progress_select_own on public.block_progress
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists block_progress_insert_own on public.block_progress;
create policy block_progress_insert_own on public.block_progress
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists block_progress_update_own on public.block_progress;
create policy block_progress_update_own on public.block_progress
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- DELETE allowed: this is in-progress scratch, cleared on finalize. (attempts /
-- block_sessions still have NO delete policy — that history is not erasable.)
drop policy if exists block_progress_delete_own on public.block_progress;
create policy block_progress_delete_own on public.block_progress
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.block_progress to authenticated;

commit;

-- =============================================================================
-- End migration 0008
-- =============================================================================
