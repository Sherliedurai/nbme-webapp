# Form 28 extraction notes — where PIPELINE.md met reality

First form through the generalized pipeline. This file records every point where
`scripts/PIPELINE.md` was **ambiguous, silent, or wrong** for `import/NBME 28 A.pdf`, and
what was done. Forms 29+ should read this alongside PIPELINE.md. **Contains no licensed
content** (no vignette text, no numbers, no q→answer mappings) — it is tracked in git.

Status at last checkpoint: **STEP 2 COMPLETE. All 200 items extracted (hybrid method), all 10
blocks merged and validate CLEAN. Path fix applied (flows to main w/ D1/D3). Nothing written to
any DB; nothing committed. STOPPED at the block-10 checkpoint per owner. Next: Step 3 reconcile,
Step 4 crop 41 figures, Step 5 enrich, Step 6 build load_form28.sql.**

### Step 3 result (reconcile) — DONE
- Blind independent second read (image-only, no access to extraction JSON) of all 200 → `verify_block*.json`.
- `reconcile.py --form 28`: **200 AGREE / 0 DISAGREE / 0 no-verify-data.** All 200 stay high-confidence.
- Answer key now TRIPLE-corroborated: extraction read + blind re-read + OCR text layer. Zero disagreements.
- Note (as predicted): for Form 28 the printed answer is NBME-authoritative, so reconcile functioned as
  transcription-QA, not answer-key adjudication — the intended Form-28 behavior.

### Step 4 result (figures) — DONE
- 41 figures cropped from the rendered PNGs to `import/images/form-28/block-NN/qNNNN.png`; `clinical_image_url`
  set on all 41 items (object path `form-28/block-NN/qNNNN.png`).
- **Page PNGs are variable-height** (source screenshots differ in length; e.g. q132 is 4000x2584, not the
  page-1 4000x1834). Cropped from each PNG's true pixel space (bboxes came from sub-agents reading those exact
  PNGs), clamped to bounds — do NOT assume a uniform page height for 29+.
- Owner upload step: put `import/images/form-28/block-NN/*.png` in the private `clinical-images` bucket,
  preserving the `form-28/block-NN/qNNNN.png` path (the `form-28/` prefix prevents cross-form collision).

### Step 2 result (all 200)
- 10/10 blocks CLEAN (count=20, sequential q, answer∈options, on-taxonomy, all high-confidence).
- Answer cross-check (sub-agent vision vs OCR text-layer): **199 AGREE / 0 MISMATCH / 1 OCR-miss**
  (the OCR-miss, q13, was separately confirmed by direct image read). Zero answer disagreements.
- `official_explanation` (D1) present on 200/200; `selected_letter` captured on 161/200 (rest were
  left unmarked by the prior taker — confirmed genuine, not a read miss).
- Sub-agents caught many OCR digit errors against the image (BPs, MCV/platelets, ages, ORs, lab %),
  which is the whole point of the hybrid method's image-verification step.
- **41 figures** (has_figure), **28 needs_image** (item unanswerable without the figure) — Step 4 crop list.
- question_type: mechanism 74 / diagnosis 56 / interpretation 37 / association 22 / next-step 11
  (74 mechanism items is well-aligned with the score-report priority).
- **Minor taxonomy note (non-blocking):** ~10 items got compound/slashed discipline tags
  (e.g. "Neuroscience/Anatomy", "Behavioral Sciences (Biostatistics)"). Free-text per CLAUDE.md, but
  worth normalizing before the custom-block-builder filters on discipline. Recommend a light
  post-pass to canonicalize discipline_tag to the primary discipline.

---

## TL;DR of how Form 28 differs from the pipeline's assumptions
Form 28 is a **much richer source** than the Form-31/Form-20 pipeline was written for. Three
of PIPELINE.md/CLAUDE.md's baseline assumptions are **false for this PDF**, all in our favour
on quality but each changing the procedure:

1. **It has official NBME explanations.** Every page prints "Correct Answer: X.", a full
   explanation paragraph, per-choice "Incorrect Answers" reasoning, and an "Educational
   Objective." CLAUDE.md's extraction rules and `build_form.py`'s own source_explanation
   comment assume *"no official explanation exists for these self-assessment forms"* — that
   was true for Form 20, **false for Form 28.** → Decision D1 below.
2. **It has a text layer** (OCR'd). CLAUDE.md says these PDFs are image-only. The layer is
   real but noisy (mangled digits, stray glyphs from highlights, only 85/200 header bands
   legible). → Usable as a *draft to diff against the image*, never as the source of numbers
   or answers. Method note M1.
3. **The correct answer is printed and authoritative.** Unlike Form 20's fallible blue-letter
   key, Form 28 states the answer as NBME text. This changes what the Step-3 reconcile pass is
   *for* (OCR/transcription QA, not answer-key adjudication). → Decision D2 below.

---

## Step-by-step: ambiguities / silences / wrongness, and resolutions

### Step 0 — environment (silent in PIPELINE.md)
- **Licensed-content near-miss.** A raw `pdftotext` dump written to `import/_form28_textlayer.txt`
  was **not** covered by `.gitignore` (which only ignores `import/pages*/ images*/ out*/ mehlman/`,
  plus `*.pdf`). Bare files under `import/` are exposed. **Fix applied:** all working files go under
  `import/out28/` (ignored). **Rule for 29+:** never write scratch to bare `import/`; use `import/out<form>/`.
- **`.gitignore` already generalizes** (`import/pages*`, `images*`, `out*`) so `out28/`, `pages/`,
  `images/form-28/` are ignored without edits. Good.

### Step 1 — rasterize + count (PIPELINE.md mostly right, two silences)
- **Page geometry differs.** Pages are wide landscape screenshots, native ~1920×880. PIPELINE.md's
  "200 DPI" was tuned for higher-native Form-31 scans; here 200 DPI just upsamples. Rendered at
  **150 DPI** (→ ~4000×1834) — crisp for numbers, and the harness downsamples to ~2000px for reads
  anyway. `pdftoppm -png -r 150 "NBME 28 A.pdf" import/pages/p`. Note for 29+: check native size first.
- **Layout is 1 item per page, not "1–2, variable, spanning page breaks."** Verified the mapping by
  inspecting the header band on all four section boundaries (pages 1/50/51/100/101/150/151/200):
  clean S1I1…S1I50, S2I1…S2I50, S3I1…, S4I50. So **page N == global q_number N**, and
  `block_number = ceil(q_number/20)`. This is cleaner than Form 31 — segmentation is trivial here.
- **Do NOT count items from the text layer.** The teal header band OCRs badly (only 85/200 headers
  legible; `grep -c "Item N of 50"` = 87). Item count is proven by **page count (200) + boundary
  check**, not by header grep. Result: **200 items = 4×50. Matches expected.** ✓

### Step 2 — extraction (method change proposed; NOT yet run — see gate)
- **Proposed method M1 (hybrid, deviates from "vision-only sub-agents"):** seed each item from the
  text-layer text for that page, then **verify every number/unit and the answer against the rendered
  image**, strip prior-taker marks. Rationale: the text layer removes the bulk-transcription burden
  and vision-OCR hallucination risk on long vignettes, while image verification satisfies CLAUDE.md's
  "re-verify every number." Pure vision remains the fallback for figure-bearing / illegible items.
- **Prior-taker marks are richer than documented.** Each item carries THREE overlaid signals:
  (a) yellow highlight on the correct option, (b) a **filled radio = the prior taker's selected
  answer**, (c) a red ✗/✓ by the item number. PIPELINE.md names highlight + radio; the **selected-answer
  radio is a distinct signal the schema has no field for.** On the 3-item sample the filled radio
  disagreed with the printed answer every time (they got them wrong) — so **reading the radio would
  yield the wrong key.** `correct_letter` MUST come from the printed "Correct Answer:" line. Suggest
  optional schema field `selected_letter` (prior taker's pick) so the radio is captured, not confused
  with the key. `highlight_correct_letter` = the yellow-highlighted option (feeds build_form.py's
  agreement check).
- **Figure-dependent items exist** (sample item 2: stem depends on a labeled photograph) → set
  `has_figure` + `figure_page` + `needs_image`. Frequency across 200 unknown until extraction; count TBD.

### Step 3 — reconcile (premise shifts for Form 28)
- PIPELINE.md frames reconcile as answer-key adjudication (Form-20 blue key could be wrong). Form 28's
  answer is **NBME-authoritative**, so a blind re-read mainly catches **our OCR/transcription errors**,
  not key errors. Still worth running (`reconcile.py --form 28`) but expect near-zero "answer-key
  disagreements"; treat disagreements as *transcription* flags. `reconcile.py` itself needs no change.

### Step 4 — figures (namespacing already correct)
- Crop to `import/images/form-28/block-NN/qNNNN.png`; store object path `form-28/block-NN/qNNNN.png`.
  The `form-28/` prefix (added during generalization) is present and correct.

### Step 5 — enrich (grounding is now dual-source)
- Form 28 ships official per-choice reasoning + Educational Objective. That is **higher-authority
  grounding than Mehlman** for this form. Proposal: ground `answer_lock`/`knockdowns` primarily in the
  official explanation, use Mehlman for `high_yield`/`how_they_test`, and keep `"source": "model"`
  honest where neither backs a line. Does **not** relax any enrichment rule (24-word cap etc. stand).

### Step 6 — build SQL
- `build_form.py --form 28 sql` is ready and was proven equivalent to the Form-20 builder during
  generalization. One open item: how `source_explanation` gets the official text — see D1.

---

## Defect: OUT path (found running Step 2 `merge`; blocks the pipeline; fix pending review)
`build_form.py`/`reconcile.py` computed the output dir as `ROOT / "out<form>"` where `ROOT` is
the **script's own directory**. Originally these lived in `import/` so `ROOT/out20 == import/out20`
— correct. The generalization **moved them to `scripts/`**, so `ROOT/out28` resolved to
**`scripts/out28`**, while PIPELINE.md docstrings, `.gitignore` (`import/out*/`), and every path
*message* in the scripts say `import/out28`. Effects:
- `merge`/`sql`/`reconcile` can't find the extracted part files (they're in `import/out28`).
- Latent rule-5 risk: had `scripts/out28` existed, licensed `merged.json`/CSV/`load_form28.sql`
  would have been written into the **un-gitignored `scripts/` tree**.
- Hits **every form**, not just 28 — Form 29 would fail identically.
Fix prepared (re-root to `ROOT.parent / "import" / f"out{form}"` in both scripts; resolves to
`import/out<form>`, matching docs + gitignore, and equal to Form 20's original location so it's
form-safe). Per the "don't patch a shared script mid-run — STOP and get the diff reviewed" rule,
NOT applied-and-run; presented as a diff. **Lesson for the generalization step:** the Gate-5
"SQL equivalence" check compared emitted SQL *bytes* but not the output *path* — moving a script
changes `__file__`-relative bases, which a content diff won't catch. Re-root anything computed
from the script's own location when relocating scripts.

**Status: APPROVED and applied.** This defect lives in the committed `build_form.py` on `main`, so
the fix must flow back: after Form 28 finishes, the path fix commits to `main` **alongside D1/D3**
so the Form 29 worktree inherits a correct, single source of truth. (Owner directive — do not leave
it as a Form-28-worktree-only change.)

## Step 5 (enrich) BLOCKED — tooling not generalized + Mehlman path mismatch (STOPPED for review)
Steps 3 & 4 are done. Step 5 cannot run as-is; four issues, none patchable within the rules without review:

1. **`mehlman_build.py` dir mismatch.** It hardcodes `SRC = ROOT / "Mehlman HY pdfs "` (TRAILING SPACE),
   which matches the main repo. The Form-28 worktree's corpus dir is `Mehlman HY pdfs` (NO trailing space,
   26 PDFs). As-is, `SRC.glob("*.pdf")` finds 0 → an empty index. Fix options: rename the worktree dir to
   add the space (fragile), or make the script robust (strip/try both) — a shared-script change → review.
   `import/mehlman/chunks.json` does not exist yet in this worktree (index unbuilt).
2. **`build_enrich_input20.py` is Form-20-specific** (hardcodes `import/out20`; builds the retrieval query
   from the *unverified student_note* because Form 20 had no official text). Form 28 must instead ground the
   query in the **official explanation + correct-answer text + tags**, and carry `official_explanation` into
   the record. Needs a generalized `build_enrich_input.py --form NN` (form-safe, mirrors the build_form.py
   generalization). Does not exist yet.
3. **`merge_enrichment.py` is block-1/Form-31-specific** (hardcodes `import/out`, block 1, and a **2-way**
   `mehlman`/`model` source check). Owner wants **3-way provenance: official / Mehlman / model.** Needs
   generalization to `--form NN` + a source taxonomy where a fact/scenario cites `"official"` (backed by this
   item's printed NBME explanation), an exact Mehlman `source_label` (backed by a retrieved chunk), or
   `"model"` (ungrounded). Self-lint must report the three buckets separately.
4. **200 enrichments = the highest medical-stakes content step.** CLAUDE.md: owner reviews between steps;
   nothing to DB without physician sign-off + review HTML. This is the right gate to confirm the tooling and
   the provenance convention BEFORE generating 200 items — a wrong mechanism becomes a memorized wrong fact.

Proposed provenance convention (for review): enrichment `high_yield`/`how_they_test` `source` ∈
{`"official"`, `"<Mehlman source_label>"`, `"model"`}. `answer_lock`/`knockdowns` ground primarily in the
official explanation (Form 28's per-choice reasoning is authored by NBME) with Mehlman as secondary; keep
`"model"` honest where neither backs a line. Self-lint reports official/Mehlman/model counts + absolute-word
hits + 24-word cap violations. **Provenance is genuinely different from Form 20** (which had zero official
text → everything was Mehlman-or-model); Form 28 should lean on official text, likely shifting the ratio
heavily toward "official". Flag recorded per owner request.

**Update — three fix diffs PREPARED (compile-checked, `--form` required), awaiting review before any run:**
- `mehlman_build.py`: robust `resolve_src()` (globs `Mehlman*`, picks the dir containing PDFs) + LOUD-FAIL
  (`sys.exit`) if zero PDFs or zero chunks — closes the silent-empty-index risk.
- `build_enrich_input.py --form NN`: generalized; supersedes the Form-31 + Form-20 variants. `official_text()`
  helper is form-safe: official_explanation/source_explanation (Forms 28/31; Educational-Objective-preferred)
  → student_note fallback (Form 20). Discovery: **Form 31 also had official explanations** — only Form 20 didn't.
- `merge_enrichment.py --form NN`: generalized; 3-way provenance (official / Mehlman / model), 24-word cap +
  absolute-word lint, discipline_tag→primary normalization (keeps `discipline_tag_original`), merges
  `enriched_explanation` into `block<N>.merged.json`. Generation contract documented in its header.
The two rewrites can retire the legacy `build_enrich_input20.py` / old `build_enrich_input.py` to `import/_old/`.

### Step 5 result (enrich + self-lint) — STOPPED before sql for owner review
- Mehlman index: 7,407 chunks (26 PDFs). Retrieval coverage: **200/200 items got 4 chunks each** (healthy score
  spread, on-target labels) — verified at the coverage hard-stop before any generation ran.
- 200 items enriched via 20 sub-agents (10 each), grounded in official_explanation (primary) + Mehlman (secondary).
- **Provenance (owner's key signal): official 592 (59%) / Mehlman 386 (38%) / model 25 (2%)** of 1,003 sourced
  facts+scenarios. Official-dominant, Mehlman secondary, model near-zero — the intended Form-28 hierarchy. ✓
- **24-word cap violations: 0** (of 635 high_yield facts).
- **discipline_tags normalized: 12** compound → primary (original kept in `discipline_tag_original`).
- **Verbatim-overlap flags: 9** (8–10 word runs copying official prose — must be reworded; licensed text must not
  enter enriched_explanation). **Absolute-word hits: ~8** (mostly "prevent" → should be "lowers the risk of";
  two literally-true "every/all" that are official-supported).
- **5 Mehlman labels were mis-cited** (not in that item's retrieval pack) → auto-downgraded to "model" by the
  provenance guard (never fabricated). Included in the 25 model.
- Remediation pending owner direction: reword the ~17 flagged fields (verbatim + absolutes), re-lint, then sql.
- One-off tooling footgun found: merge_enrichment's `enrich_block*.json` glob also matched intermediate
  `_part` files → moved parts to `import/out28/_parts/`. Recommend hardening the glob to `enrich_block<digits>.json`
  for Form 29 (flagged, not patched mid-run). Also: one sub-agent (q171–180) nested the 5 sections under an
  `enriched_explanation` key; flattened deterministically before merge. Consider adding a shape-check to the enrich prompt.
- Physician-attention items the enrichers flagged: q86 (sildenafil PDE5→↑cGMP, corrected NBME's loose "↑NO"),
  q162 (BPH transition zone vs official "central zone" — labeled model). Both honestly flagged, not silently changed.

### Step 5 remediation + Step 6 (sql) — DONE; STOPPED before hand-load
- Reworded all 9 verbatim overlaps + the disallowed absolutes (mostly "prevent"→"lowers the risk of"); Q143's
  "every drug of abuse ↑ dopamine" kept and marked `absolute_ok` (officially supported; reason stored on the
  entry) via a new merge_enrichment exception. Re-lint: **0 verbatim / 0 disallowed absolutes / 1 accepted (Q143)**.
- 5→4 mis-cited Mehlman labels (Q21/Q75×2/Q179) left as `model` per owner (honest, not re-grounded).
- Final provenance: **official 592 (59%) / Mehlman 386 (38%) / model 25 (2%)**; 0 cap violations; 12 disciplines normalized.
- **Disputes routed to physician review** (q86, q162): `import/out28/form28_review.html` surfaces both prominently
  with NBME-official vs enricher claim side by side + an adjudication control. Review HTML also has: localStorage
  keyed to enrichment version `form28-enrich-18a78db508`, version stamped into the export, source label inline per item.
  (Generated by the gitignored `import/out28/_gen_review.py`; a generalized `gen_review_html.py --form` is a future step.)
- **`load_form28.sql`** built to `import/out28/` (gitignored): 200 inserts, 200 enriched (`$enr$`×400),
  source_explanation = official text (D1), `on conflict (nbme_form, q_number)`. NOT run — owner hand-loads.
- Two tooling footguns to harden for Form 29 (flagged, not patched mid-run): merge_enrichment's `enrich_block*.json`
  glob also matched `_part` files (moved parts to `_parts/`); one enricher nested the schema under
  `enriched_explanation` (flattened deterministically). Add a glob tightening + an enrich-output shape-check.

### Scripts changed this run (flow to main separately, per owner): build_form.py + reconcile.py (--form generalize
+ out-path fix + D1/D3), mehlman_build.py (robust resolver + loud-fail), build_enrich_input.py (--form generalize;
supersedes _20), merge_enrichment.py (--form + 3-way provenance + verbatim + absolute_ok). Legacy build_enrich_input20.py
quarantined to import/_old/. Nothing committed.

## Anomaly resolved: block-2 selected_letter all null
Re-inspected block-2 pages (q22/q29/q35) at 300 DPI against a block-1 control (q3, known filled
radio). Block-1 fills render as a solid grey center; block-2 radios are all clean hollow rings.
**Conclusion: genuinely unmarked by the prior taker — NOT a reading failure.** The method reads
radio fill state correctly in both directions (fills detected in block 1, correctly none in
block 2), so figure/vignette reading on the same method is not implicated. `selected_letter` is
populated where marked, null where not — expected, non-blocking, doesn't touch `correct_letter`.

## DECISIONS — RESOLVED
- **D1** — source_explanation precedence: **approved option B** (official_explanation → student_note
  → placeholder). Implemented, additive + form-safe (Form 20 byte-identical). Awaiting only the
  bundled path-fix review before first run.
- **D2** — extraction method: **hybrid confirmed** (text-layer seed → verify every number + the
  printed answer against the image → strip prior-taker marks). Used for blocks 1–2.
- **D3** — `selected_letter`: **added**, captured separately in the schema and surfaced in the
  review CSV only; never influences `correct_letter` (isolation confirmed; absent from the INSERT).

## (historical) decisions that were needed before Step 2

**D1 — `source_explanation` for a form that HAS official explanations.**
`build_form.py cmd_sql` populates `source_explanation` from `student_note` else a placeholder
(*"no official explanation provided"*). Form 28 HAS the real official explanation. Options:
  - (A) Put the official explanation text into the JSON `student_note` field so the **unchanged**
    script stores it as `source_explanation`. Works today, but the field name lies.
  - (B) Approve a tiny script change: read an `official_explanation` field (fall back to student_note
    → placeholder). Cleaner, but per CLAUDE.md I do **not** patch the script without sign-off.
  - (C) Keep the placeholder; use official text only as enrichment grounding, not stored in the row.
Recommend **B** (honest field, one-line change, reviewed by you). Until you pick, Step 2 is paused.

**D2 — Method M1 (text-layer-seeded, image-verified) vs strict vision-only.**
M1 is faster and, with mandatory image number-verification, at least as accurate. Confirm M1, or
require pure vision per the letter of PIPELINE.md.

(Optional D3 — add `selected_letter` to capture the prior taker's radio pick, kept separate from
the key. Nice-to-have for later "why did she/he miss it" analytics; not blocking.)

---

## What is safe and done
- All 200 pages rendered → `import/pages/p-001..200.png`.
- Page↔item↔section↔block mapping proven (1:1 sequential).
- 3-item hand-verified sample (numbers + the radio-vs-printed trap) in
  `import/out28/_sample_verification.md` (gitignored) for your spot-check.
- No DB writes. Nothing committed. Old Form-20 scripts remain quarantined in `import/_old/`.
