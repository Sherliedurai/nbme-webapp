# Form 25 extraction notes — where PIPELINE.md met reality

Second form through the generalized pipeline (after Form 28). Records where the pipeline was
ambiguous/silent for `import/NBME 25 A.pdf`, and the physician-attention items the enrichers
surfaced. **Contains no licensed content** (no vignette text, no numbers, no q→answer mappings) —
tracked in git. Status: **carried through Step 6; `import/out25/load_form25.sql` built (200/200
enriched). Nothing written to any DB; nothing committed. Physician review of enrichment pending
before hand-load.**

## TL;DR — Form 25 is structurally a twin of Form 28
Same CBSSA "Comprehensive Basic Science Self-Assessment" layout as Form 28, so all Form-28
decisions (D1/D2/D3, hybrid M1 extraction, official-explanation grounding) applied unchanged:
- **200 pages = 4 sections × 50, one item per page, page N == global q_number N.** Boundaries
  verified at pages 1/50/51/100/101/150/151/200 (all clean). Native **1920×1002 pt** → rendered
  **150 DPI** (~4000px wide, variable height), same as Form 28.
- **Official NBME explanations present** on every page ("Correct Answer: X.", full explanation,
  per-choice Incorrect-Answers reasoning, Educational Objective). Captured verbatim into
  `official_explanation` → stored as `source_explanation` (D1).
- **Text layer present and cleaner than Form 28** (198/200 "Item N of 50" headers legible vs
  Form 28's 85/200). Used only as an M1 seed; every number + the printed answer verified against
  the image. Note: the printed answer OCRs as `Correct Answer : X .` (spaces around the colon;
  q199 rendered the colon as a period) — a regex cross-check must allow `Correct\s*Answer\s*[:.]`.

## Gate results vs Form-28 known-good
- **Gate 1 (count):** 200 pages, boundaries 1:1 — MATCH.
- **Step 2 (extract):** 10/10 blocks merged CLEAN. Answer cross-check (extraction vision vs OCR
  text layer): **199 AGREE / 0 MISMATCH / 1 OCR-miss** (q199, colon→period; letter itself agrees)
  — essentially identical to Form 28. Hybrid M1 caught many OCR digit errors against the image
  (BPs, ages, temps, lab counts) — the point of the image-verify step. `selected_letter` populated
  on **0/200** here (prior taker highlighted the correct option every time but left no filled
  radios — differs from Form 28's 161/200; confirmed genuine, not a read miss).
  question_type mix: mechanism 70 / diagnosis 48 / interpretation 38 / association 35 / next-step 9.
  **35 figures** (has_figure), **16 needs_image**.
- **Gate 2 (retrieval):** Mehlman index 7,407 chunks / 26 PDFs (identical). **200/200 items got 4
  chunks = 100% coverage** — MATCH.
- **Step 3 (reconcile):** blind independent second read of all 200 → **200 AGREE / 0 DISAGREE /
  0 no-verify-data.** Answer key triple-corroborated (extraction + blind re-read + OCR). MATCH.
- **Step 4 (figures):** 35 cropped from the rendered PNGs to `import/images/form-25/block-NN/qNNNN.png`;
  `clinical_image_url` set on all 35; all 16 needs_image items have a crop.
- **Gate 3 (self-lint provenance):** after one remediation pass (see below) — **0 verbatim / 0
  disallowed absolutes / 0 cap violations / 1 accepted absolute** (q156, 100% penetrance "every",
  `absolute_ok`). CLEAN.

## The one divergence from Form 28: provenance is BALANCED, not official-dominant
- Form 25 final provenance of high_yield+how_they_test sources: **official 430 (48%) / Mehlman
  422 (47%) / model 29 (3%)**. Form 28 was **official 59% / Mehlman 38% / model 2%**.
- **Model share (the quality-critical bucket) matches** (3% vs 2%) — grounding did not fail.
  The difference is only in which of two *valid* grounded sources was cited: Form 25 enrichers
  cited a Mehlman chunk whenever one genuinely matched and fell back to the official text
  otherwise — squarely within the Form-28 convention (Mehlman is the intended source for
  high_yield/how_they_test; official is primary for answer_lock/knockdowns). Not a correctness
  issue. Contributing factor: wave-1 prompt phrasing leaned "Mehlman-where-it-matches"; wave-2
  leaned "prefer official" — the aggregate landed ~50/50. Flag for owner awareness, not a defect.

## Remediation pass (identical loop to Form 28's)
Raw first lint: **10 verbatim-overlap flags + 3 disallowed absolutes.** Reworded all 13 fields in
the `enrich_block*.json` source files (broke the ≥8-word runs vs official prose; "prevent"→"lower
the risk of"/"mitigate", "every other option"→"the other options") and re-ran the merge → clean.
No rule was relaxed (CLAUDE.md #2). Verbatim hits clustered on anatomical drainage lists (q129
lymph nodes) and definitional prose (q63 carboxylation, q74 CSD histology, q179 partial agonist).

## Physician-attention items the enrichers flagged (surface in the review HTML before hand-load)
Honestly flagged, not silently changed — topic-level only:
- **q3 (CaSR):** the official Incorrect-Answers text states a loss-of-function CaSR mutation
  "would cause hypoparathyroidism" — physiologically backwards (inactivating CaSR = familial
  hypocalciuric hypercalcemia). Enricher wrote the medically correct knockdown and flagged the
  deliberate divergence.
- **q185 (urea cycle):** official distractor prose repeatedly says "increased citrulline" while the
  case shows *decreased* — transcribed verbatim as-is (extraction), noted for review.
- **q26 (foscarnet):** enricher named the pyrophosphate-binding site to disambiguate from
  "pyrophosphatase" — beyond the official text; standard pharm, quick verify.
- **model-sourced facts (29 total, ~3%):** e.g. q98 hypoglycemia unawareness, q164 regression-to-
  mean, q179 partial-agonist drug examples — ungrounded, honestly labeled `model` for scrutiny.

## Two tooling footguns (both handled by hand this run, as Form 28 predicted)
1. **Merge glob over-match:** enrichment ran as 2×10 sub-agents → `enrich_blockN_partK.json`.
   Combined each block's two parts into one clean `enrich_blockN.json` and moved the parts to
   `import/out25/_parts/` BEFORE the merge, so `merge_enrichment.py`'s `enrich_block*.json` glob
   matched exactly 10 files. Still unpatched in the script; still needs the manual guard.
2. **Nested schema:** explicitly instructed the q171–180 agent (Form 28's offender) to lay fields
   flat; a post-hoc nested-schema scan across all 20 parts found 0 hits.

## Minor, non-blocking (same class as Form 28's note)
- **Discipline-tag variants** that would fragment the custom-block filter: `Biostatistics` (4) vs
  `Biostatistics & Epidemiology` (3); `Biochemistry` (13) vs `Biochemistry & Nutrition` (1);
  `Anatomy` (24) vs `Anatomy (Embryology)` (1); one `Histology`. `merge_enrichment.py` only
  normalizes when `primary_discipline` differs from `discipline_tag`; here agents set the compound
  string as primary, so nothing was folded. Recommend a light canonicalization pass keyed to the
  block-builder's discipline vocabulary before that feature ships. Free-text per CLAUDE.md.

## What is safe and done
- 200 pages rendered; page↔item↔section↔block mapping proven 1:1. All 10 blocks merged CLEAN.
- Answer key triple-corroborated (200/200). 35 figures cropped + wired. 200/200 enriched, lint clean.
- `import/out25/load_form25.sql` built: 200 inserts, 200 enriched, `on conflict (nbme_form, q_number)`.
  NOT run — owner hand-loads after physician review of the enrichment. No DB writes. Nothing committed.
