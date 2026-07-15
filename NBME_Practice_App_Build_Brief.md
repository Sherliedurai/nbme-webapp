# NBME Practice App — Build Brief for Claude Code

**Hand this whole file to Claude Code as your first instruction.** It is the complete spec. Where you see `⚠️ CONFIRM`, those are defaults I chose for you — change them if wrong before building.

---

## 0. What this is

A **private, two-person** USMLE-style timed practice web app. One user (owner) invites one other user (Deepika). Nothing about it is public. It runs a fixed question bank in timed 20-question / 30-minute blocks, shows explanations in review, and tracks error patterns over time so the second user can see where she's weak and revise.

### Hard constraints (do not violate)
- **Zero recurring cost.** Free static hosting + Supabase free tier only. No paid services.
- **No runtime AI / no API calls from the running app.** All AI work (question extraction, enrichment, tagging) happens **once, locally, during import**, performed by *you* (Claude Code) under the owner's existing Claude subscription — never as a live call from the deployed app. The deployed app is pure client + database.
- **Private by construction.** Email/password auth, row-level security so each user reads only their own attempts. No public signup page.
- **Licensed personal-use content.** The question source is the owner's licensed material, processed locally for personal study. The app must never expose the question bank publicly.

---

## 1. Stack

- **Frontend:** React (Vite), single deployable static build. Mobile-responsive.
- **Backend:** Supabase (Postgres + Auth + Storage), free tier, region closest to India (Mumbai or Singapore).
- **Hosting:** any free static host — Netlify (drag-and-drop `dist/`), Vercel, or Cloudflare Pages. No build-credit metering.
- **Auth model note:** the Supabase *anon/public* key is designed to live in client-side code. Security comes from Row-Level Security (RLS) policies below, not from hiding the key.

---

## 2. Data model (Supabase Postgres)

Create these tables. Enable RLS on all of them.

```sql
-- QUESTIONS: shared read for the two authed users, no per-user writes from the app
create table questions (
  id uuid primary key default gen_random_uuid(),
  block_number int not null,          -- 20 questions per block, in q_number order
  q_number int not null,              -- position in the original form (1..N)
  vignette_text text not null,        -- highlights stripped, clean
  options jsonb not null,             -- [{"letter":"A","text":"..."}, ...] 5-6 items
  correct_letter text not null,       -- "A".."F"
  clinical_image_url text,            -- Supabase Storage URL if the item has a real figure; else null
  source_explanation text not null,   -- NBME's own explanation, verbatim from source
  enriched_explanation text,          -- generated once at import: mechanism + memory hook. Nullable.
  system_tag text not null,           -- e.g. "Cardiovascular", "Renal"
  discipline_tag text not null,       -- e.g. "Physiology", "Pharmacology", "Pathology"
  question_type text not null,        -- ⚠️ CONFIRM: "mechanism" | "diagnosis" | "next-step" | "interpretation" | "association"
  created_at timestamptz default now()
);

-- BLOCK SESSIONS: one row per attempt at a block (or a full-exam run)
create table block_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  block_number int,                   -- null for a full-exam run
  mode text not null,                 -- "block" | "full_exam"
  started_at timestamptz default now(),
  submitted_at timestamptz,
  is_complete boolean default false
);

-- ATTEMPTS: one row per answered question
create table attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  question_id uuid not null references questions(id),
  block_session_id uuid references block_sessions(id),
  selected_letter text,               -- null if unanswered at auto-submit
  is_correct boolean,
  seconds_spent int,
  flagged boolean default false,
  created_at timestamptz default now()
);
```

### RLS policies
- `questions`: any authenticated user may `select`. No `insert/update/delete` from the app (owner loads data via import).
- `block_sessions` and `attempts`: a user may `select/insert/update` **only rows where `user_id = auth.uid()`**. This is what keeps the two users' histories separate. Write these policies explicitly per table — do not skip.

---

## 3. Import pipeline (run ONCE, locally, by Claude Code)

The source is an **image-based PDF** — every page is a full-page screenshot of one question (vignette + options + "Correct Answer: X" + NBME explanation). There is no text layer. The screenshots also carry the previous test-taker's yellow highlights on the correct option **and on clinically decisive phrases in the vignette** — those highlights are answer/reasoning spoilers and must be stripped.

Build a local script + agentic pass that, for each question page:

1. **Rasterizes the page** at high resolution.
2. **Extracts, cleanly:**
   - `vignette_text` — the clinical scenario, **with all highlighting removed** (plain text, no cueing).
   - `options` — the 5–6 answer choices as clean text, **no highlight, no strikethrough**.
   - `correct_letter` — read from the printed "Correct Answer: X" line.
   - `source_explanation` — NBME's Correct/Incorrect/Educational-Objective text.
3. **Detects genuine clinical figures** (photos, ECGs, imaging, graphs, non-trivial tables). If present, crop that region, upload to a Supabase Storage bucket, set `clinical_image_url`. Simple 2×2 tables may be re-typed into the vignette instead.
4. **Fidelity check on numerics.** Re-verify every number (labs, ages, doses, vitals) against the source image — a misread lab value silently breaks a medical question. Flag low-confidence items in a `review_needed.csv` for the owner (a physician) to eyeball.
5. **Tags** each question: `system_tag`, `discipline_tag`, `question_type` (⚠️ CONFIRM the type taxonomy above — this is what powers the pattern analytics, so richer = sharper).
6. **Enriches** (⚠️ CONFIRM: ON): under NBME's explanation, generate exactly two things — (a) the **mechanism / first-principles "why"** the correct answer is right, one level deeper than the source; (b) one **memory hook** (mnemonic or association). Keep it tight; do not restate the source. Store in `enriched_explanation`. This is generated **once, here, during import** — never at runtime.
7. **Assigns `block_number`** = `ceil(q_number / 20)`. A ~200-question form → ~10 blocks of 20. (⚠️ CONFIRM block size = 20.)
8. **Emits SQL or CSV** to load into Supabase.

> The owner will point you at the licensed PDF locally. Do the extraction on that file; do not fetch it from anywhere.

---

## 4. Block engine

- **A block = 20 questions. Timer = 30:00, counts down, always visible.** At 0:00, auto-submit whatever's answered (unanswered → `selected_letter = null`, `is_correct = false`).
- **Full-exam mode** = all blocks back-to-back with a break screen between each; timer resets per block.
- **One question per screen.** Options A–F as clickable radio buttons.
- **Per-question controls:** flag-for-review toggle; click-to-strike-through an option (NBME style, visual only, doesn't affect scoring).
- **Navigator:** a grid of question numbers showing answered / unanswered / flagged states; jump to any. Prominent **End Block** button.
- **During a block, never render** `correct_letter`, `source_explanation`, or `enriched_explanation`. No spoilers.
- Record `seconds_spent` per question (time between arriving and leaving it).

## 5. Review mode (after submit)

Per question: the user's choice vs. correct; the vignette; options with the correct one highlighted; the clinical image if present. Then show `source_explanation` always, and `enriched_explanation` below it. All read from the DB — no generation at runtime.

## 6. Analytics dashboard

Pure SQL over `attempts` joined to `questions`. No AI.
- Accuracy % by `system_tag`, by `discipline_tag`, and by `question_type` — bar charts, **worst-first**.
- Avg seconds/question; flagged rate; total questions done.
- **Error patterns:** surface the 3 weakest tags (across all three tag dimensions) with counts, e.g. "Renal/Physiology 41%" or "'next-step' questions 52%". The `question_type` cut is often the most useful — it separates *knowledge* gaps from *test-technique* gaps.
- A list of all incorrect questions with quick links into review.

## 7. Revision mode

A queue of previously-incorrect **and** flagged questions, resurfaced oldest-first, re-answerable. On redo, insert a fresh `attempts` row (keep history; don't overwrite). Show enriched explanation after each.

---

## 8. Deploy (free)

1. `npm run build` → static `dist/`.
2. Drag `dist/` onto Netlify (or connect the repo to Vercel/Cloudflare Pages). Free tier, no per-user or per-build cost.
3. Put the Supabase project URL + anon key in the client config (safe — see §1 note).
4. In Supabase Auth, disable public signup; the owner invites the second user by email.
5. **Back up** the database once loaded (Supabase dump) so months of attempt history can't vanish to one click.

---

## 9. Build order (suggested)

1. Supabase project + schema + RLS. Verify the two-user isolation with a quick manual test.
2. Import pipeline on the licensed PDF → load one block (20 questions) first. Owner eyeballs `review_needed.csv` and spot-checks numbers.
3. Auth + block engine + review mode. Run one real timed block end-to-end.
4. Analytics + revision.
5. Extract remaining blocks. Deploy.

**Stop and ask the owner** before any schema tradeoff, RLS subtlety, or block-behavior edge case (e.g. what happens to in-progress state if the tab closes mid-block). Those are architecture decisions, not implementation details.
