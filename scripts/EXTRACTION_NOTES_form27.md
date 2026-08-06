# EXTRACTION_NOTES — Form 27 (NBME 27 A)

Structural findings only. **No licensed content** here (no vignette text, numbers, or
q→answer mappings) — this file is git-tracked. Mirrors the style of
`EXTRACTION_NOTES_form28.md`: record where this form's reality differed from the pipeline
assumptions so the next run isn't surprised.

## What kind of form this is
- **CBSSA** ("Comprehensive Basic Science Self-Assessment"), like Form 20 — BUT unlike Form 20
  it **prints an authoritative "Correct Answer:" line, a full official NBME explanation, an
  "Incorrect Answers" section, and an "Educational Objective"** on every item (like Form 28).
  So for the answer key it behaves like Form 28 (printed answer is authoritative;
  reconcile = transcription QA, not key adjudication), and enrichment can ground in
  `official_explanation` exactly as Form 28 did.
- **Has a text layer**, but it is **duplicated/garbled** (a watermark artifact): the phrase
  "Correct Answer" OCRs ~2× per page, and the teal "Item N of 50" header is present as text on
  only ~half the pages. **Do not count items or derive the map from the text layer** — it is
  contaminated. Use page renders + heights (below).

## Geometry / DPI (deviation from Form 28)
- Native embedded image is **1440×829 px** (even lower-native than Form 28's ~1920×880).
- PDF page size 1440×829 pts. Rendered at **200 DPI** → ~4000×~2000–2900 px (variable height),
  hitting the runbook's ~4000px target. (Form 28 used 150 DPI on a higher-native scan; 200 DPI
  here is an intentional choice to maximize pixels for number re-verification since native is
  low. Documented per RUN_NEXT_FORM Step 1 "pick DPI from native size".)
- Page renders are **variable height** (min ~1945 px, max <3600 px). Crop figures in each PNG's
  true pixel space (same caution as Form 28).

## Item structure — DIVERGES from Form 28 (200 clean pages, 1 item/page, page==q_number)
- **198 pages, exactly 1 item per page** (verified: 0 pages taller than 3600 px, i.e. no page
  holds two items; shortest pages ~1945 px are genuine short single items, not dividers).
- **4 sections, but two item numbers are OMITTED from the form's own numbering:**
  - Section 1 = pages 1–49 → items 1–28, **30–50** (item **29 is absent**; verified p28="Item 28",
    p29="Item 30", p30="Item 31") = **49 items**.
  - Section 2 = pages 50–99 → items 1–50 = **50 items** (pure 1:1).
  - Section 3 = pages 100–149 → items 1–50 = **50 items** (pure 1:1).
  - Section 4 = pages 150–198 → items 1–**49** (item **50 is absent**; last page p198="Item 49",
    and there is no page 199) = **49 items**.
  - **Total = 49 + 50 + 50 + 49 = 198 items.**
- **Consequence for q_number:** do NOT use `(section-1)*50 + item_number` (it would leave holes
  at q29 and q200 and break `build_form.py merge`'s contiguous-block validation). Instead number
  **q_number = PDF page number, contiguous 1..198** (1 item/page makes this exact). Then
  `block_number = ceil(q_number/20)`.
- **Short final block:** block 10 = pages 181–198 = **18 items** (not 20). `build_form.py merge 10`
  will warn "expected 20 items, got 18" and flag the q-sequence — this is the *expected* short
  final block (PIPELINE.md Step 5 / owner gate), NOT an error. Blocks 1–9 are full (20 each).

## Prior-taker marks to strip (same as Form 28)
- Correct option is **yellow-highlighted**; a **red ✗** sits next to items the prior taker missed.
  Both are spoilers — strip. `correct_letter` comes from the printed "Correct Answer:" line only.
- Some items have **6+ options (A–F, up to A–I)**, e.g. collagen-type and extended-matching items.
- Figures present (x-rays, graphs, etc.) → `has_figure`.

## Item count is 198 (block 10 short by design)
Item 29 (Section 1) and Item 50 (Section 4) are genuinely omitted from the form (verified
visually), so q_number = contiguous PDF page 1..198 (NOT `(section-1)*50+item`). **Block 10 holds 18
items (q181–198), not 20 — short by design; `build_form.py merge 10` warns "expected 20, got 18"
and that warning is CORRECT — do not suppress it or patch the validator.** The load SQL's trailing
comment records the expected 198 / 10-block / short-block-10 counts.

## Gate 3 provenance: 16% model is expected here, not a grounding failure
Final enrichment provenance was **official 32% / Mehlman 51% / model 16%** (892 sourced
facts+scenarios), vs Form 28's official 59 / Mehlman 38 / model 2. The high model share is because
Mehlman retrieval, though at 100% coverage / 4 chunks per item, was **frequently tangential to Form
27's specific tested points** — so supplementary facts fell back to the official explanation or an
**honestly-labeled `model`** rather than a fabricated Mehlman label. The mechanism-critical fields
(`answer_lock`, `knockdowns`) are officially grounded; `model` is confined to supplementary
`high_yield`/`how_they_test`. Owner ruling (same as Form 25): **accept** — balanced/model-inclusive
split is fine when the hard-lint is clean (0 cap / 0 verbatim / 0 absolutes / 0 invalid labels) and
model stays out of the answer mechanism. Not a grounding failure; it reflects corpus coverage.

## Verify-agent labeling drift (pages ~165–170 especially)
The blind-verify sub-agents reading 20 sequential page PNGs repeatedly lost per-page↔q_number
alignment (an off-by-one *labeling* shift), producing spurious reconcile "disagreements" whose answer
*distributions* still matched extraction exactly. Extraction pins `correct_letter`+highlight to the
same page image and agreed 198/198 (highlight==printed answer). Fix that worked: re-run verify in
**10-page chunks with explicit per-file→q_number pinning** ("ignore the Item-N-of-50 header"). Six
residual q165–170 disputes were adjudicated by direct image read of the printed "Correct Answer:"
line — all confirmed extraction. Net: **0 genuine answer-key errors**; all 198 high-confidence.
