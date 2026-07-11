-- =============================================================================
-- NBME Practice App — Initial schema + Row-Level Security
-- Migration 0001
--
-- Run this ONCE against a fresh Supabase project (SQL Editor, or `supabase db
-- push` if you use the CLI). It is idempotent-ish: it creates tables, RLS
-- policies, a private Storage bucket, and its policies.
--
-- Design decisions locked with the owner:
--   * CHECK constraints on the STABLE enums only (mode, correct_letter,
--     selected_letter). system_tag / discipline_tag / question_type stay free
--     text so categories can be refined during import without a migration.
--   * question_type canonical values (enforced by convention, not CHECK):
--       mechanism | diagnosis | next-step | interpretation | association
--   * Clinical images live in a PRIVATE Storage bucket. The app reads them via
--     short-lived signed URLs generated client-side. `clinical_image_url` holds
--     the object PATH inside the bucket (e.g. 'block-01/q0007.png'), NOT a
--     public URL — a public bucket would leak licensed content.
-- =============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid() (native in PG13+, defensive)

-- -----------------------------------------------------------------------------
-- QUESTIONS
-- Shared read for the two authenticated users. No app-side writes: the owner
-- loads the bank during import using the service_role key / SQL editor, both of
-- which bypass RLS. There are deliberately NO insert/update/delete policies.
-- -----------------------------------------------------------------------------
create table if not exists public.questions (
  id                   uuid primary key default gen_random_uuid(),
  block_number         int  not null,                 -- ceil(q_number / 20)
  q_number             int  not null,                 -- position in the original form (1..N)
  vignette_text        text not null,                 -- highlights stripped, clean
  options              jsonb not null,                -- [{"letter":"A","text":"..."}, ...] 5-6 items
  correct_letter       text not null,                 -- "A".."F"
  clinical_image_url   text,                          -- Storage object PATH (private bucket) or null
  source_explanation   text not null,                 -- NBME's own explanation, verbatim
  enriched_explanation text,                          -- generated once at import; nullable
  system_tag           text not null,                 -- e.g. "Cardiovascular", "Renal"
  discipline_tag       text not null,                 -- e.g. "Physiology", "Pharmacology"
  question_type        text not null,                 -- mechanism|diagnosis|next-step|interpretation|association
  created_at           timestamptz not null default now(),

  -- A–Z: NBME extended-matching items can have up to ~26 options (block 1, item 20
  -- has 9 options A–I with correct answer "I"). A single letter, uppercase.
  constraint questions_correct_letter_chk
    check (correct_letter ~ '^[A-Z]$'),
  -- Single fixed form: q_number is the natural key. Guards against double-loading
  -- the same question. Drop this if you ever import a second form.
  constraint questions_qnumber_uniq unique (q_number)
);

comment on column public.questions.clinical_image_url is
  'Object PATH inside the private clinical-images bucket (e.g. block-01/q0007.png). Resolve to a signed URL client-side; NOT a public URL.';
comment on column public.questions.question_type is
  'Canonical values: mechanism | diagnosis | next-step | interpretation | association (free text by design).';

create index if not exists questions_block_number_idx  on public.questions (block_number);
create index if not exists questions_system_tag_idx     on public.questions (system_tag);
create index if not exists questions_discipline_tag_idx  on public.questions (discipline_tag);
create index if not exists questions_question_type_idx   on public.questions (question_type);

-- -----------------------------------------------------------------------------
-- BLOCK SESSIONS — one row per attempt at a block (or a full-exam run)
-- -----------------------------------------------------------------------------
create table if not exists public.block_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  block_number int,                                   -- null for a full-exam run
  mode         text not null,                         -- "block" | "full_exam"
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  is_complete  boolean not null default false,

  constraint block_sessions_mode_chk check (mode in ('block','full_exam'))
);

create index if not exists block_sessions_user_id_idx on public.block_sessions (user_id);

-- -----------------------------------------------------------------------------
-- ATTEMPTS — one row per answered (or auto-submitted) question.
-- Redo/revision inserts a NEW row; history is never overwritten.
-- -----------------------------------------------------------------------------
create table if not exists public.attempts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  question_id      uuid not null references public.questions(id),
  block_session_id uuid references public.block_sessions(id) on delete set null,
  selected_letter  text,                              -- null if unanswered at auto-submit
  is_correct       boolean,
  seconds_spent    int,
  flagged          boolean not null default false,
  created_at       timestamptz not null default now(),

  constraint attempts_selected_letter_chk
    check (selected_letter is null or selected_letter ~ '^[A-Z]$'),
  constraint attempts_seconds_spent_chk
    check (seconds_spent is null or seconds_spent >= 0)
);

create index if not exists attempts_user_id_idx          on public.attempts (user_id);
create index if not exists attempts_question_id_idx      on public.attempts (question_id);
create index if not exists attempts_block_session_id_idx on public.attempts (block_session_id);
-- Speeds up the analytics/revision cut "my incorrect answers".
create index if not exists attempts_user_correct_idx     on public.attempts (user_id, is_correct);

-- =============================================================================
-- ROW-LEVEL SECURITY
-- =============================================================================

-- questions: any authenticated user may SELECT. No write policies at all, so the
-- anon/authenticated roles can never insert/update/delete. Import bypasses RLS.
alter table public.questions enable row level security;

drop policy if exists questions_select_authenticated on public.questions;
create policy questions_select_authenticated
  on public.questions for select
  to authenticated
  using (true);

-- block_sessions: a user may read/insert/update ONLY their own rows.
alter table public.block_sessions enable row level security;

drop policy if exists block_sessions_select_own on public.block_sessions;
create policy block_sessions_select_own
  on public.block_sessions for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists block_sessions_insert_own on public.block_sessions;
create policy block_sessions_insert_own
  on public.block_sessions for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists block_sessions_update_own on public.block_sessions;
create policy block_sessions_update_own
  on public.block_sessions for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- (No delete policy: attempt history is not user-deletable.)

-- attempts: a user may read/insert/update ONLY their own rows.
alter table public.attempts enable row level security;

drop policy if exists attempts_select_own on public.attempts;
create policy attempts_select_own
  on public.attempts for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists attempts_insert_own on public.attempts;
create policy attempts_insert_own
  on public.attempts for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists attempts_update_own on public.attempts;
create policy attempts_update_own
  on public.attempts for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- (No delete policy.)

-- =============================================================================
-- TABLE PRIVILEGES (GRANTs)
-- RLS decides WHICH ROWS a role may see; these GRANTs decide whether the role
-- may touch the table at all. BOTH layers are required — without the GRANT you
-- get a permission-denied error even with correct policies. Added here so a
-- fresh run reproduces the working DB (originally applied by hand in the
-- dashboard). Deliberately: no DELETE on any table, and no grants to `anon`.
-- =============================================================================
grant select on public.questions to authenticated;
grant select, insert, update on public.block_sessions to authenticated;
grant select, insert, update on public.attempts to authenticated;

-- =============================================================================
-- STORAGE — private bucket for clinical figures
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('clinical-images', 'clinical-images', false)
on conflict (id) do nothing;

-- Any authenticated user may READ objects (needed to mint signed URLs).
drop policy if exists clinical_images_read_authenticated on storage.objects;
create policy clinical_images_read_authenticated
  on storage.objects for select
  to authenticated
  using (bucket_id = 'clinical-images');
-- No insert/update/delete policy: uploads happen during import via service_role.

-- =============================================================================
-- End migration 0001
-- =============================================================================
