// Dev-only preview data (VITE_PREVIEW=1). Pure + side-effect-free so it can be
// unit-verified without a browser or Supabase. Serves TWO NBME forms so the
// analytics page can be preview-verified as fully form-agnostic. Nothing here is
// special-cased: add a third form to `previewAnalyticsAttempts` and it appears
// automatically everywhere the dashboard derives its form list from the data.
import type { AnalyticsAttempt } from "./analytics";
import type { EnrichedExplanation, ExamQuestion, FullQuestion } from "./types";

const OPT_LETTERS = ["A", "B", "C", "D", "E"];
const previewCorrect = (qn: number) => OPT_LETTERS[(qn * 3) % 5];

/** Synthetic, non-licensed questions so the exam/practice runners are drivable
 *  under VITE_PREVIEW without Supabase (the anon role can't read `questions`). */
export function previewQuestions(form: number, blockNumber: number): FullQuestion[] {
  return Array.from({ length: 20 }, (_, i) => {
    const qn = (blockNumber - 1) * 20 + i + 1;
    const correct = previewCorrect(qn);
    const enriched: EnrichedExplanation = {
      answer_lock: `**Preview mechanism** for Q${qn}: why **${correct}** is correct.`,
      hook: `Preview recall hook for Q${qn}.`,
      knockdowns: OPT_LETTERS.filter((l) => l !== correct).map((l) => ({ option: `${l}. Preview option ${l}`, reason: `Why **${l}** doesn't fit (preview).` })),
      high_yield: [{ fact: `**Preview** high-yield fact for Q${qn}.`, source: "model" }],
      how_they_test: [{ scenario: `Preview alt scenario ${qn}`, answer: `Preview answer`, source: "model" }],
    };
    return {
      id: `preview-q-${form}-${blockNumber}-${qn}`,
      nbme_form: form, block_number: blockNumber, q_number: qn,
      vignette_text: `Preview vignette ${qn} (block ${blockNumber}). A 40-year-old presents with a classic finding; which of the following is most likely?`,
      options: OPT_LETTERS.map((l) => ({ letter: l, text: `Preview option ${l} for Q${qn}` })),
      clinical_image_url: null,
      system_tag: "Cardiovascular", discipline_tag: "Physiology", question_type: "mechanism",
      correct_letter: correct, source_explanation: `Preview source explanation for Q${qn}.`, enriched_explanation: enriched,
    };
  });
}

/** Exam-safe projection (no answer key), matching getExamQuestions. */
export function previewExamQuestions(form: number, blockNumber: number): ExamQuestion[] {
  return previewQuestions(form, blockNumber).map(({ correct_letter, source_explanation, enriched_explanation, ...rest }) => rest);
}

/** Answer key for a set of preview question ids (id = preview-q-form-block-qn). */
export function previewAnswerKey(questionIds: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const id of questionIds) {
    const qn = Number(id.split("-").pop());
    if (Number.isFinite(qn)) m.set(id, previewCorrect(qn));
  }
  return m;
}

const LETTERS = ["A", "B", "C", "D", "E"];
const DISCIPLINES = ["Physiology", "Pathology", "Pharmacology", "Biochemistry", "Behavioral Sciences"];
const SYSTEMS = ["Cardiovascular", "Renal", "Neurology", "Endocrine", "Multisystem"];
const QTYPES = ["mechanism", "diagnosis", "next-step", "interpretation", "association"];
const TAGS = ["knowledge_gap", "discriminator_miss", "primary_secondary", "process_error"] as const;

/**
 * One form's attempts: 2 blocks × 20 questions. `missEvery` tunes accuracy so
 * forms carry visibly different numbers; `mode(block)` picks the session type.
 */
export function formAttempts(
  form: number,
  opts: { missEvery: number; mode: (block: number) => string; dayBase: number }
): AnalyticsAttempt[] {
  const out: AnalyticsAttempt[] = [];
  for (let block = 1; block <= 2; block++) {
    for (let i = 0; i < 20; i++) {
      const q = (block - 1) * 20 + i + 1;
      const correct = LETTERS[(q * 3) % 5];
      // base miss rate (tunes per-form accuracy) + a real block-2 tail dropoff so
      // stamina/pacing have shape and block-level accuracy genuinely differs from
      // the form-level aggregate.
      const baseWrong = q % opts.missEvery === 0;
      const fatigueWrong = block === 2 && i >= 13; // late questions of block 2 = fatigue
      const finalWrong = baseWrong || fatigueWrong;
      const final = finalWrong ? LETTERS[(q + 1) % 5] : correct;
      const didChange = q % 4 === 0;
      const first = didChange ? (q % 8 === 0 ? correct : LETTERS[(q + 2) % 5]) : final;
      out.push({
        questionId: `preview-${form}-${q}`,
        attemptId: `preview-a-${form}-${q}`,
        createdAt: new Date(Date.UTC(2026, 5, opts.dayBase + block, 0, q)).toISOString(),
        firstLetter: first,
        finalLetter: final,
        correctLetter: correct,
        changed: first !== final,
        errorTag: final !== correct ? TAGS[q % TAGS.length] : null,
        flagged: q % 9 === 0,
        qNumber: q,
        nbmeForm: form,
        blockNumber: block,
        discipline: DISCIPLINES[q % DISCIPLINES.length],
        system: SYSTEMS[q % SYSTEMS.length],
        questionType: QTYPES[q % QTYPES.length],
        mode: opts.mode(block),
        paused: false,
        secondsSpent: 40 + ((q * 7) % 60),
        firstAnswerSeconds: 15 + ((q * 5) % 40),
      });
    }
  }
  return out;
}

/**
 * Two forms so the dashboard's form-agnostic scoping is exercisable in preview:
 *  - NBME 31 — both blocks sat as a full exam (stamina populates), higher accuracy.
 *  - NBME 20 — block + practice modes (practice-vs-exam split populates), lower accuracy.
 */
export function previewAnalyticsAttempts(): AnalyticsAttempt[] {
  return [
    ...formAttempts(31, { missEvery: 5, mode: () => "full_exam", dayBase: 1 }),
    ...formAttempts(20, { missEvery: 3, mode: (b) => (b === 1 ? "block" : "practice"), dayBase: 10 }),
  ];
}
