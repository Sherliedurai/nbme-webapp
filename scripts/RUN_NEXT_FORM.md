# RUN_NEXT_FORM.md — extract one NBME form, end to end

You, tired, weeks from now, no agent. This is the whole pipeline for **one form**,
checklist-style, with the Form-28 known-good numbers to compare against at every gate.
Substitute the form number for `NN` everywhere (e.g. `29`).

Read `scripts/PIPELINE.md` (the design) and `scripts/EXTRACTION_NOTES_form28.md` (where it
met reality) if anything here is unclear. `CLAUDE.md` hard constraints still apply — the two
that bite here: **never write to Supabase from a script** (we emit `.sql`, you run it), and
**never relax a rule to make content fit** (24-word cap is final).

---

## ⚠️ READ THIS FIRST — which steps need an agent (Claude), which you can do alone

Two steps **cannot** be done without Claude sub-agents:

| Step | Needs Claude? | Why |
|------|---------------|-----|
| 1 Rasterize | No — script | `pdftoppm` |
| **2 Extract** | **YES — sub-agents** | vision reads of 200 page PNGs |
| 3 Reconcile | No — script | `reconcile.py` (needs the blind re-read, also agent-made) |
| 4 Crop figures | No — script/manual | `pdftoppm` crops from bboxes the agent recorded |
| 5a Mehlman index | No — script | `mehlman_build.py` |
| 5b Build enrich input | No — script | `build_enrich_input.py` |
| **5c Generate enrichments** | **YES — sub-agents** | writes the medical content |
| 5d Merge + self-lint | No — script | `merge_enrichment.py` |
| 6 Build SQL | No — script | `build_form.py sql` |
| **LOAD / VERIFY / FIGURES** | **No — you, by hand** | psql + dashboard |

**So, after your subscription ends:** you can fully finish any form the agent has already
carried through **Step 5c tonight** — i.e. run merge/reconcile/figures/mehlman/build-sql/load/
verify yourself. You **cannot** start a brand-new form from raw PDF alone (Steps 2 and 5c need
Claude). Tonight's job is to get as many forms as possible **through Step 5c**. This doc is the
map for both: the agent follows it tonight; you follow the script-only + load half afterward.

Before you start a form, check where it already got to: `ls import/outNN/`. Presence of
`block*.merged.json` = extraction done. Presence of `enrich_blockN.json` = enrichment generated.
`load_formNN.sql` = ready to load.

---

## PART A — worktree setup (mechanical; do this once per form)

Each form gets its **own git worktree** so a half-finished form never sits on `main`, and so
licensed content (PDF, page renders, figures, JSON, SQL — all gitignored) stays isolated.

> There is already a stale `nbme-form29` worktree at an **old** commit (`423ed98`, before the
> Form-28 hardening). Do **not** use it as-is — it lacks the hardened scripts. Either rebase it
> onto `main` (below) or remove it (`git worktree remove ../nbme-form29`) and re-add.

```bash
cd /Users/sherlie/Desktop/nbme-app

# 1. New worktree + branch off main (main has ALL the hardened scripts from commit b72022a).
git worktree add ../nbme-formNN -b extract/form-NN main
cd ../nbme-formNN

# 1b. If the worktree already existed on an old commit, rebase it so it inherits the fixes:
#     git rebase main            (from inside ../nbme-formNN)

# 2. Copy in the licensed inputs (gitignored, so they don't travel with the branch).
#    - the form PDF:
cp "../nbme-app/NBME NN A.pdf" .          # match the real filename; e.g. "Nbme 20 A (1).pdf"
#    - the Mehlman corpus (26 PDFs). The dir name has a trailing space on main; the resolver
#      globs "Mehlman*" and picks whichever dir holds PDFs, so either name works — just copy it:
cp -R "../nbme-app/Mehlman HY pdfs " .

# 3. Install node deps (only needed for the app-side scripts; the pipeline is Python + poppler).
npm install

# 4. Sanity-check the toolchain is present:
which pdftoppm pdftotext            # poppler — both must resolve
python3 -c "import fitz; print(fitz.__doc__[:20])"   # PyMuPDF — must print a version
```

Everything below runs **from inside `../nbme-formNN`**. Outputs land in `import/outNN/` and
`import/images/form-NN/…`, all gitignored.

---

## PART B — the pipeline (Steps 1–6), with gates

### Step 1 — Rasterize + count  `[script]`

```bash
# CHECK NATIVE SIZE FIRST — do not assume Form-28's geometry.
pdfinfo "NBME NN A.pdf" | grep -i "page size\|pages"
```

- Form 28 was native ~1920×880 (wide landscape screenshots) → rendered at **150 DPI** (200 DPI
  just upsamples a low-native scan). Form 31 was higher-native and used 200 DPI. **Pick DPI from
  the native size**, aiming for ~4000px wide.

```bash
pdftoppm -png -r 150 "NBME NN A.pdf" import/pages/p     # 150 for 28-like sources
ls import/pages/p-*.png | wc -l
```

**Form-28 known-good:** `200` pages = 4 sections × 50. Boundary check: eyeball the header band
on pages 1 / 50 / 51 / 100 / 101 / 150 / 151 / 200 — should read S1I1…S1I50, S2I1… etc.
For Form 28 the layout was **1 item per page**, so `page N == global q_number N` and
`block_number = ceil(q_number/20)`.

> **Do NOT count items from the text layer.** The teal header OCRs badly (Form 28: only 85/200
> headers legible). Count = page count + boundary check.

**Healthy:** 200 pages, clean section boundaries, page↔item 1:1.
**STOP if:** page count isn't a clean multiple of 50, or boundaries don't line up 1:1 — the
segmentation assumption is wrong for this form; re-derive the mapping before extracting.

---

### Step 2 — Extract  `[AGENT — sub-agents]`

Method **M1 (hybrid, confirmed for Form 28):** seed each item from the page's text layer, then
**verify every number/unit and the printed answer against the rendered image**, and strip all
prior-taker marks. Pure vision is the fallback for figure-bearing / illegible items.

Non-negotiables the agent must honor (from PIPELINE.md / CLAUDE.md):
- `correct_letter` comes from the printed **"Correct Answer:"** line — **never** from the
  filled radio. On Form 28 the filled radio was the *prior taker's pick* and it was **wrong every
  time sampled**. Capture it separately as `selected_letter` (review-only; never influences the
  key). `highlight_correct_letter` = the yellow-highlighted option (feeds the agreement check).
- Preserve every number/unit/arrow; list anything not 100% legible in `numeric_review`.
- Genuine figures → `has_figure` + `figure_page` (+ `needs_image` if unanswerable without it);
  simple 2×2 tables → retype into the vignette (`table_retyped`).
- `official_explanation` captured verbatim if the form prints one (Forms 28/31 do; Form 20 didn't).
- Output to `import/outNN/blockN_part{1,2}.json` (2 sub-agents × 10 items per block).

Then merge + validate each block `[script]`:

```bash
for N in $(seq 1 10); do python3 scripts/build_form.py --form NN merge $N; done
ls import/outNN/block*.merged.json | wc -l          # expect 10
```

`merge` checks count=20, sequential q_numbers, answer ∈ options, non-empty fields, and
highlight-vs-printed-answer agreement (warnings, not a hard abort). It also writes
`blockN_review_needed.csv` for you to eyeball.

**Form-28 known-good:**
- 10/10 blocks CLEAN (count=20, sequential q, answer∈options, on-taxonomy).
- Answer cross-check (vision vs OCR text layer): **199 AGREE / 0 MISMATCH / 1 OCR-miss**
  (the miss confirmed by direct image read). **Zero answer disagreements.**
- `official_explanation` on **200/200**; `selected_letter` on **161/200** (rest genuinely unmarked).
- **41 figures**, **28 needs_image**.
- question_type mix: mechanism 74 / diagnosis 56 / interpretation 37 / association 22 / next-step 11.

**Healthy:** all blocks merge CLEAN, ~200 items, an answer-disagreement count at or near 0.
**STOP if:** any block fails count/sequence/answer-in-options, OR the vision-vs-OCR answer check
shows real mismatches (not OCR misses) — a wrong `correct_letter` silently breaks the question.

---

### Step 3 — Reconcile  `[script]`

Needs a **blind independent second read** (image-only, no access to the extraction JSON) written
to `import/outNN/verify_blockN.json` — this is agent work, done tonight alongside Step 2.

```bash
python3 scripts/reconcile.py --form NN
```

Writes `import/outNN/answer_key_reconciliation.csv` and stamps `answer_confidence`.

> For Form 28 the printed answer is **NBME-authoritative**, so reconcile is **transcription QA**,
> not answer-key adjudication — expect near-zero disagreements, and treat any as a *transcription*
> flag. (For a CBSSA form like 20 with a fallible blue-letter key, a disagreement means the key
> itself may be wrong → physician adjudicates.)

**Form-28 known-good:** **200 AGREE / 0 DISAGREE / 0 no-verify-data.** All 200 stay high-confidence.
**Healthy:** disagreements at or near 0; every item has verify data.
**STOP if:** a batch of "no-verify-data" (the blind read didn't cover those items), or clustered
disagreements (points at a systematic transcription error in one block).

---

### Step 4 — Crop figures  `[script / manual]`

Crop each figure straight from the PDF at the same DPI you rasterized, using the bbox the agent
recorded. **Page PNGs are variable-height** (Form 28: q132 was 4000×2584, not the 4000×1834 of
page 1) — crop in each PNG's true pixel space and clamp to bounds; do **not** assume a uniform
page height.

```bash
# one per figure item; X/Y/W/H come from the agent's figure bboxes:
pdftoppm -png -r 150 -f <pg> -l <pg> -x <X> -y <Y> -W <W> -H <H> \
  "NBME NN A.pdf" import/images/form-NN/block-<BB>/q<QNUM>
```

Save as `import/images/form-NN/block-BB/qNNNN.png`; set that item's `clinical_image_url` to the
**object path** `form-NN/block-BB/qNNNN.png` (private bucket — path, never a public URL). The
`form-NN/` prefix keeps figures from colliding across forms.

**Form-28 known-good:** **41 figures** cropped; `clinical_image_url` set on all **41** items.
**Healthy:** figure file count == the `has_figure` count from Step 2; every `needs_image` item has
a non-null `clinical_image_url`.
**STOP if:** a `needs_image` item has no crop — the question is unanswerable in the app without it.

---

### Step 5a — Build the Mehlman index  `[script]`

```bash
python3 scripts/mehlman_build.py
```

The hardened `mehlman_build.py` handles **Form-29 footgun #1**: it no longer hardcodes the
corpus dir (which had a *trailing space* on main and would silently glob 0 PDFs in a fresh
worktree). It now `resolve_src()`-globs `Mehlman*`, picks the dir that actually contains PDFs, and
**loud-fails (`sys.exit`)** if it finds zero PDFs or produces zero chunks — so you can never get a
silently-empty index. Writes `import/mehlman/chunks.json`.

**Form-28 known-good:** **7,407 chunks from 26 PDFs.**
**Healthy:** a few thousand chunks from 26 PDFs, no FATAL.
**STOP if:** it exits FATAL (corpus dir not copied into the worktree — see Part A step 2), or the
chunk count is wildly off (hundreds, not thousands → wrong dir or truncated corpus).

---

### Step 5b — Build enrichment input (retrieval)  `[script]`

```bash
python3 scripts/build_enrich_input.py --form NN
```

Retrieves the top **4 Mehlman chunks per question** (idf-weighted keyword+tag match). The
retrieval query is **code-driven** (official explanation + correct-answer text + tags), never
model-driven. Writes `import/outNN/enrich_input_blockN.json` and prints a coverage line.

**Form-28 known-good:** **200/200 items got 4 chunks each = 100% retrieval coverage** (healthy
score spread, on-target labels), verified at the coverage hard-stop before any generation.
**Healthy:** 100% coverage (every item ≥1 chunk).
**STOP if:** coverage < 100% — some items have no grounding; do not generate on top of a partial
retrieval. Rebuild the index (5a) or check the merged JSON has `official_explanation`/tags.

---

### Step 5c — Generate enrichments  `[AGENT — sub-agents]`

Sub-agents (Form 28: 20 agents × 10 items) write `enriched_explanation` per item into
`import/outNN/enrich_blockN.json` — one file per block, keyed by q_number, each value the 5-section
object: `answer_lock`, `hook`, `knockdowns`, `high_yield`, `how_they_test`.

Grounding hierarchy (Form-28 convention): `answer_lock`/`knockdowns` ground **primarily in the
official NBME explanation** (higher authority than Mehlman for forms that print one), Mehlman for
`high_yield`/`how_they_test`, `"source":"model"` kept honest where neither backs a line. All the
enrichment style rules apply (terse, bold 2–4 terms, no absolutes, 24-word `high_yield` cap FINAL).

**Two Form-29 footguns to prevent HERE, before running the merge (5d):**

1. **Merge glob over-matches** (footgun #1 of enrichment). `merge_enrichment.py` globs
   `enrich_block*.json` and this **also matches intermediate `_part`/scratch files**, corrupting
   the merge. This is **not yet patched in the script** — you prevent it by hand:
   `import/outNN/` must contain **exactly one `enrich_blockN.json` per block and nothing else
   matching that glob.** Move any intermediate parts out first:
   ```bash
   mkdir -p import/outNN/_parts
   # move anything that isn't a clean per-block file, e.g. enrich_block3_part2.json:
   mv import/outNN/enrich_block*_part*.json import/outNN/_parts/ 2>/dev/null
   ls import/outNN/enrich_block*.json | wc -l      # MUST equal the block count (10)
   ```
2. **Nested schema** (footgun #2). A sub-agent may wrap the 5 sections under an
   `enriched_explanation` key instead of laying them flat. Detect it and flatten before merge:
   ```bash
   # prints any q whose value has a lone "enriched_explanation" wrapper (should print nothing):
   python3 - <<'PY'
   import json, glob
   for f in sorted(glob.glob("import/outNN/enrich_block*.json")):
       d = json.load(open(f))
       for q, v in d.items():
           if isinstance(v, dict) and set(v) == {"enriched_explanation"}:
               print("NESTED:", f, q)
   PY
   ```
   If it prints anything, flatten those entries (replace the value with its inner
   `enriched_explanation` object) and re-save, then re-run the check until clean.

---

### Step 5d — Merge enrichments + self-lint  `[script]`

```bash
python3 scripts/merge_enrichment.py --form NN
```

Validates every `source` under the **3-way provenance taxonomy** (`official` / exact-Mehlman-label /
`model`; anything else is **downgraded to `model`**, never fabricated), runs the self-lint
(absolute words, 24-word cap, verbatim-overlap vs official prose), normalizes compound
`discipline_tag`s to the primary (keeps `discipline_tag_original`), and merges the 5-section object
into `blockN.merged.json` so Step 6 picks it up. It **prints the full report** — read it.

**Form-28 known-good report:**
- Provenance: **official 592 (59%) / Mehlman 386 (38%) / model 25 (2%)** of ~1,003 sourced
  facts+scenarios. **Official-dominant** is the intended Form-28 hierarchy.
- **24-word cap violations: 0** (of 635 high_yield facts).
- **Verbatim-overlap flags: 0** (after remediation; the raw first pass had 9 → reworded).
- **Disallowed absolutes: 0** (raw pass had ~8, mostly "prevent"→"lowers the risk of"); **1
  accepted** (`absolute_ok`, literally-true + officially supported — Q143 "every drug of abuse ↑ dopamine").
- **Disciplines normalized: 12** compound → primary.

**Healthy:** provenance official-dominant with model near-zero (~2%), **0 cap violations**, and
after remediation **0 verbatim / 0 disallowed absolutes**.
**STOP (do not build SQL) if:** any cap violation remains, any verbatim-overlap flag remains, any
disallowed absolute remains, or `model` is a large share (means grounding failed — a wrong
mechanism becomes a memorized wrong fact). Reword the flagged fields, re-run the merge, and only
proceed when the lint is clean. **Never** fix a lint hit by loosening the rule (CLAUDE.md #2).

> The enrichment set is the highest medical-stakes step. Physician sign-off + review HTML before
> anything hits the DB. The review HTML is form-specific (`import/outNN/formNN_review.html`);
> keep its `localStorage` keyed to the enrichment version so a regenerated set starts clean.

---

### Step 6 — Build the load SQL  `[script]`

```bash
python3 scripts/build_form.py --form NN sql
```

Emits **one transactional** `import/outNN/load_formNN.sql`: one `insert … into public.questions`
per item, options + enriched_explanation as jsonb, `source_explanation` = official text (falls back
to student_note → placeholder), guarded by `on conflict (nbme_form, q_number) do nothing`
(idempotent — safe to re-run, won't touch other forms).

**Form-28 known-good:** `200 inserts, 200 enriched`. The file's trailing comment carries the exact
verify query and the expected counts.
**Healthy:** inserts == item count, enriched == item count (200/200 for a fully-enriched form).
**STOP if:** enriched < inserts unexpectedly (an enrich_block file didn't merge — re-check 5c/5d).

That's the end of the agent-assisted pipeline. Everything below is **yours, by hand.**

---

## PART C — load, verify, figures (you, no agent)

Do these once `import/outNN/load_formNN.sql` exists and its self-lint was clean.

### C1 — Upload the figures to Supabase Storage

In the dashboard, upload `import/images/form-NN/block-NN/*.png` to the **private** `clinical-images`
bucket, **preserving the path** `form-NN/block-NN/qNNNN.png`. The `form-NN/` prefix prevents
cross-form collision. (The DB stores the object path, not a public URL — do this before or after
the SQL load, but do it, or figure-bearing questions render broken.)

### C2 — Run the load SQL

Preferred (psql, if you have the connection string in `.env.local` / dashboard → Connect):

```bash
psql "$SUPABASE_DB_URL" -f import/outNN/load_formNN.sql
# or paste the file into the dashboard SQL Editor and Run.
```

It runs in a `begin;…commit;` transaction and is idempotent. Service context bypasses RLS
(`questions` has no app write policy — this is the only sanctioned write path, CLAUDE.md).

### C3 — Verify at the DATA layer (not the UI)

A screenshot proves nothing. Run these **4 queries** and match the numbers. For Form 28 every
expected value is **200 / 200 / 10×20 / 41** — substitute your form's Step-2/Step-4 counts.

```sql
-- 1) Row + enrichment count (this is the query printed at the bottom of the .sql).
select count(*) as total, count(enriched_explanation) as enriched
  from public.questions where nbme_form = NN;
--    expect: total = <item count> (200),  enriched = <same> (200)

-- 2) Block distribution — 20 per block, no short/over block.
select block_number, count(*) from public.questions
  where nbme_form = NN group by block_number order by block_number;
--    expect: 10 rows, each count = 20

-- 3) No gaps / dupes in q_number.
select min(q_number) as lo, max(q_number) as hi,
       count(distinct q_number) as distinct_q, count(*) as rows
  from public.questions where nbme_form = NN;
--    expect: lo=1, hi=200, distinct_q=200, rows=200

-- 4) Figures wired up.
select count(*) as with_image from public.questions
  where nbme_form = NN and clinical_image_url is not null;
--    expect: = your figure count (Form 28: 41)
```

**Healthy:** all four match. **STOP / investigate if** any count is short — especially if query 1
returns fewer rows than expected (the classic failure: an `UPDATE`/`INSERT` that silently landed 0
rows — caught only by `select count(*)`, never by a green checkmark). `on conflict do nothing` means
a re-run won't duplicate, but it also means pre-existing rows won't update — if you're reloading
after a fix, confirm the rows actually changed, not just "no error."

### C4 — Record status

Update the per-form status line (extracted / reconciled / enriched / loaded) in your notes, and if
this form surfaced anything PIPELINE.md was silent/wrong about, jot it the way
`EXTRACTION_NOTES_form28.md` does (no licensed content — no vignette text, numbers, or q→answer
mappings; that file is tracked in git).

---

## One-screen cheat sheet

```bash
# setup
git worktree add ../nbme-formNN -b extract/form-NN main && cd ../nbme-formNN
cp "../nbme-app/NBME NN A.pdf" . ; cp -R "../nbme-app/Mehlman HY pdfs " . ; npm install

# 1 rasterize            [script]   -> 200 pages, boundaries 1:1
pdftoppm -png -r 150 "NBME NN A.pdf" import/pages/p ; ls import/pages/p-*.png | wc -l
# 2 extract              [AGENT]    then:
for N in $(seq 1 10); do python3 scripts/build_form.py --form NN merge $N; done   # 10 CLEAN
# 3 reconcile            [script]   -> 200 AGREE / 0 DISAGREE
python3 scripts/reconcile.py --form NN
# 4 crop figures         [script]   -> 41 crops, clinical_image_url set
# 5a mehlman index       [script]   -> ~7407 chunks, 26 PDFs (loud-fails if empty)
python3 scripts/mehlman_build.py
# 5b enrich input        [script]   -> 200/200 = 100% coverage (else STOP)
python3 scripts/build_enrich_input.py --form NN
# 5c generate            [AGENT]    then guard the two footguns:
mkdir -p import/outNN/_parts ; mv import/outNN/enrich_block*_part*.json import/outNN/_parts/ 2>/dev/null
ls import/outNN/enrich_block*.json | wc -l    # == 10, and run the nested-schema check
# 5d merge + lint        [script]   -> official~59/Mehlman~38/model~2, 0 cap, 0 verbatim, 0 abs
python3 scripts/merge_enrichment.py --form NN
# 6 build sql            [script]   -> 200 inserts, 200 enriched
python3 scripts/build_form.py --form NN sql

# PART C — you, by hand: upload figures -> psql -f load_formNN.sql -> run the 4 verify queries
```
