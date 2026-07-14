-- =============================================================================
-- NBME Practice App — Instrumentation for exam 1
-- Migration 0005
--
-- Adds the data we can NEVER recover after the fact if it isn't captured on the
-- very first sitting:
--   * first_letter / changed — first-instinct tracking. Deepika's failure mode is
--     reaching the right answer by correct mechanism, then talking herself out of
--     it. We must be able to see "correct -> incorrect" answer changes from exam 1.
--   * error_tag — one-tap post-exam classification of each MISSED question
--     (knowledge gap / discriminator miss / primary-secondary confusion / process
--     error). This is what settles content-vs-process with data, not opinion.
--
-- Position (pacing) and block-within-exam (stamina) need NO new columns: they are
-- derived at read time from questions.q_number / block_number + block_sessions.mode.
--
-- Safe to run more than once (drop-if-exists on constraints; add-column if-not-exists).
-- Column privileges inherit the table GRANTs from 0001 (select/insert/update to
-- authenticated); RLS still gates every row on user_id = auth.uid().
-- =============================================================================

alter table public.attempts
  add column if not exists first_letter text,   -- the FIRST option she committed to (radio), before any change
  add column if not exists changed      boolean not null default false, -- final != first (final null after a first pick counts as changed)
  add column if not exists error_tag    text;   -- set post-exam, only on missed questions; nullable

comment on column public.attempts.first_letter is
  'First option selected for this question, captured once and never overwritten. Null if never answered.';
comment on column public.attempts.changed is
  'True when the final selected_letter differs from first_letter (incl. cleared to null after a first pick).';
comment on column public.attempts.error_tag is
  'Post-exam self-classification of a miss: knowledge_gap | discriminator_miss | primary_secondary | process_error.';

-- first_letter: same shape as selected_letter (single uppercase letter or null).
alter table public.attempts drop constraint if exists attempts_first_letter_chk;
alter table public.attempts
  add constraint attempts_first_letter_chk
  check (first_letter is null or first_letter ~ '^[A-Z]$');

-- error_tag: closed taxonomy (unlike the free-text question tags, this one is fixed).
alter table public.attempts drop constraint if exists attempts_error_tag_chk;
alter table public.attempts
  add constraint attempts_error_tag_chk
  check (error_tag is null or error_tag in
    ('knowledge_gap', 'discriminator_miss', 'primary_secondary', 'process_error'));

-- =============================================================================
-- End migration 0005
-- =============================================================================
