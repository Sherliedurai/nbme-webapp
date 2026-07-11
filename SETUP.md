# NBME Practice App — Setup (Step 1: Supabase schema + RLS)

This covers **build-order step 1**: create the Supabase project, apply the schema
and Row-Level Security, create the two users, and verify that neither can read the
other's history. Nothing here costs money (Supabase free tier).

You do the clicks in the Supabase dashboard; the SQL is written for you.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> → **New project**.
2. **Region:** `Southeast Asia (Singapore)` — closest free region to India.
   (Mumbai is not offered on the free tier; Singapore is the nearest.)
3. Set a strong database password (save it in your password manager).
4. Wait for provisioning (~2 min).

From **Project Settings → API**, copy and keep for later (step 3, the frontend):
- **Project URL**
- **anon / public key** (safe to ship in client code — RLS is the real guard)

Never put the **service_role** key in the app. It bypasses RLS; it's only for the
local import in step 2.

---

## 2. Apply the schema + RLS

**Option A — SQL Editor (simplest):**
1. Dashboard → **SQL Editor → New query**.
2. Paste the entire contents of `supabase/migrations/0001_initial_schema.sql`.
3. **Run.** You should see "Success. No rows returned."

**Option B — Supabase CLI (if you use it):**
```bash
supabase link --project-ref <your-ref>
supabase db push
```

This creates `questions`, `block_sessions`, `attempts`, enables RLS on all three,
adds the per-user policies, and creates the **private** `clinical-images` Storage
bucket with an authenticated-read policy.

---

## 3. Create the two users

Dashboard → **Authentication → Users → Add user** (create manually, with password).
Create two: yourself (owner) and Deepika. Copy each user's **UUID** — you need
them for the isolation test.

Then **disable public signup** so nobody else can register:
**Authentication → Providers → Email** → turn **"Allow new users to sign up"** OFF.
(Full lock-down of the deploy happens in step 3/8; doing it now is fine.)

---

## 4. Verify two-user isolation (the required manual test)

1. Open `supabase/tests/rls_isolation_test.sql`.
2. Find/replace `<<USER_A_UUID>>` and `<<USER_B_UUID>>` with the two UUIDs from
   step 3.
3. Paste into the SQL Editor and **Run**. Read the labelled result rows:

   | check | expected |
   |-------|----------|
   | A: my block_sessions | **1** |
   | A: can read questions | ≥ 0 (any) |
   | B: visible block_sessions (only B's) | **1** — *not 2* |
   | B: visible attempts (none are B's) | **0** |

   The test writes as user A, then as user B, and confirms **B cannot see A's
   rows**. It rolls back, so no test data is left behind.

4. Run the commented-out **SEPARATE CHECK** block at the bottom of the file on its
   own. It **must fail** with
   `new row violates row-level security policy for table "questions"` —
   that proves the app role cannot write the question bank.

If all of the above holds, step 1 is done and the two-user wall is real.

---

## Notes / decisions baked into the schema

- **Enum strictness:** CHECK constraints on the stable fields only — `mode`
  (`block`/`full_exam`) and the answer letters (`A`–`F`). `system_tag`,
  `discipline_tag`, and `question_type` are free text so you can refine
  categories during import without a migration. Canonical `question_type`
  values used by the import: `mechanism · diagnosis · next-step ·
  interpretation · association`.
- **Clinical images are private.** The `clinical-images` bucket is **not**
  public — a public bucket would expose licensed figures to anyone with the
  link, violating the "private by construction" constraint. The `questions.
  clinical_image_url` column stores the object **path** (e.g.
  `block-01/q0007.png`); the app turns it into a short-lived **signed URL**
  client-side. No server, no cost.
- **`q_number` is unique.** Guards against loading the same question twice.
  Assumes a single fixed form (per the brief). If a second form is ever
  imported, drop `questions_qnumber_uniq`.
- **No delete policies.** Users can insert/update their own sessions and
  attempts but cannot delete history. Redo/revision inserts a *new* `attempts`
  row rather than overwriting.

## Open item to decide before step 3 (block engine)

Not needed for step 1, but flagging early since the brief calls it out: **what
happens to an in-progress block if the tab closes mid-block?** The schema already
supports "write each answer live" (attempts linked to an incomplete
`block_session`), which would let a block resume. The alternative is "commit all
answers only at submit" (tab close = block lost). We'll pin this down when we
build the engine.
