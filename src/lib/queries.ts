import { supabase } from "./supabase";
import { PREVIEW } from "./preview";
import type { AnswerKeyRow, BlockSession, ExamQuestion, FullQuestion, SessionMode } from "./types";

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
  selected_letter: string | null;
  is_correct: boolean;
  seconds_spent: number;
  flagged: boolean;
}

/** Write all attempts for a block and mark the session submitted/complete. */
export async function submitBlock(
  userId: string,
  sessionId: string,
  attempts: AttemptInput[]
): Promise<void> {
  if (PREVIEW) return; // no-op in preview
  const rows = attempts.map((a) => ({ ...a, user_id: userId, block_session_id: sessionId }));
  const { error: attemptsError } = await supabase.from("attempts").insert(rows);
  if (attemptsError) throw attemptsError;

  const { error: sessionError } = await supabase
    .from("block_sessions")
    .update({ submitted_at: new Date().toISOString(), is_complete: true })
    .eq("id", sessionId);
  if (sessionError) throw sessionError;
}

/** Record a single attempt live (practice mode reveals per question). */
export async function recordAttempt(userId: string, sessionId: string, a: AttemptInput): Promise<void> {
  if (PREVIEW) return;
  const { error } = await supabase
    .from("attempts")
    .insert({ ...a, user_id: userId, block_session_id: sessionId });
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
