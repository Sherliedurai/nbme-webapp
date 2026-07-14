// ── Database row shapes (mirror the Supabase schema) ────────────────────────

export interface QuestionOption {
  letter: string; // "A".."Z"
  text: string;
}

/**
 * Exam-safe projection of a question. Deliberately OMITS correct_letter,
 * source_explanation, and enriched_explanation so the answer key is never even
 * present in the client during a live block (brief §4: no spoilers).
 */
export interface ExamQuestion {
  id: string;
  block_number: number;
  q_number: number;
  vignette_text: string;
  options: QuestionOption[];
  clinical_image_url: string | null;
  system_tag: string;
  discipline_tag: string;
  question_type: string;
}

/** Fetched only at submit time to score answers locally. */
export interface AnswerKeyRow {
  id: string;
  correct_letter: string;
}

/** Full question incl. answer + explanations — used by Practice and Review. */
export interface FullQuestion extends ExamQuestion {
  correct_letter: string;
  source_explanation: string;
  enriched_explanation: EnrichedExplanation | null;
}

export type SessionMode = "block" | "full_exam" | "practice";

export interface BlockSession {
  id: string;
  user_id: string;
  block_number: number | null;
  mode: SessionMode;
  started_at: string;
  submitted_at: string | null;
  is_complete: boolean;
}

export interface Attempt {
  id: string;
  user_id: string;
  question_id: string;
  block_session_id: string | null;
  selected_letter: string | null; // final answer
  first_letter: string | null; // first-instinct answer (captured once)
  changed: boolean; // final != first
  error_tag: string | null; // post-exam miss classification
  is_correct: boolean | null;
  seconds_spent: number | null;
  flagged: boolean;
  created_at: string;
}

// ── Enriched explanation JSON (5 sections; stored as jsonb) ─────────────────
// Text fields may contain **bold** markdown for key words.

export interface Knockdown {
  option: string; // e.g. "SERMs (raloxifene)"
  reason: string;
}

export interface GroundedFact {
  fact: string;
  source: string; // Mehlman "HY … › …" label, or "model"
}

export interface HowTheyTest {
  scenario: string;
  answer: string;
  source: string;
}

export interface EnrichedExplanation {
  answer_lock: string;
  hook: string;
  knockdowns: Knockdown[];
  high_yield: GroundedFact[];
  how_they_test: HowTheyTest[];
}

// ── In-memory per-question state during a live block ────────────────────────

export interface QuestionState {
  selectedLetter: string | null; // current/final selection
  firstLetter: string | null; // first radio commit; set once, never overwritten
  struckLetters: string[]; // options crossed out (visual only)
  flagged: boolean;
  secondsSpent: number; // accumulated dwell time
  visited: boolean;
  highlightHtml: string | null; // saved vignette highlight markup
}
