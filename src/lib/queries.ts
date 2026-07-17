import { supabase } from "./supabase";
import { PREVIEW } from "./preview";
import type { AnswerKeyRow, BlockProgressRow, BlockSession, ExamQuestion, FullQuestion, ReviewAnswer, SessionMode } from "./types";
import type { AnalyticsAttempt, ErrorTag } from "./analytics";

const EXAM_COLUMNS =
  "id, nbme_form, block_number, q_number, vignette_text, options, clinical_image_url, system_tag, discipline_tag, question_type";
const FULL_COLUMNS = EXAM_COLUMNS + ", correct_letter, source_explanation, enriched_explanation";

/** One NBME form and how much it holds — drives the Home form picker. */
export interface FormSummary {
  form: number;
  blockCount: number; // highest block_number in the form
  questionCount: number;
}

/**
 * Every NBME form in the bank with its block/question counts, ascending by form.
 * (block_number is per-form, so blockCount = the form's largest block.)
 */
export async function getForms(): Promise<FormSummary[]> {
  const { data, error } = await supabase.from("questions").select("nbme_form, block_number");
  if (error) throw error;
  const byForm = new Map<number, { blockCount: number; questionCount: number }>();
  for (const r of (data ?? []) as { nbme_form: number; block_number: number }[]) {
    let f = byForm.get(r.nbme_form);
    if (!f) { f = { blockCount: 0, questionCount: 0 }; byForm.set(r.nbme_form, f); }
    f.questionCount++;
    if (r.block_number > f.blockCount) f.blockCount = r.block_number;
  }
  return [...byForm.entries()]
    .map(([form, v]) => ({ form, ...v }))
    .sort((a, b) => a.form - b.form);
}

/**
 * Full questions for a block of a form (answer + explanations + enrichment).
 * Used by Practice (immediate reveal) and Review — NOT during a live block/exam.
 */
export async function getFullQuestions(form: number, blockNumber: number): Promise<FullQuestion[]> {
  const { data, error } = await supabase
    .from("questions")
    .select(FULL_COLUMNS)
    .eq("nbme_form", form)
    .eq("block_number", blockNumber)
    .order("q_number", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as FullQuestion[];
}

/** Number of blocks in a form (for "Block X of Y" and full-exam sweeps). */
export async function getBlockCount(form: number): Promise<number> {
  const { data, error } = await supabase
    .from("questions")
    .select("block_number")
    .eq("nbme_form", form)
    .order("block_number", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.block_number ?? 0;
}

/** Exam-safe questions for a block of a form, q_number order. No answer key. */
export async function getExamQuestions(form: number, blockNumber: number): Promise<ExamQuestion[]> {
  const { data, error } = await supabase
    .from("questions")
    .select(EXAM_COLUMNS)
    .eq("nbme_form", form)
    .eq("block_number", blockNumber)
    .order("q_number", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ExamQuestion[];
}

/** Answer key for scoring — fetched ONLY at submit time. */
export async function getAnswerKey(questionIds: string[]): Promise<Map<string, string>> {
  if (questionIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("questions")
    .select("id, correct_letter")
    .in("id", questionIds);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of (data ?? []) as AnswerKeyRow[]) map.set(row.id, row.correct_letter);
  return map;
}

/** Create a block session owned by the current user, stamped with its form. */
export async function createBlockSession(
  userId: string,
  form: number | null,
  blockNumber: number | null,
  mode: SessionMode = "block",
  timeLimitSeconds: number | null = null
): Promise<BlockSession> {
  if (PREVIEW) {
    return {
      id: `preview-session-${form}-${blockNumber}`,
      user_id: userId,
      nbme_form: form,
      block_number: blockNumber,
      mode,
      started_at: new Date().toISOString(),
      submitted_at: null,
      is_complete: false,
      time_limit_seconds: timeLimitSeconds,
      paused: false,
      paused_at: null,
      total_paused_seconds: 0,
      current_index: 0,
    };
  }
  const { data, error } = await supabase
    .from("block_sessions")
    .insert({ user_id: userId, nbme_form: form, block_number: blockNumber, mode, time_limit_seconds: timeLimitSeconds })
    .select()
    .single();
  if (error) throw error;
  return data as BlockSession;
}

// ── Timed-block pause / resume (state lives in Supabase, not localStorage) ────

/**
 * The user's most recent UNFINISHED timed block, if any — for "Resume".
 * Pass form+block to find the one for a specific block (Exam resume); omit for
 * the most recent of any (Home banner).
 */
export async function getUnfinishedBlock(userId: string, form?: number, block?: number): Promise<BlockSession | null> {
  if (PREVIEW) return null;
  let q = supabase
    .from("block_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("mode", "block")
    .eq("is_complete", false);
  if (form != null) q = q.eq("nbme_form", form);
  if (block != null) q = q.eq("block_number", block);
  const { data, error } = await q.order("started_at", { ascending: false }).limit(1);
  if (error) throw error;
  return (data?.[0] ?? null) as BlockSession | null;
}

/** Load the partial answers saved for an unsubmitted block. */
export async function loadBlockProgress(sessionId: string): Promise<BlockProgressRow[]> {
  if (PREVIEW) return [];
  const { data, error } = await supabase
    .from("block_progress")
    .select("question_id, selected_letter, first_letter, first_answer_seconds, seconds_spent, flagged, struck_letters, highlight_html")
    .eq("block_session_id", sessionId);
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    question_id: r.question_id,
    selected_letter: r.selected_letter ?? null,
    first_letter: r.first_letter ?? null,
    first_answer_seconds: r.first_answer_seconds ?? null,
    seconds_spent: r.seconds_spent ?? 0,
    flagged: !!r.flagged,
    struck_letters: Array.isArray(r.struck_letters) ? r.struck_letters : [],
    highlight_html: r.highlight_html ?? null,
  }));
}

/** Upsert one question's in-progress answer. */
export async function saveBlockProgress(userId: string, sessionId: string, row: BlockProgressRow): Promise<void> {
  if (PREVIEW) return;
  const { error } = await supabase
    .from("block_progress")
    .upsert(
      {
        block_session_id: sessionId,
        user_id: userId,
        question_id: row.question_id,
        selected_letter: row.selected_letter,
        first_letter: row.first_letter,
        first_answer_seconds: row.first_answer_seconds,
        seconds_spent: Math.round(row.seconds_spent),
        flagged: row.flagged,
        struck_letters: row.struck_letters,
        highlight_html: row.highlight_html,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "block_session_id,question_id" }
    );
  if (error) throw error;
}

/** Persist which question she's on (so resume lands exactly there). */
export async function updateSessionIndex(sessionId: string, currentIndex: number): Promise<void> {
  if (PREVIEW) return;
  const { error } = await supabase.from("block_sessions").update({ current_index: currentIndex }).eq("id", sessionId);
  if (error) throw error;
}

/** Suspend: stop the clock and flag the block interrupted. */
export async function pauseSession(sessionId: string): Promise<void> {
  if (PREVIEW) return;
  const { error } = await supabase
    .from("block_sessions")
    .update({ paused: true, paused_at: new Date().toISOString() })
    .eq("id", sessionId)
    .is("paused_at", null); // don't overwrite an existing pause start
  if (error) throw error;
}

/** Resume: roll the elapsed pause into total_paused_seconds and restart the clock. */
export async function resumeSession(sessionId: string): Promise<BlockSession> {
  if (PREVIEW) throw new Error("no resume in preview");
  const { data: cur, error: readErr } = await supabase
    .from("block_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (readErr) throw readErr;
  const s = cur as BlockSession;
  if (s.paused_at) {
    const delta = Math.max(0, Math.round((Date.now() - Date.parse(s.paused_at)) / 1000));
    const { data, error } = await supabase
      .from("block_sessions")
      .update({ paused_at: null, total_paused_seconds: s.total_paused_seconds + delta })
      .eq("id", sessionId)
      .select()
      .single();
    if (error) throw error;
    return data as BlockSession;
  }
  return s;
}

export interface AttemptInput {
  question_id: string;
  selected_letter: string | null; // final answer
  first_letter: string | null; // first-instinct answer (captured once)
  changed: boolean; // final != first
  is_correct: boolean;
  seconds_spent: number;
  first_answer_seconds?: number | null; // reasoning time (shown → first commit)
  flagged: boolean;
  is_review?: boolean; // cold re-attempt from the review deck — excluded from analytics
}

/**
 * Write all attempts for a block and mark the session submitted/complete.
 * Returns a question_id → attempt_id map so the review screen can tag misses.
 */
export async function submitBlock(
  userId: string,
  sessionId: string,
  attempts: AttemptInput[]
): Promise<Map<string, string>> {
  if (PREVIEW) return new Map(attempts.map((a) => [a.question_id, `preview-attempt-${a.question_id}`]));
  const rows = attempts.map((a) => ({ ...a, user_id: userId, block_session_id: sessionId }));
  const { data, error: attemptsError } = await supabase
    .from("attempts")
    .insert(rows)
    .select("id, question_id");
  if (attemptsError) throw attemptsError;

  const { error: sessionError } = await supabase
    .from("block_sessions")
    .update({ submitted_at: new Date().toISOString(), is_complete: true, paused_at: null })
    .eq("id", sessionId);
  if (sessionError) throw sessionError;

  // The block is finalized in `attempts` now — clear the in-progress scratch.
  const { error: progressError } = await supabase.from("block_progress").delete().eq("block_session_id", sessionId);
  if (progressError) throw progressError;

  const map = new Map<string, string>();
  for (const r of (data ?? []) as { id: string; question_id: string }[]) map.set(r.question_id, r.id);
  return map;
}

/**
 * Record a single attempt live (practice / full-exam per-question write).
 * Returns the new attempt id (null in preview / on soft failure) for later tagging.
 */
export async function recordAttempt(userId: string, sessionId: string, a: AttemptInput): Promise<string | null> {
  if (PREVIEW) return `preview-attempt-${a.question_id}`;
  const { data, error } = await supabase
    .from("attempts")
    .insert({ is_review: false, ...a, user_id: userId, block_session_id: sessionId })
    .select("id")
    .single();
  if (error) throw error;
  return data?.id ?? null;
}

/**
 * Set (or clear) the post-exam error classification on a single attempt.
 *
 * Uses `.select()` after the update and asserts EXACTLY ONE row came back. A
 * bare update reports success even when it matches 0 rows (wrong id, or RLS
 * silently filtering the row) — the same silent 0-row write that has bitten
 * this project. Returning-zero now throws, so ErrorTagger rolls back and shows
 * "Couldn't save" instead of pretending the tag persisted. RLS still gates the
 * row to the owning user; a mismatch surfaces here instead of being lost.
 */
export async function updateAttemptErrorTag(attemptId: string, tag: ErrorTag | null): Promise<void> {
  if (PREVIEW || attemptId.startsWith("preview-")) return;
  const { data, error } = await supabase
    .from("attempts")
    .update({ error_tag: tag })
    .eq("id", attemptId)
    .select("id, error_tag");
  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new Error(
      `error_tag write affected ${data?.length ?? 0} rows for attempt ${attemptId} (expected 1) — not saved.`
    );
  }
}

/** Mark a session submitted/complete (practice finishes without a batch submit). */
export async function completeSession(sessionId: string): Promise<void> {
  if (PREVIEW) return;
  const { error } = await supabase
    .from("block_sessions")
    .update({ submitted_at: new Date().toISOString(), is_complete: true })
    .eq("id", sessionId);
  if (error) throw error;
}

/**
 * Every attempt for a user, joined to the facts the dashboard needs to classify
 * it (answer key, position, block, tags) and to its owning session's mode.
 * RLS keeps this to the user's own rows; questions is world-readable to authed.
 */
export async function getAttemptsWithQuestions(userId: string): Promise<AnalyticsAttempt[]> {
  if (PREVIEW) return previewAnalyticsAttempts();
  const { data, error } = await supabase
    .from("attempts")
    .select(
      "id, question_id, created_at, selected_letter, first_letter, changed, error_tag, seconds_spent, first_answer_seconds, flagged, " +
        "questions!inner ( correct_letter, q_number, nbme_form, block_number, discipline_tag, system_tag, question_type ), " +
        "block_sessions ( mode, paused )"
    )
    .eq("user_id", userId)
    .eq("is_review", false); // cold re-attempts never touch score/accuracy/trend analytics
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => {
    const q = Array.isArray(r.questions) ? r.questions[0] : r.questions;
    const s = Array.isArray(r.block_sessions) ? r.block_sessions[0] : r.block_sessions;
    return {
      questionId: r.question_id,
      attemptId: r.id ?? null,
      createdAt: r.created_at ?? "",
      firstLetter: r.first_letter ?? null,
      finalLetter: r.selected_letter ?? null,
      correctLetter: q?.correct_letter ?? "",
      changed: !!r.changed,
      errorTag: (r.error_tag ?? null) as ErrorTag | null,
      flagged: !!r.flagged,
      qNumber: q?.q_number ?? 0,
      nbmeForm: q?.nbme_form ?? 0,
      blockNumber: q?.block_number ?? 0,
      discipline: q?.discipline_tag ?? "—",
      system: q?.system_tag ?? "—",
      questionType: q?.question_type ?? "—",
      mode: s?.mode ?? null,
      paused: !!s?.paused,
      secondsSpent: r.seconds_spent ?? null,
      firstAnswerSeconds: r.first_answer_seconds ?? null,
    } as AnalyticsAttempt;
  });
}

/** Deterministic synthetic dataset so /analytics renders under VITE_PREVIEW. */
function previewAnalyticsAttempts(): AnalyticsAttempt[] {
  const LETTERS = ["A", "B", "C", "D", "E"];
  const disciplines = ["Physiology", "Pathology", "Pharmacology", "Biochemistry", "Behavioral Sciences"];
  const systems = ["Cardiovascular", "Renal", "Neurology", "Endocrine", "Multisystem"];
  const qtypes = ["mechanism", "diagnosis", "next-step", "interpretation", "association"];
  const tags = ["knowledge_gap", "discriminator_miss", "primary_secondary", "process_error"] as const;
  const out: AnalyticsAttempt[] = [];
  // Two full-exam blocks so stamina + pacing have shape.
  for (let block = 1; block <= 2; block++) {
    for (let i = 0; i < 20; i++) {
      const q = (block - 1) * 20 + i + 1;
      const correct = LETTERS[(q * 3) % 5];
      // fatigue: later positions + later block miss more often
      const missBias = (i >= 15 ? 2 : 0) + (block === 2 ? 1 : 0);
      const finalWrong = (q + missBias) % 4 === 0;
      const final = finalWrong ? LETTERS[(q + 1) % 5] : correct;
      // ~1 in 4 answers changed; skew a few of them correct→incorrect
      const didChange = q % 4 === 0;
      const first = didChange
        ? (q % 8 === 0 ? correct : LETTERS[(q + 2) % 5]) // some changed away from the right answer
        : final;
      out.push({
        questionId: `preview-${q}`,
        attemptId: `preview-a-${q}`,
        createdAt: new Date(Date.UTC(2026, 5, block, 0, q)).toISOString(),
        firstLetter: first,
        finalLetter: final,
        correctLetter: correct,
        changed: first !== final,
        errorTag: final !== correct ? tags[q % tags.length] : null,
        flagged: q % 9 === 0,
        qNumber: q,
        nbmeForm: 31,
        blockNumber: block,
        discipline: disciplines[q % disciplines.length],
        system: systems[q % systems.length],
        questionType: qtypes[q % qtypes.length],
        mode: block === 1 ? "block" : "practice",
        paused: false,
        secondsSpent: 40 + ((q * 7) % 60),
        firstAnswerSeconds: 15 + ((q * 5) % 40),
      });
    }
  }
  return out;
}

/**
 * A set of questions with the user's MOST RECENT attempt at each — powers the
 * review QUEUE opened from the wrong-answer filter. Returned in the SAME ORDER
 * as `questionIds` (so the caller controls queue order). Questions with no
 * attempt come back with a null answer; ids not found are skipped.
 */
export async function getReviewQueue(
  userId: string,
  questionIds: string[]
): Promise<{ questions: FullQuestion[]; answers: ReviewAnswer[] }> {
  if (questionIds.length === 0) return { questions: [], answers: [] };
  const { data: qs, error: qErr } = await supabase.from("questions").select(FULL_COLUMNS).in("id", questionIds);
  if (qErr) throw qErr;
  const { data: atts, error: aErr } = await supabase
    .from("attempts")
    .select("id, question_id, selected_letter, seconds_spent, flagged, error_tag, created_at")
    .eq("user_id", userId)
    .in("question_id", questionIds)
    .order("created_at", { ascending: false });
  if (aErr) throw aErr;
  const latest = new Map<string, any>();
  for (const a of (atts ?? []) as any[]) if (!latest.has(a.question_id)) latest.set(a.question_id, a);
  const qById = new Map(((qs ?? []) as any[]).map((q) => [q.id, q as unknown as FullQuestion]));
  const questions: FullQuestion[] = [];
  const answers: ReviewAnswer[] = [];
  for (const id of questionIds) {
    const q = qById.get(id);
    if (!q) continue;
    const a = latest.get(id);
    questions.push(q);
    answers.push({
      selectedLetter: a?.selected_letter ?? null,
      secondsSpent: a?.seconds_spent ?? 0,
      flagged: !!a?.flagged,
      attemptId: a?.id ?? null,
      errorTag: (a?.error_tag ?? null) as ErrorTag | null,
    });
  }
  return { questions, answers };
}

// ── Custom block builder ─────────────────────────────────────────────────────

export interface FilterFacet { value: string; count: number }
export interface FilterFacets {
  system: FilterFacet[];
  discipline: FilterFacet[];
  questionType: FilterFacet[];
}

/** Distinct tag values + counts across the bank — drives the custom-block filters. */
export async function getFilterFacets(): Promise<FilterFacets> {
  const { data, error } = await supabase.from("questions").select("system_tag, discipline_tag, question_type");
  if (error) throw error;
  const rows = (data ?? []) as { system_tag: string; discipline_tag: string; question_type: string }[];
  const tally = (pick: (r: any) => string): FilterFacet[] => {
    const m = new Map<string, number>();
    for (const r of rows) { const v = pick(r) || "—"; m.set(v, (m.get(v) ?? 0) + 1); }
    return [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value));
  };
  return { system: tally((r) => r.system_tag), discipline: tally((r) => r.discipline_tag), questionType: tally((r) => r.question_type) };
}

export interface QuestionFilter {
  system?: string;
  discipline?: string;
  questionType?: string;
}

/** Count of questions matching a custom-block filter (for the live preview). */
export async function countQuestionsByFilter(f: QuestionFilter): Promise<number> {
  let query = supabase.from("questions").select("id", { count: "exact", head: true });
  if (f.system) query = query.eq("system_tag", f.system);
  if (f.discipline) query = query.eq("discipline_tag", f.discipline);
  if (f.questionType) query = query.eq("question_type", f.questionType);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/** Full questions matching a filter, capped at `limit` (custom practice block). */
export async function getQuestionsByFilter(f: QuestionFilter, limit: number): Promise<FullQuestion[]> {
  let query = supabase.from("questions").select(FULL_COLUMNS);
  if (f.system) query = query.eq("system_tag", f.system);
  if (f.discipline) query = query.eq("discipline_tag", f.discipline);
  if (f.questionType) query = query.eq("question_type", f.questionType);
  const { data, error } = await query.order("nbme_form").order("q_number").limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as FullQuestion[];
}

// ── "This explanation didn't help" feedback ──────────────────────────────────

/** Which of these questions the user has flagged as unhelpful. */
export async function getUnhelpfulSet(userId: string, questionIds: string[]): Promise<Set<string>> {
  if (PREVIEW || questionIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("explanation_feedback")
    .select("question_id")
    .eq("user_id", userId)
    .in("question_id", questionIds);
  if (error) throw error;
  return new Set(((data ?? []) as { question_id: string }[]).map((r) => r.question_id));
}

/** Toggle the unhelpful flag. Insert on `on`, delete on `off`. Idempotent-ish. */
export async function setExplanationUnhelpful(userId: string, questionId: string, on: boolean): Promise<void> {
  if (PREVIEW) return;
  if (on) {
    const { error } = await supabase
      .from("explanation_feedback")
      .upsert({ user_id: userId, question_id: questionId }, { onConflict: "user_id,question_id" });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("explanation_feedback")
      .delete()
      .eq("user_id", userId)
      .eq("question_id", questionId);
    if (error) throw error;
  }
}

/** Short-lived signed URL for a private clinical-image object path. */
export async function getSignedImageUrl(objectPath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("clinical-images")
    .createSignedUrl(objectPath, 60 * 60); // 1 hour
  if (error) {
    console.error("[nbme] signed URL error", error);
    return null;
  }
  return data?.signedUrl ?? null;
}
