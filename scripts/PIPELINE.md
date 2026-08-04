# Import pipeline (local, one-time) — how it works

Turns a licensed image-PDF (`NBME <form> A.pdf`, e.g. `NBME 31 A.pdf` / `NBME 20 A.pdf`)
into clean rows for `public.questions`. Runs locally under the owner's Claude
subscription; **the deployed app never does any of this**.

Every step is **namespaced per form** — outputs live under `out<form>/` and figures under
`form-<NN>/block-<NN>/qNNNN.png`, so two forms never collide (each `questions` row carries
`nbme_form`, and the load conflict guard is `(nbme_form, q_number)`).

Nothing here is committed to git — the PDF, page renders, cropped figures, and the
extracted JSON/SQL are all licensed content (see root `.gitignore`). The **scripts**
(`build_form.py`, `reconcile.py`, this file) are pure logic and are tracked.

## Product mapping
- Source is grouped in **sections of 50**; the app uses **blocks of 20**
  (`block_number = ceil(q_number / 20)`), so global item `q_number` 1..N → blocks.
- Global `q_number` = `(section - 1) * 50 + item_number`.

## Steps (per block of 20 items) — substitute the form number for `<form>`
1. **Rasterize** the pages covering the block at 200 DPI:
   `pdftoppm -png -r 200 -f <first> -l <last> "NBME <form> A.pdf" import/pages/p`
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
   - Output our schema to `import/out<form>/block<N>_part{1,2}.json`.
3. **Crop figures** straight from the PDF (no re-encode of the whole page):
   `pdftoppm -png -r 200 -f <pg> -l <pg> -x <X> -y <Y> -W <W> -H <H> "NBME <form> A.pdf" import/images/form-<NN>/block-<NN>/q<QNUM>`
   Save as `import/images/form-<NN>/block-<NN>/q<QNUM>.png`; set that item's
   `clinical_image_url` to the **object path** `form-<NN>/block-<NN>/q<QNUM>.png`
   (private bucket). The `form-<NN>` prefix keeps figures from colliding across forms.
4. **(CBSSA forms) Reconcile the answer key**: after a blind verification re-read
   (`verify_block<N>.json`), run `python3 scripts/reconcile.py --form <form>` → stamps
   `answer_confidence` (high if the two blind reads agree, low if they disagree →
   physician adjudicates) and writes `out<form>/answer_key_reconciliation.csv`.
5. **Merge + validate + emit**: `python3 scripts/build_form.py --form <form> merge <N>` →
   - `import/out<form>/block<N>.merged.json` (record)
   - `import/out<form>/block<N>_review_needed.csv` (owner eyeballs)
   Validation checks count=20, sequential q_numbers, answer ∈ options, non-empty
   fields, highlight/printed-answer agreement (warnings, not a hard abort — the owner
   gate catches a short final block).
   Then `python3 scripts/build_form.py --form <form> sql` →
   - `import/out<form>/load_form<form>.sql` (one transactional INSERT … INTO
     public.questions, dollar-quoted, jsonb, `on conflict (nbme_form, q_number)`).
6. **Enrich** (separate pass, after the owner confirms extraction): generate
   `enriched_explanation` (one-level-deeper mechanism + one memory hook) per item and
   merge it into the merged JSON before the `sql` step. Never generated at runtime.

## Owner loads it (dashboard — no secret key leaves your machine)
1. Ensure migrations are applied (esp. `0006` `nbme_form`, `0002` letters A–Z,
   `0003` `enriched_explanation` jsonb).
2. Upload `import/images/form-<NN>/block-<NN>/*.png` to the **private** `clinical-images`
   bucket, preserving the `form-<NN>/block-<NN>/qNNNN.png` path.
3. Run `import/out<form>/load_form<form>.sql` in the SQL Editor.
4. **Verify at the data layer** (CLAUDE.md): the SQL's trailing comment gives the exact
   `select count(*) … where nbme_form = <form>` and its expected row/enriched counts.

## Per-form status
Track each form separately (extracted / reconciled / enriched / loaded). Volume is not
the goal — ~4–6 forms weighted to the weak areas (see CLAUDE.md priorities).
