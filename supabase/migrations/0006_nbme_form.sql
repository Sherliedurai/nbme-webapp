-- =============================================================================
-- NBME Practice App — NBME form grouping
-- Migration 0006
--
-- Introduces the FORM as the top-level unit. Until now the bank held a single
-- form (NBME 31) and `block_number` (1..10) was the only grouping. That works
-- for one form and silently breaks the moment a second is loaded: q_number
-- collides, "block 3" is ambiguous, full-exam sweeps every block in the bank,
-- and analytics pools scores across forms — which makes the pass/fail signal
-- meaningless.
--
-- After this migration:
--   * questions.nbme_form      — the form (e.g. 31). block_number stays the
--                                block WITHIN that form (1..10).
--   * block_sessions.nbme_form — which form was sat (needed to score per form).
--   * The natural key becomes (nbme_form, q_number), not q_number alone, so the
--     same q_number can exist in every form.
--
-- Everything currently loaded is NBME 31, so both columns backfill to 31.
--
-- Safe to run more than once: add-column-if-not-exists, drop-if-exists on the
-- constraints/indexes it recreates. No data is destroyed — this is additive
-- plus a key swap. Column privileges inherit the table GRANTs from 0001.
--
-- HARD RULE (CLAUDE.md #1): the owner runs this in the SQL editor. No app writes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. questions.nbme_form
-- -----------------------------------------------------------------------------
alter table public.questions
  add column if not exists nbme_form int;

comment on column public.questions.nbme_form is
  'The NBME form this question belongs to (e.g. 31). block_number is the block WITHIN this form (1..10).';

-- Backfill: everything loaded so far is NBME 31.
update public.questions
  set nbme_form = 31
  where nbme_form is null;

-- Now that every row has a value, make it required.
alter table public.questions
  alter column nbme_form set not null;

-- -----------------------------------------------------------------------------
-- 2. Natural key: (nbme_form, q_number) replaces the single-form q_number key
-- -----------------------------------------------------------------------------
-- The old unique(q_number) guarded against double-loading the ONE form. With
-- multiple forms, q_number 1 legitimately exists in every form; the guard moves
-- to the pair. Double-loading a form is still blocked (same form + q_number).
alter table public.questions drop constraint if exists questions_qnumber_uniq;
alter table public.questions drop constraint if exists questions_form_qnumber_uniq;
alter table public.questions
  add constraint questions_form_qnumber_uniq unique (nbme_form, q_number);

-- Fast "all blocks of a form" and "one block of a form" lookups.
create index if not exists questions_nbme_form_idx on public.questions (nbme_form);
create index if not exists questions_form_block_idx on public.questions (nbme_form, block_number);

-- -----------------------------------------------------------------------------
-- 3. block_sessions.nbme_form — which form this sitting belongs to
-- -----------------------------------------------------------------------------
-- Nullable by design: a session may legitimately have no single form later
-- (e.g. a future custom cross-form block). For every EXISTING session the only
-- form loaded was 31, so backfill it; new sessions set it explicitly.
alter table public.block_sessions
  add column if not exists nbme_form int;

comment on column public.block_sessions.nbme_form is
  'The NBME form sat in this session (e.g. 31). Null only for cross-form custom sessions.';

update public.block_sessions
  set nbme_form = 31
  where nbme_form is null;

create index if not exists block_sessions_nbme_form_idx on public.block_sessions (nbme_form);

-- =============================================================================
-- End migration 0006
-- =============================================================================
