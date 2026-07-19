-- =============================================================================
-- NBME Practice App — one attempt per (sitting, question)
-- Migration 0009
--
-- Enforces at the DATA LAYER what was only ever a client convention: within a
-- single block_session, a question has at most ONE attempt row. Until now the
-- guard was purely in the app (submit writes once; practice is forward-only), so
-- any future path — the new practice navigator, a double-click, a retry — could
-- silently insert a duplicate. Analytics de-dupes on read, but a second row still
-- skews per-block counts and the "answers tracked again" the physician reported.
--
-- Two parts:
--   1. Collapse any pre-existing duplicates so the unique index can build. Keep
--      the row that carries an error_tag (a physician reclassification is real
--      work) else the earliest. No known path creates these today, so this is a
--      guard, not an expected cleanup.
--   2. A UNIQUE INDEX on (block_session_id, question_id). NULLs are distinct in
--      Postgres, so session-less rows (block_session_id set null after a session
--      delete) never collide. Covers review and non-review alike — a given
--      (session, question) is answered once per session in every mode.
--
-- With this in place recordAttempt / submitBlock upsert on this conflict target,
-- so re-answering the same question in the same sitting UPDATES the row instead
-- of inserting a second. A fresh sitting is a new block_session_id → a new row,
-- which is correct (a retake is a separate record).
--
-- HARD RULE (CLAUDE.md #1): the owner runs this in the SQL editor. No app writes.
-- Safe to run more than once (dedupe is idempotent; index is if-not-exists).
-- =============================================================================
begin;

-- 1. Dedupe (idempotent). Keeps one row per (block_session_id, question_id).
with ranked as (
  select id,
         row_number() over (
           partition by block_session_id, question_id
           order by (error_tag is not null) desc, created_at asc
         ) as rn
  from public.attempts
  where block_session_id is not null
)
delete from public.attempts a
using ranked r
where a.id = r.id and r.rn > 1;

-- 2. Enforce going forward.
create unique index if not exists attempts_session_question_uniq
  on public.attempts (block_session_id, question_id);

commit;

-- =============================================================================
-- Verify (expect ZERO rows):
--   select block_session_id, question_id, count(*)
--   from public.attempts
--   where block_session_id is not null
--   group by block_session_id, question_id
--   having count(*) > 1;
-- =============================================================================
