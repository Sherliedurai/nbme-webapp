# Import pipeline (local, one-time) — how it works

Turns the licensed image-PDF (`NBME 31 A.pdf`, 200 items = 4 sections × 50, over 183
image pages) into clean rows for `public.questions`. Runs locally under the owner's
Claude subscription; **the deployed app never does any of this**.

Nothing here is committed to git — the PDF, page renders, cropped figures, and the
extracted JSON/SQL are all licensed content (see root `.gitignore`).

## Product mapping
- Source is grouped in **sections of 50**; the app uses **blocks of 20**
  (`block_number = ceil(q_number / 20)`), so global item `q_number` 1..200 → 10 blocks.
- Global `q_number` = `(section - 1) * 50 + item_number`.

## Steps (per block of 20 items)
1. **Rasterize** the pages covering the block at 200 DPI:
   `pdftoppm -png -r 200 -f <first> -l <last> "NBME 31 A.pdf" import/pages/p`
   Items are 1–2 per page, variable, and can span a page break — go by the
   "Item N of 50" header, not page boundaries.
2. **Extract** with parallel sub-agents (2 × 10 items) reading the page PNGs. Rules
   (the non-negotiable ones):
   - **Strip all prior-taker marks / highlights** (yellow highlight, filled radios,
     strikethroughs, ✓/✗). Read `correct_letter` from the printed "Correct Answer:"
     line, not the highlight; flag any disagreement.
   - Preserve every number/unit/arrow. List anything not 100% legible in
     `numeric_review`.
   - Split tags into `system_tag` / `discipline_tag` / `question_type`
     (mechanism|diagnosis|next-step|interpretation|association).
   - Genuine figures → `has_figure` + `figure_page`; simple 2×2 tables → retype into
     the vignette (`table_retyped`).
   - Output our schema to `import/out/block<N>_part{1,2}.json`.
3. **Crop figures** straight from the PDF (no re-encode of the whole page):
   `pdftoppm -png -r 200 -f <pg> -l <pg> -x <X> -y <Y> -W <W> -H <H> "NBME 31 A.pdf" import/images/block-<NN>/q<QNUM>`
   Save as `import/images/block-<NN>/q<QNUM>.png`; set that item's
   `clinical_image_url` to the **object path** `block-<NN>/q<QNUM>.png` (private bucket).
4. **Merge + validate + emit**: `python3 import/build_block.py <N>` →
   - `import/out/block<N>.sql` (INSERT … INTO public.questions, dollar-quoted, jsonb)
   - `import/out/block<N>_review_needed.csv` (owner eyeballs)
   - `import/out/block<N>.merged.json` (record)
   Validation checks count=20, sequential q_numbers, answer ∈ options, non-empty
   fields, highlight/printed-answer agreement.
5. **Enrich** (separate pass, after the owner confirms extraction): generate
   `enriched_explanation` (one-level-deeper mechanism + one memory hook) per item and
   emit an UPDATE. Never generated at runtime.

## Owner loads it (dashboard — no secret key leaves your machine)
1. Run `supabase/migrations/0002_relax_letter_check.sql` **once** (letters A–Z).
2. Upload `import/images/block-<NN>/*.png` to the **private** `clinical-images`
   bucket, preserving the `block-NN/qNNNN.png` path.
3. Run `import/out/block<N>.sql` in the SQL Editor.

## Block 1 status
Extracted & generated. Awaiting owner spot-check of `block1_review_needed.csv` +
numbers before enrichment and blocks 2–10.
