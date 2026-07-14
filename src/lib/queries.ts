import { supabase } from "./supabase";
import { PREVIEW } from "./preview";
import type { AnswerKeyRow, BlockSession, ExamQuestion, FullQuestion, SessionMode } from "./types";
import type { AnalyticsAttempt, ErrorTag } from "./analytics";

const EXAM_COLUMNS =
  "id, block_number, q_number, vignette_text, options, clinical_image_url, system_tag, discipline_tag, question_type";
const FULL_COLUMNS = EXAM_COLUMNS + ", correct_letter, source_explanation, enriched_explanation";

/**
 * Full questions for a block (answer + explanations + enrichment). Used by
 * Practice (immediate reveal) and Review — NOT during a live block/exam.
 */
export async function getFullQuestions(blockNumber: number): Promise<FullQuestion[]> {
  if (PREVIEW) {
    const { previewFullQuestions } = await import("@/mock/block1");
    return previewFullQuestions.filter((q) => q.block_number === blockNumber);
  }
  const { data, error } = await supabase
    .from("questions")
    .select(FULL_COLUMNS)
    .eq("block_number", blockNumber)
    .order("q_number", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as FullQuestion[];
}

/** Total number of distinct blocks in the bank (for "Block X of Y"). */
export async function getBlockCount(): Promise<number> {
  if (PREVIEW) return 1;
  const { data, error } = await supabase
    .from("questions")
    .select("block_number")
    .order("block_number", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.block_number ?? 0;
}

/** Exam-safe questions for a block, in q_number order. No answer key included. */
export async function getExamQuestions(blockNumber: number): Promise<ExamQuestion[]> {
  if (PREVIEW) {
    const { previewExamQuestions } = await import("@/mock/block1");
    return previewExamQuestions.filter((q) => q.block_number === blockNumber);
  }
  const { data, error } = await supabase
    .from("questions")
    .select(EXAM_COLUMNS)
    .eq("block_number", blockNumber)
    .order("q_number", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ExamQuestion[];
}

/** Answer key for scoring — fetched ONLY at submit time. */
export async function getAnswerKey(questionIds: string[]): Promise<Map<string, string>> {
  if (questionIds.length === 0) return new Map();
  if (PREVIEW) {
    const { previewAnswerKey } = await import("@/mock/block1");
    return new Map(questionIds.map((id) => [id, previewAnswerKey.get(id) ?? ""]));
  }
  const { data, error } = await supabase
    .from("questions")
    .select("id, correct_letter")
    .in("id", questionIds);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of (data ?? []) as AnswerKeyRow[]) map.set(row.id, row.correct_letter);
  return map;
}

/** Create a block session owned by the current user. */
export async function createBlockSession(
  userId: string,
  blockNumber: number,
  mode: SessionMode = "block"
): Promise<BlockSession> {
  if (PREVIEW) {
    return {
      id: `preview-session-${blockNumber}`,
      user_id: userId,
      block_number: blockNumber,
      mode,
      started_at: new Date().toISOString(),
      submitted_at: null,
      is_complete: false,
    };
  }
  const { data, error } = await supabase
    .from("block_sessions")
    .insert({ user_id: userId, block_number: blockNumber, mode })
    .select()
    .single();
  if (error) throw error;
  return data as BlockSession;
}

export interface AttemptInput {
  question_id: string;
  selected_letter: string | null; // final answer
  first_letter: string | null; // first-instinct answer (captured once)
  changed: boolean; // final != first
  is_correct: boolean;
  seconds_spent: number;
  flagged: boolean;
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
    .update({ submitted_at: new Date().toISOString(), is_complete: true })
    .eq("id", sessionId);
  if (sessionError) throw sessionError;

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
    .insert({ ...a, user_id: userId, block_session_id: sessionId })
    .select("id")
    .single();
  if (error) throw error;
  return data?.id ?? null;
}

/** Set (or clear) the post-exam error classification on a single attempt. */
export async function updateAttemptErrorTag(attemptId: string, tag: ErrorTag | null): Promise<void> {
  if (PREVIEW || attemptId.startsWith("preview-")) return;
  const { error } = await supabase.from("attempts").update({ error_tag: tag }).eq("id", attemptId);
  if (error) throw error;
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
      "selected_letter, first_letter, changed, error_tag, seconds_spent, " +
        "questions!inner ( correct_letter, q_number, block_number, discipline_tag, system_tag ), " +
        "block_sessions ( mode )"
    )
    .eq("user_id", userId);
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => {
    const q = Array.isArray(r.questions) ? r.questions[0] : r.questions;
    const s = Array.isArray(r.block_sessions) ? r.block_sessions[0] : r.block_sessions;
    return {
      firstLetter: r.first_letter ?? null,
      finalLetter: r.selected_letter ?? null,
      correctLetter: q?.correct_letter ?? "",
      changed: !!r.changed,
      errorTag: (r.error_tag ?? null) as ErrorTag | null,
      qNumber: q?.q_number ?? 0,
      blockNumber: q?.block_number ?? 0,
      discipline: q?.discipline_tag ?? "—",
      system: q?.system_tag ?? "—",
      mode: s?.mode ?? null,
      secondsSpent: r.seconds_spent ?? null,
    } as AnalyticsAttempt;
  });
}

/** Deterministic synthetic dataset so /analytics renders under VITE_PREVIEW. */
function previewAnalyticsAttempts(): AnalyticsAttempt[] {
  const LETTERS = ["A", "B", "C", "D", "E"];
  const disciplines = ["Physiology", "Pathology", "Pharmacology", "Biochemistry", "Behavioral Sciences"];
  const systems = ["Cardiovascular", "Renal", "Neurology", "Endocrine", "Multisystem"];
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
        firstLetter: first,
        finalLetter: final,
        correctLetter: correct,
        changed: first !== final,
        errorTag: final !== correct ? tags[q % tags.length] : null,
        qNumber: q,
        blockNumber: block,
        discipline: disciplines[q % disciplines.length],
        system: systems[q % systems.length],
        mode: "full_exam",
        secondsSpent: 40 + ((q * 7) % 60),
      });
    }
  }
  return out;
}

/** Short-lived signed URL for a private clinical-image object path. */
export async function getSignedImageUrl(objectPath: string): Promise<string | null> {
  if (PREVIEW) {
    const { previewImageUrls } = await import("@/mock/block1");
    return previewImageUrls[objectPath] ?? null;
  }
  const { data, error } = await supabase.storage
    .from("clinical-images")
    .createSignedUrl(objectPath, 60 * 60); // 1 hour
  if (error) {
    console.error("[nbme] signed URL error", error);
    return null;
  }
  return data?.signedUrl ?? null;
}
