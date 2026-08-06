# Form 29 extraction notes — where the pipeline met reality

Records every point where the pipeline (`PIPELINE.md` / `RUN_NEXT_FORM.md`, tuned on Forms
28/31/20) was ambiguous, silent, or wrong for `import/NBME 29 A.pdf`. **No licensed content**
(no vignette text, no numbers, no q→answer mappings) — tracked in git.

Status: **COMPLETE through Step 6. `import/out29/load_form29.sql` built (199 inserts / 199 enriched).
Nothing loaded to DB, nothing committed. Owner hand-loads (Part C).**

## RUN SUMMARY (Form 29 vs Form-28 known-good)
- **Step 1 rasterize:** 199 pages @200 DPI (2200×1700, rotated landscape). **Diverges: 199 items, not 200.**
- **Step 2 extract (pure vision — no text layer):** 199 items, 9 blocks CLEAN + block 10 warns (19 items,
  q185 gap — surfaced, not suppressed, per owner). official_explanation 199/199; answer_confidence all high;
  every yellow highlight == printed answer; selected_letter 0/199 (prior taker used red ✗ only, no filled
  radios — benign divergence from Form 28's 161). question_type mechanism-heavy (mech 79 / dx 41 / interp 37 /
  assoc 35 / next 7).
- **Step 3 reconcile (blind 2nd read):** **199 AGREE / 0 DISAGREE / 0 no-verify** — zero answer disagreements.
- **Step 4 figures:** **41 cropped** (== Form 28), clinical_image_url on all 41, all **28 needs_image** covered.
  3 crops hand-fixed: q24 (clipped→widened), q118 & q129 (rotated screenshots→re-cropped + rotated upright).
  q193 is a rotated skin-biopsy (needs_image=false) left sideways — content complete, answerable from text.
- **Step 5a Mehlman index:** 7,407 chunks / 26 PDFs (== Form 28; resolver handled no-trailing-space dir).
- **Step 5b retrieval (GATE 2):** 199/199 items, **4 chunks each = 100%** (== Form 28's 200/200).
- **Step 5c enrich:** 199 items, 20 sub-agents (10/part). Session limit hit mid-fan-out; **all part files had
  been written before the limit** (agents died on their final self-lint step) — recovered, no re-run needed.
- **Step 5d merge + self-lint (GATE 3):** after rewording 6 residual issues (4 verbatim + 2 absolutes the
  interrupted agents didn't finish), lint is **CLEAN: 0 absolutes / 0 cap / 0 verbatim.** Provenance
  **official 48% / Mehlman 49% / model 2%** — *balanced*, diverges from Form 28's official-dominant 59/38 but
  ALLOWED per owner's Form-25 ruling (balanced OK when model share stays low; model = 2% here).
- **Step 6 SQL:** 199 inserts / 199 enriched, transactional, on conflict (nbme_form,q_number), q185 absent.

## FOOTGUNS handled (both, as the runbook warned)
1. Merge glob over-match: combined the 20 `_part` files into exactly 10 `enrich_blockN.json`, moved parts to
   `import/out29/_parts/` before running merge_enrichment (glob then matched only the 10 clean files).
2. Nested schema: shape-check run before merge — 0 nested; all 5 sections flat.

## PHYSICIAN-REVIEW FLAGS (honest, not silently changed — surface these before load)
- **Q146:** a retrieved Mehlman chunk mislabels xeroderma pigmentosum as "base-excision repair" (it's
  **nucleotide excision repair**). Enricher did NOT cite it — grounded in the official NER explanation. A
  Mehlman *corpus* error, not our content.
- **Q100:** the NBME official explanation itself has an internal label typo ("60 (Choice C)" where 60 is
  option B). Preserved verbatim per rule 4; flagged.

## METHOD DIVERGENCES from Form 28 (recorded for forms 30+)
- **No text layer** → extraction was PURE VISION (M1 hybrid unavailable). Numbers read directly from image.
- **CBSSA form WITH official explanations** (header "Comprehensive Basic Science Self-Assessment" like Form 20,
  but prints authoritative "Correct Answer" + full explanation like Form 28) → Form-28-style official grounding.
- **Some screenshots are rotated 90°** (e.g. pages behind q115/q118/q129/q193) — figure crops from those need
  a rotate-upright pass; crop from the rendered PNG's pixel space (bbox already matches what the agent saw).

## GATE-1 RESOLUTION (owner)

## GATE-1 RESOLUTION (owner)
- **Decision:** preserve NBME native numbering — `q_number = (section-1)*50 + item_number`. S4 =
  q151–184, **q185 absent**, q186–200. This matches how **Form 31** already works (198 items, gaps at
  q41/q158, loaded and live), so the scripts already handle gaps.
- **Do NOT suppress the validator warning.** The gap + the 19-item final block (block 10) are real and
  expected; the owner wants to SEE the warning at load time. No validator change.
- **q185 = a genuine source absence** (NBME Section 4, Item 35), verified at full renders of pages
  182–186 (page item-numbers read 32,33,34,**36**,37 — NBME numbering jumps, not the page mapping).
  Never fetch the missing item from the web (CLAUDE.md #4).
- Page→q map: pages 1–184 → q=page; page 185 → **q186**; pages 186–199 → q=page+1; **q185 absent**.
  Block 10 (ceil(q/20)=10 → q181–200) therefore holds **19 items** (q181–184, q186–200), pages 181–199.

---

## Step 1 — rasterize + count: how Form 29 differs

### PDF characterization (do this per form; do NOT assume Form-28 geometry)
- **199 pages** (`pdfinfo`), page size ~427×792 pts **portrait** with a page `/Rotate` → renders
  **landscape 2200×1700 at 200 DPI** (2200×1700). Embedded screenshots are ~1338×781 at 131 ppi
  (much lower-native than Form 31; ~Form-28-class). Rendered probes at 150–200 DPI are legible.
- **No usable text layer.** `pdftotext` yields ~25 chars/page; `grep "Item N of 50"` = 0 hits.
  → Unlike Form 28 (which had a noisy OCR layer usable as a diff-draft), **Form 29 extraction must
  be PURE VISION.** The M1 hybrid (text-seed → image-verify) is unavailable. This matches CLAUDE.md's
  default assumption (image-only PDFs); it's Form 28 that was the exception.
- **CBSSA form that DOES print official explanations.** Header reads "Comprehensive Basic Science
  Self-Assessment" (like Form 20), BUT every item prints an authoritative **"Correct Answer: X."**,
  a full explanation paragraph, per-choice "Incorrect Answers" reasoning, and an "Educational
  Objective" (like Form 28 / unlike Form 20). → Grounding hierarchy = **Form-28 style**
  (official-primary, Mehlman-secondary). `correct_letter` comes from the printed line, authoritative.
- Prior-taker marks seen: red **✗** by the item number + **yellow highlight on the correct option**
  (the highlight has agreed with the printed answer on every page sampled). Watermark
  "https://t.me/USMLENBME" top-right. Radios appear hollow on sampled pages (no filled
  selected-answer radio seen yet) — confirm `selected_letter` presence during extraction; strip the
  highlight + ✗ as spoilers regardless.

### Page↔item mapping (re-derived from headers + body item-numbers, since no text layer)
Layout is **1 item per page** (same as Form 28), headers "Exam Section S: Item N of 50" legible
in-image. Section boundaries verified by reading header bands:
- **Section 1** = pages 1–50 (p50 = S1 I50, p51 = S2 I1)
- **Section 2** = pages 51–100 (p100 = S2 I50, p101 = S3 I1)
- **Section 3** = pages 101–150 (p150 = S3 I50, p151 = S4 I1)
- **Section 4** = pages 151–199 → **only 49 items.**

### THE DIVERGENCE: Section 4, Item 35 is ABSENT from the source PDF
Tracking the unambiguous body item-numbers, the page sequence runs …**Item 34 (p184) → Item 36
(p185) → Item 37 (p186)**… — full renders of p182–186 confirm p184=Item34, p185=Item36, p186=Item37.
**There is no page for Section 4 Item 35.** The per-page offset shifts by exactly one at p185 and is
otherwise 1:1 throughout, so this is a single, isolated gap — the source screenshots skipped one item,
not a segmentation error. (Never fetch the missing item from the web — CLAUDE.md #4.)

**Consequence:** Form 29 has **199 items, not 200.** 199 is **not** a clean multiple of 50, and does
**not** split into even blocks of 20 (Form 28 was 200 = 10×20). This trips two runbook Step-1
"STOP if" conditions and requires an owner decision on numbering/slicing before extraction — see below.

---

## OPEN DECISION (blocks extraction) — q_number scheme + block slicing for a 199-item form
Two viable schemes; both need a call because they touch `q_number`, `block_number`, the DB, and the
`build_form.py`/`reconcile.py` validators (which currently assume count=20/block and sequential q):

- **A. Preserve NBME native numbering (recommended).** `q_number = (section-1)*50 + item_number`,
  so S4 items are q151–184, q186–200 with a **gap at q185**. Each row's `q_number` then matches its
  printed "Item N" label (good for the owner cross-referencing the source). Blocks by
  `ceil(q_number/20)` → block 10 = q181–200 minus q185 = **19 items**. Validators must tolerate the
  single gap + one 19-item block.
- **B. Contiguous renumber 1..199.** No gaps, but `q_number` no longer matches the NBME item label,
  and 199 still won't divide into even 20s (block 10 = 19). Loses provenance for no structural gain.

Neither can be adopted without a shared-script tweak (the validators hard-expect 20/sequential), and
CLAUDE.md forbids patching a shared script mid-run without sign-off. → **Hard stop, ask owner.**
