# CLAUDE.md — NBME Practice App

Standing rules for this repo. Read fully before any task. These were learned the hard way; each one exists because something broke.

---

## What this is

A **private, two-person** USMLE Step 1 practice app. Owner (Sherlie, engineer) + Deepika (physician, the actual user). Deepika **failed Step 1 (March 2026)** and is retaking. Everything in this repo exists to help her pass. Medical accuracy is not a nice-to-have — a confidently-worded wrong mechanism is a fact she will memorize and carry into the exam.

**Her score report — this drives priorities:**
- Almost everything scores **"Same"** as a low-pass. She is a **narrow miss**, not a broad failure.
- **Weakest: Physiology (30–40% of the exam).** This is the single biggest lever.
- Also Lower: Behavioral Sciences, Communication/Ethics, Biochemistry & Nutrition, Genetics, Multisystem Processes, MSK/Skin.
- Pathology (the largest discipline, 45–55%) is fine. Her *fact recall* is OK; her **mechanistic reasoning** is not.
- Implication: the `answer_lock` (first-principles mechanism) is the highest-value part of the enrichment. Write it like it matters, because it does.

---

## Hard constraints (never violate)

1. **NEVER write to Supabase.** You have no credentials by design. Produce `.sql` files; the owner runs them in the dashboard. This has already saved us once (a UPDATE silently landed 0 rows — caught by a manual `select count(*)`, not by any agent check).
2. **NEVER relax a constraint to make content fit.** If a fact exceeds the word cap, split it or cut it — do not raise the cap. (This already happened: a 20-word cap became 24 because six facts didn't fit. That was a one-time, owner-approved exception. **24 is now final.**)
3. **NEVER fabricate a source label.** Grounded content cites the real Mehlman chunk. Ungrounded content is marked `"source": "model"`. Never blank, never invented.
4. **NEVER fetch medical images from the web.** Mislabeled images teach wrong visual patterns. Internal image bank only (tagged by diagnosis, from the forms themselves).
5. **NEVER commit licensed content.** NBME PDFs, extracted questions, and Mehlman files are gitignored. Personal use only, never shared or published.
6. **Stop at gates.** Do not batch through checkpoints. The owner reviews between steps. Every gate so far has caught a real error.

---

## Enrichment rules

Structure — `enriched_explanation` (jsonb):
```json
{
  "answer_lock":   "...",                          // Bottom Line — mechanism, first principles
  "hook":          "...",                          // Remember It As
  "knockdowns":    [{ "option": "...", "reason": "..." }],
  "high_yield":    [{ "fact": "...", "source": "..." }],
  "how_they_test": [{ "scenario": "...", "answer": "...", "source": "..." }]
}
```

### The recurring failure mode: precision loss through vividness
This has surfaced **four separate times**. Watch for it constantly.

- **NO ABSOLUTES.** No "always," "never," "prevents," "all," "none" — unless literally, medically true. Use *rarely, typically, classically, tends to, lowers the risk of*.
  - Real examples caught: "essentially never hemolyzes" → "rarely clinically significant." "The body always compensates" → wrong; uncompensated states exist. "DAPT prevents stent thrombosis" → "lowers the risk of."
- **NO OVERSIMPLIFICATION.** "Smooth muscle cells migrating over the mesh" → "neointimal hyperplasia (SMC migration + proliferation + ECM deposition)."
- **`hook` = MEDICAL CONTENT ONLY.** No scene-painting, no narrative flourish. Killed example: *"Resistant to everything that works inside the cell? Stop it at the door…"* → just state the mechanism.
- **NO REPETITION.** Say a thing once. (An ABCDE acronym was restated three times.)

### Format
- Terse. Bulleted. Bold 2–4 key terms per item.
- Standard medical abbreviations only: dx, tx, hx, sx, Ddx, →, ↑, ↓.
- Preferred shape: `"Itchy scaling rash between toes in an athlete → dx. tinea pedis, tx. topical terbinafine/azole"`
- **`high_yield` cap: 24 words per fact. FINAL — do not relax.**
- Group near-identical distractors on extended-matching items (e.g. "B/D/E/F — systemic dimorphic fungi: lungs, not groin").
- Tone: sharp senior explaining it fast so it sticks. Retrievability over completeness. But **never sacrifice precision for memorability** — a sticky line recalled with false confidence is worse than a dull correct one.

### Grounding (Mehlman)
- Chunk by **HY item** (Mehlman has no headings — his unit is the bulleted vignette + answer + mechanism).
- Retrieve top 2–4 chunks per question. **Never** stuff the whole corpus — expensive and lowers accuracy.
- `high_yield` and `how_they_test` should be grounded where a chunk matches; `"source": "model"` where not.

### Self-lint before presenting (mandatory)
Run and report:
- Absolute-word scan (always/never/prevents/all/none) — flag every hit
- Word counts vs. caps
- Every item has a source label, none blank, none fabricated
- No narrative flourish in `hook`
- Report **grounded / model counts** (e.g. "76 grounded / 28 model")

---

## Anki export rules

Deepika already uses Anki but **hates bloated cards** — Mehlman's are too long, and some aren't even questions.

- **1 card per question.** 2 only if it genuinely tests two separable facts. Never more.
- Every card is a **question with one retrievable answer**. Never a statement. Never a paragraph.
- Default: **clinical trigger → answer.** Front = the compressed trigger (not the vignette). Back = answer + at most one line.
- Optional 2nd: a cloze on the single highest-yield mechanism.
- **Hard cap: front ≤ 20 words, back ≤ 25 words.** If it doesn't fit, pick a tighter fact.
- The app teaches; **Anki drills.** Do not duplicate the knockdowns/mechanism/how_they_test onto cards.
- Personal use only. Never share/upload.

**Implemented:** `scripts/anki_export.py` (genanki) builds the `.apkg`; the app's "Export to Anki" button (dashboard) downloads her incorrect+flagged set as JSON for it. Card fronts are derived deterministically from the physician-reviewed `hook`.

**Future improvement (not yet built):** the deterministic front-from-`hook` extraction leaks the answer on ~1–2/20 *answer-first* hooks (e.g. "↓5α-reductase → ↓DHT → hypoplastic prostate…"). The clean fix is a dedicated **`card_front`** field written at enrichment time (model-drafted, physician-reviewed), so the card trigger is authored, not parsed. Add it to the enrichment schema before scaling the deck across forms.

---

## Extraction rules

- Source PDFs are **image-based** — no text layer (only a Telegram watermark).
- Segment by **"Item N of 50"** labels, **not by page** — items span page breaks and pages hold variable item counts.
- **Strip all highlighting.** The screenshots carry the previous test-taker's yellow highlights on the correct option *and* on clinically decisive vignette phrases. Both are spoilers.
- **Re-verify every number** (labs, vitals, ages, doses). A misread value silently breaks a medical question. Flag low-confidence items for physician review.
- Crop genuine clinical figures (photos, ECGs, imaging, non-trivial tables) → private Supabase Storage bucket; store the **object path**, not a public URL.
- Some items have options **printed on the image** (e.g. labeled brainstem photo). These cannot be extracted as clean text — the figure carries the question and the choices together.
- Blocks are **20 questions** (a re-slice over NBME's native 4×50 sections).

---

## Schema / DB

- `questions` — select-only for `authenticated`. **No write policy from the app.** Imports go via service role / SQL editor.
- `attempts`, `block_sessions` — RLS gated on `user_id = (select auth.uid())`. **No DELETE** (history is not user-erasable; a redo inserts a fresh row).
- Table-level `GRANT`s to `authenticated` must be **in the migration**, not just applied in the dashboard. (This bit us: "Automatically expose new tables" was disabled at project setup — correctly — so grants must be explicit.)
- CHECK constraints on `mode` and answer letters. Tags (`system_tag`, `discipline_tag`, `question_type`) are **free text** — the taxonomy is still evolving.
- `enriched_explanation` is **jsonb**.
- Modes: `block` | `full_exam` | `practice` | `custom`.

---

## Verification discipline (the thing that keeps saving us)

**Verify at the data layer, not the UI layer.** A beautiful screenshot proves nothing. Every real bug so far was caught by a query or a human reading actual output:

- Extraction assumptions were wrong → caught by *looking at the PDF*.
- Enrichment drifted → caught by *reading the enrichments*.
- The review HTML replayed stale verdicts from localStorage → caught by *noticing identical exports*.
- The enrichment UPDATE landed **0 rows** → caught by `select count(*)`, not by any agent.

After any DB-affecting step, give the owner the **exact query** to verify it, with the expected number.

---

## Overnight / unattended runs

Permitted: **extraction** (mechanical, deterministic, verifiable by row count).

Permitted with guardrails: **enrichment** — but:
- Run the full self-lint and put the results at the top of the report.
- Flag every absolute-word hit, every cap violation, every `"source": "model"` item, for human review.
- Produce the review HTML for physician sign-off. **Nothing goes to the DB without it.**
- **Never** resolve a conflict by loosening a rule. If something can't be done within the rules, stop and ask.

Never permitted unattended: DB writes, schema changes, anything that can't be verified by a query in the morning.

Always leave a **60-second-readable report**: what ran, what to check, what looks wrong, the exact verification query.

---

## Review tooling

The physician review HTML must:
- Key `localStorage` to a **build/version ID** so a regenerated set starts clean (a stale replay cost us three confused rounds).
- Stamp the **enrichment version** into the exported JSON so a review traces to the exact set reviewed.
- Show the **source label inline** per grounded item, so she can scrutinize the ungrounded ones and skim the rest. Put her attention where the model's confidence is weakest.

---

## Priorities (from the score report)

1. **Custom block builder** — filter by system/discipline/question_type. Not an add-on: it's the only feature that acts on her diagnosis. A Physiology-only block is worth more than thousands of extra random questions.
2. **Per-tag trend analytics** — is the physiology gap actually closing? Without this, we're guessing.
3. **In-app "this explanation didn't help" flag** — quality control as a byproduct of use, since she can't review thousands of enrichments separately.
4. Re-chunk the **Genetics** and **Communication/Ethics** Mehlman PDFs (they under-chunked, and both are her weak areas).

**Scope discipline:** ~4–6 forms is plenty. Volume is not her problem — her weak areas are. Do not build inventory she'll never open.
