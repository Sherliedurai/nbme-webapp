-- =============================================================================
-- Migration 0004 — add 'practice' to block_sessions.mode
--
-- Three modes now:
--   block      — 20 Q, 30:00 timer, no reveal until submit
--   full_exam  — all blocks back-to-back, 30:00/block, reveal after whole exam
--   practice   — untimed; reveal each answer + explanation immediately after answering
-- Recording the mode lets analytics compare practice vs exam performance separately.
-- =============================================================================
begin;

alter table public.block_sessions drop constraint if exists block_sessions_mode_chk;
alter table public.block_sessions
  add constraint block_sessions_mode_chk
  check (mode in ('block', 'full_exam', 'practice'));

commit;
