# Form 32 extraction notes — where the pipeline met reality

Records where `RUN_NEXT_FORM.md` / `PIPELINE.md` assumptions differ for **NBME Form 32**.
**No licensed content** (no vignette text, no numbers, no q→answer mappings) — tracked in git.
Companion to `EXTRACTION_NOTES_form28.md`. (Form 32 was swapped in after Forms 26 and 23 were
found to be spoiled answer-annotated decks — see `EXTRACTION_NOTES_form26.md`.)

## ⚠️ ANSWER KEY IS COMMUNITY/AI-SOURCED — NOT NBME-AUTHORITATIVE
The Form-32 **question** source (`Nbme 32 Q.pdf`) is a clean, image-based, UNANSWERED qbank
export (coursology app) — no inline answers, no explanations, no prior-taker marks. **There is
no official answer key.** The only answer source on disk (`NBME 32 A.pdf`) is a separate
**community/likely-AI-generated** document ("NBME FORM 32 ANSWERS" + "Mini explanation").
Per owner directive (Option A):
- The AI key is a **HYPOTHESIS, never ground truth.** `correct_letter` is seeded from it but
  every item is cross-checked by a **mandatory blind independent re-read** (agent solves each
  item from the image alone, no key). Agree → high confidence; disagree → flagged for physician.
- The AI "Mini explanations" are **UNTRUSTED**: never labeled `"official"` (that label is
  reserved for real NBME text, which this form has none of), and **never used for enrichment
  grounding**. Enrichment grounds in **Mehlman + model only** (Form 20/24 mode).
- **The physician must validate the key before it is trusted as a diagnostic.** This warning is
  also stamped into `load_form32.sql`.

## How Form 32 differs from the pipeline's assumptions
1. **Image-based, no text layer** (unlike Form 28's noisy OCR layer). Extraction is **vision-only**
   (not the Form-28 hybrid text-seed method).
2. **225 pages ≠ 200 items.** Every page is an item page (no title/divider/instruction slides),
   but **24 items span 2–3 pages** (figure/table continuation screenshots). Page→item map is
   derived from the "Item M of 50 / Question Id" headers → `import/out32/page_map.json`
   (validated: 200 items, 4 sections × 50; qid 1–200 contiguous; every anchor confirmed).
   DPI: native 2752×2064 → **105 DPI** (~4000px wide).
3. **AI key is messy/fallible** (parsed defensively): mixed formats, self-flagged uncertain
   entries ("?D"), extended-match letters beyond F (G/H), and **4 items with no usable key
   answer** (empty / missing / "Xxxx" placeholder / no-letter-after-calculation). Those 4 use
   the blind read as the sole source and are flagged low for the physician.

## Pipeline deviations (Form-32-specific tooling, NOT modifications of shared scripts)
- `answer_key_parsed.json` — parsed AI key (196/200 usable letters; 4 no-key; 2 self-uncertain).
- Extraction agents write content **blind to the answer** to `import/out32/_raw/`; a deterministic
  assembler injects `correct_letter` (key hypothesis, or blind for the 4 no-key) → part files.
- Blind re-read → `verify_block*.json`; `reconcile.py --form 32` stamps high/low from key-vs-blind.
- `form32_ADJUDICATE.csv` — Form-32 post-pass: forces the 4 no-key items to low, caps the 2
  self-uncertain, and lists all physician-adjudication items. (New script, `reconcile.py` untouched.)

## Gate results vs Form-28 known-good
- **Gate 1 (item count):** 200 (4×50) — **MATCH** (Form 28: 200). Layout diverges (225 pages,
  24 multi-page items) but count matches.
- **Blind re-read gate (Form-32-specific, STOP if >10% disagree):** **5.6% (11/196) — PASS.**
  189 agree / 11 disagree. Final answer_confidence: 184 high / 1 medium / 15 low. 16 items to
  physician (10 key-vs-blind disagreements, 4 no-key, 2 key-uncertain). Several disagreements
  look like genuine AI-key errors — exactly what the blind read is for.
- **Mehlman index:** 7,407 chunks from 26 PDFs — **MATCH** (Form 28: 7,407).
- **Gate 2 (retrieval coverage):** **199/200 (99.5%) — DIVERGE** (Form 28: 200/200). One item
  (q192, single-word answer "Enterovirus" + tags, no official text to enrich the query) got 0
  chunks. Cause is structural: Form 32 has no official explanation to strengthen the retrieval
  query, so single-word-answer items occasionally miss. **Owner accepted** the one item as a
  model-only enrichment (honestly labeled, textbook topic) — no rule loosened.
- **Gate 3 (self-lint provenance):** quality lint **CLEAN — MATCH** (0 cap violations / 0 verbatim
  overlap / 0 disallowed absolutes, after rewording 7 flagged absolutes — same remediation Form 28
  needed). Provenance **official 0% / Mehlman 34% / model 65% — DIVERGE by design** (Form 28 was
  official-dominant). Model-heavy is the expected consequence of no official text + thin retrieval;
  owner pre-approved Mehlman+model for this form. Physician review of the model content is advised.

## Figures
32 figure/needs_image items. Extraction recorded figure_page/desc but NOT pixel bboxes, so a
separate bbox pass collected tight boxes → cropped from the 4014×3010 page renders to
`import/images/form-32/block-NN/qNNNN.png`; `clinical_image_url` (object path) set on all 32.

## Final deliverable
`import/out32/load_form32.sql` — 200 inserts, 200 enriched, 32 clinical_image_url, `on conflict
(nbme_form, q_number)`. source_explanation is the placeholder (AI mini-explanations NOT stored).
**Header stamped** with the community/AI-key warning + the 16 physician-adjudication q_numbers +
the provenance split. NOT run — physician must validate the key + sign off before any hand-load.

## Status
COMPLETE through Step 6 (load SQL built). All gates cleared/owner-accepted. No DB writes, nothing
committed. Remaining (owner/physician, by hand): validate the 16 adjudication items + model-heavy
enrichment via review HTML → upload the 32 figures to the private bucket → run load_form32.sql →
run the verify query in the SQL footer (expect 200 rows / 200 enriched).
