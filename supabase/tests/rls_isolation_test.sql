-- =============================================================================
-- RLS two-user isolation test  (run in the Supabase SQL Editor)
--
-- Proves that each user can read ONLY their own block_sessions / attempts, that
-- any authenticated user can read questions, and that the app role cannot write
-- to questions. Everything runs inside a transaction and ROLLS BACK, so it
-- leaves no data behind.
--
-- SETUP BEFORE RUNNING:
--   1. In Supabase → Authentication → Users, create the two users (owner +
--      Deepika). Copy their UUIDs.
--   2. Find/replace the two placeholders below with those UUIDs:
--        <<USER_A_UUID>>   <<USER_B_UUID>>
--   3. Load at least one question first (or run migration 0001 and insert one
--      throwaway question in another transaction) so the questions checks have
--      a row to see. Optional — the count just reads 0 otherwise.
--
-- HOW IT WORKS: the SQL editor runs as the `postgres` superuser, which BYPASSES
-- RLS. We simulate a logged-in user by (a) setting the JWT claims GUC that
-- auth.uid() reads, then (b) SET ROLE authenticated so RLS actually applies.
-- =============================================================================

begin;

-- ── Act as USER A, insert one session + one attempt ─────────────────────────
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '4d0ecfe3-343a-4cba-a764-ca690974752d', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

insert into public.block_sessions (user_id, block_number, mode)
values ((select auth.uid()), 1, 'block');

insert into public.attempts (user_id, question_id, selected_letter, is_correct, seconds_spent)
select (select auth.uid()), q.id, 'A', false, 42
from public.questions q
order by q.q_number
limit 1;  -- inserts nothing if the bank is empty; that's fine

-- What A can see (expect: A's 1 session, and only A's attempts)
select 'A: my block_sessions (expect 1)'  as check, count(*) from public.block_sessions;
select 'A: my attempts (expect 0 or 1)'   as check, count(*) from public.attempts;
select 'A: can read questions'            as check, count(*) from public.questions;

reset role;

-- ── Act as USER B, insert one session ───────────────────────────────────────
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '38dc75d0-2288-447b-89b1-a5dd884e49d9', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

insert into public.block_sessions (user_id, block_number, mode)
values ((select auth.uid()), 2, 'block');

-- THE KEY ASSERTIONS: B must NOT see A's rows.
select 'B: visible block_sessions (expect 1 — only B''s)' as check, count(*) from public.block_sessions;
select 'B: visible attempts (expect 0 — none are B''s)'   as check, count(*) from public.attempts;

reset role;

rollback;  -- discard all test rows

-- =============================================================================
-- SEPARATE CHECK — run this block on its own. It must ERROR with
-- "new row violates row-level security policy for table \"questions\"",
-- proving the app role cannot write the question bank.
-- =============================================================================
-- begin;
--   select set_config('request.jwt.claims',
--     json_build_object('sub','<<USER_A_UUID>>','role','authenticated')::text, true);
--   set local role authenticated;
--   insert into public.questions
--     (block_number, q_number, vignette_text, options, correct_letter,
--      source_explanation, system_tag, discipline_tag, question_type)
--   values (1, 999, 'x', '[]'::jsonb, 'A', 'x', 'x', 'x', 'diagnosis');  -- must fail
-- rollback;
