-- =============================================================================
-- Migration 0002 — relax the answer-letter CHECK constraints from A–F to A–Z
--
-- WHY: the original schema assumed 5–6 options (A–F). Real NBME data includes
-- extended-matching items with more options — e.g. NBME 31 A, block 1, item 20
-- has 9 options (A–I) with correct answer "I". An "I" answer violates the old
-- A–F CHECK. A–Z safely covers any NBME item while still catching typos
-- (lowercase, digits, multi-char).
--
-- RUN THIS on the already-deployed database BEFORE loading any block SQL.
-- (Migration 0001 has been updated to match, so a fresh run needs only 0001.)
-- =============================================================================
begin;

alter table public.questions drop constraint if exists questions_correct_letter_chk;
alter table public.questions
  add constraint questions_correct_letter_chk
  check (correct_letter ~ '^[A-Z]$');

alter table public.attempts drop constraint if exists attempts_selected_letter_chk;
alter table public.attempts
  add constraint attempts_selected_letter_chk
  check (selected_letter is null or selected_letter ~ '^[A-Z]$');

commit;
