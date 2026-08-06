# Form 24 extraction notes — where PIPELINE.md / RUN_NEXT_FORM.md met reality

Records every point where the Form-28-flavored runbook was wrong/silent for `import/NBME 24 A.pdf`.
**No licensed content** (no vignette text, no lab numbers, no q→answer mappings) — tracked in git.

Status: **Gate 1 (item count after rasterize) reached. STOPPED for owner review.** Nothing extracted,
nothing enriched, no DB write, nothing committed.

---

## HEADLINE: Form 24 is a CBSSA form (Form-20 family), NOT a Form-28 family form

The runbook's known-good numbers are all Form 28, which has authoritative official NBME explanations.
**Form 24 does not.** It behaves like Form 20 (see `nbme-form20-practice-pipeline` memory):

- Title band reads **"Comprehensive Basic Science Self-Assessment" (CBSSA)** on every page.
- **No "Correct Answer:" line** (`grep -icE "Correct Answer"` = 0 real hits). The runbook's hard rule
  "read correct_letter from the printed 'Correct Answer:' line" **cannot be followed literally** — that
  line does not exist on this form.
- The answer key is a **blue handwritten student annotation** ("D. Page 157/162 of FA2019…") at the top
  of each item's note area — **fallible** (Form-20 memory: the blue key can be wrong).
- **No official NBME explanation.** Each item carries an informal student note (FA page refs + reasoning),
  not NBME per-choice reasoning. → `source_explanation` falls back to `student_note` (build_form.py D1 path).

> ⚠️ **KEY IS NOT AUTHORITATIVE (owner directive, record at load time).** Unlike Form 28 (NBME-authored
> answers), Form 24's `correct_letter` is a **prior test-taker's blue-pen guess** and can be wrong. It is
> marked fallible (`answer_source: "student_blue_key"`, `answer_authoritative: false`) on every row, and the
> load SQL header states this. **Deepika must run her clinical eye over this form's key before it is trusted
> as a diagnostic.** Any blind-re-read disagreement (Step 3) is a *key* dispute → physician adjudicates.

**Downstream consequences (expected divergences, not failures):**
- **Step 3 reconcile = real answer-key ADJUDICATION** (a blind re-read disagreeing means the KEY may be
  wrong → physician adjudicates), not Form-28 transcription-QA. `reconcile.py` unchanged; `answer_confidence`
  low on disagreement.
- **Step 5d provenance will be Mehlman/model-dominant, NOT official-dominant.** Form 28 was official 59% /
  Mehlman 38% / model 2%. Form 24 has zero official text, so Gate-3 provenance **will legitimately differ**
  from the Form-28 baseline. Do not treat that as a lint failure.

## Step 1 — geometry differs from Form 28
- Native page size **1031 × 657 pt**. At 150 DPI that is only ~2149 px wide (too soft for lab numbers).
  Rendered at **300 DPI → 4298 × 2740 px** (the runbook's ~4000px-wide target). Pick DPI from native size.

## Step 1 — segmentation is NOT Form-28's clean 1 item / page / in-order
`pdfinfo` = **201 pages**, but the text layer has **200 "Item N of 50" headers** and the item count is 200.
Reconstructed the true page→(section,item) map (`import/pages/_itemmap.json`) and **verified it tiles the
full 4×50 grid exactly once** (0 missing / 0 extra / 0 dup; 10 blocks × 20). Segmentation rules that differ:

1. **The blue header band is often STALE** — it shows the *previous* item's "Section S: Item I" while the
   vignette below has already advanced. Trust the **printed body number** ("34." at the start of the
   vignette), not the header item number. (Stale-header pages: 135 = S3 I34, 144 = S3 I43, 158 = S4 I7.)
2. **One item spans two pages**: S1 Item 37 (q37) = pages 87 **and** 88 (page 88 = its options + answer,
   with no fresh header). This is the 201st page.
3. **Pages are out of capture order** (two SVC session ids + one no-SVC block are interleaved). Physically,
   S2 Item 37 (q87) sits at **page 37**, far from the rest of section 2. Extraction must be driven by the
   `_itemmap.json` page lists, **never** by "page N = q_number N" (true for Form 28, false here).
4. **Section digit** is taken from the header band (reliable even when stale, since a stale header is the
   previous item — same section; the one cross-section page, p37, correctly reads its own S2).
5. p122 (S3 I21) body number did not parse from the text layer (figure/table item) — header item used;
   **verify its number visually during extraction.**

`q_number = (section-1)*50 + item`, `block_number = ceil(q_number/20)` — same formula as always; only the
page→item map is non-trivial here.

## Step 2 result (extraction) — DONE
- 200 items extracted via 20 sub-agents (10 items each), hybrid image-read. **10/10 blocks merge CLEAN**
  (count=20, sequential q, answer∈options, on-taxonomy) — matches Form 28's 10/10.
- `correct_letter` read from the **blue student annotation** on every item; captured `answer_source:
  "student_blue_key"`, `answer_authoritative:false`. NO official_explanation (CBSSA); `student_note`
  holds the prior taker's informal reasoning (→ source_explanation fallback).
- **27 figures** (`has_figure`), **18 `needs_image`**. Sub-agents correctly rejected the many pasted
  prior-taker STUDY-AID graphics (First-Aid/UWorld diagrams, even a meme photo) as non-figures.
- question_type: mechanism 77 / interpretation 38 / diagnosis 40 / association 25 / next-step 20
  (77 mechanism items aligns with the score-report priority). discipline top: Pathology 38 / Physiology 36.

## Step 3 result (reconcile — answer-key ADJUDICATION) — DONE
- Blind independent second read (image-only, no extraction access) of all 200 → `verify_block*.json`.
- `reconcile.py --form 24`: **200 AGREE / 0 DISAGREE / 0 no-verify-data.** All high-confidence.
- ⚠️ **What this does and does NOT mean:** AGREE means the fallible blue key was *transcribed* correctly
  (two blind reads got the same letter). It does NOT mean the key is medically right. Cases where the
  prior taker's own written reasoning CONTRADICTS their blue letter are the real "key may be wrong" flags —
  reconcile cannot catch these (both reads see the same letter). Compiled separately:
  **`import/out24/physician_review_key_disputes.csv` — 12 items** (5 CONFLICT: q7,q52,q136,q149,q159;
  2 INFERRED-letter: q46,q116; 3 SOFT: q68,q74,q98; 2 DATA: q32 printed-OR form error, q17 gene typo).
  **Deepika must adjudicate these before the key is trusted as a diagnostic.**

## Step 4 result (figures) — DONE
- 27 figures cropped from the rendered PNGs → `import/images/form-24/block-NN/qNNNN.png`; `clinical_image_url`
  set on all 27; every `needs_image` item has an image. Cropped from each item's TRUE page via `_itemmap.json`
  (the agents' `figure_page` field was unreliable — e.g. q160 mislabeled "page 1"). q30 re-cropped after a
  visual montage check caught a clipped bbox. Owner uploads to the private `clinical-images` bucket, path
  `form-24/block-NN/qNNNN.png`.

## Step 5a/5b result — DONE
- Mehlman index: **7,407 chunks / 26 PDFs** (matches Form 28). `build_enrich_input.py --form 24`:
  **200/200 items = 4 chunks each = 100% retrieval coverage** (score spread min 8.2 / med 22.8 / max 83.1).
  Query grounded in student_note + correct-answer text + tags (no official text on this form).

## Step 5c/5d result (enrichment + self-lint) — DONE
- 200 items enriched via 20 sub-agents (10 each). Grounding = Mehlman (primary) + model (first-principles);
  **no `official` source exists** on this form. student_note used only as a fallible hint, never cited/copied.
- **Provenance: official 0% / Mehlman 55% (528) / model 44% (423)** of 951 sourced facts+scenarios. This
  DIVERGES from Form 28's official-dominant 59/38/2 — **as expected and owner-pre-approved for a CBSSA form
  with no official text.** Model share is higher than an official-bearing form because the Mehlman corpus
  doesn't cover every Form-24 topic; enrichers used `model` HONESTLY rather than fabricate Mehlman labels
  (CLAUDE.md #3). Per the `nbme-provenance-balance-ok` ruling, model share is the metric — 44% here is the
  honest floor given retrieval matches, not a grounding failure.
- **Self-lint CLEAN: 0 disallowed absolutes, 0 cap violations (of ~600 high_yield facts), 0 verbatim, 0
  invalid/fabricated sources.** (Raw first pass had 3 "prevent" absolutes — Q71/Q80/Q110 — reworded to
  "reduce"/"lowers the risk of"/"act before" and re-linted to 0. Enrichers also self-caught several during
  generation: "prevents"→q10/q83/q109, "never"×4 q151, "always" q198, "almost always" q33.) 2 disciplines
  normalized compound→primary.
- **Fallible-key second-check outcome: all 12 pre-flagged keys INDEPENDENTLY CONFIRMED correct — 0
  key_disputes raised.** In each flagged case the prior taker's *note reasoning* was the flawed part, not the
  keyed letter; enrichers wrote the correct mechanism without propagating the note's error. Examples they
  fixed: q15 (note blamed peripartum cardiomyopathy → correct physiologic flow murmur), q72 (note "VSD" →
  actually Tetralogy of Fallot; key D still right), q181 (phantom limb ≠ "psychological stress"), and q186
  (a Mehlman *chunk* said ciguatoxin "blocks" Na channels — backwards; enricher wrote the correct "opens"
  and sourced it `model`). The 12 remain in `physician_review_key_disputes.csv` for Deepika's final eye.

## Step 6 result (build SQL) — DONE
- `build_form.py --form 24 sql` → `import/out24/load_form24.sql` (gitignored): **200 inserts, 200 enriched**,
  27 `clinical_image_url` object paths, `on conflict (nbme_form, q_number) do nothing`. Matches Form 28's
  200/200. `source_explanation` = the prior taker's student_note (D1 fallback; no official text on this form).
- **Non-authoritative-key WARNING stamped into the SQL header** (owner directive): a prominent comment block
  states Form 24's key is a fallible prior-taker guess, transcription is triple-corroborated but medical
  correctness is NOT, points to the 12-item `physician_review_key_disputes.csv`, and says Deepika must review
  the key before the form is trusted as a diagnostic. Validated: 1 begin / 1 commit / 200 inserts / 200
  conflict guards / no non-comment line before begin.

## Pipeline complete through Step 6. Remaining = owner-by-hand (PART C): upload 27 figures to the private
## clinical-images bucket (path form-24/block-NN/qNNNN.png), run load_form24.sql, run the 4 verify queries.

## What is safe and done
- All 201 pages rendered → `import/pages/p-001..201.png` (300 DPI). Gitignored.
- Page→item map reconstructed and grid-verified → `import/pages/_itemmap.json`. Gitignored.
- Steps 1–6 complete: 200 items extracted (CLEAN), reconciled (200/200 AGREE), 27 figures cropped+wired,
  200 enriched (lint CLEAN), load_form24.sql built with the non-authoritative-key warning.
- **No DB writes. Nothing committed.** All licensed outputs under gitignored `import/out24/` + `import/images/`.
  Only tracked file touched: this notes file (no licensed content).
</content>
</invoke>
