export interface ExplanationStructured {
  bottom_line: string;
  remember_as?: string;
  watch_out: string[];
  high_yield?: string[];
  how_else_tested?: string[];
  verification_note?: string;
}

export interface ExamQuestion {
  id: number;
  stem: string;
  stem_warning?: boolean;
  image: string | null;
  options: Record<string, string>;
  correct: string;
  topic: string;
  explanation_structured?: ExplanationStructured;
  explanation_full?: string;
}

export interface ExamData {
  exam_name: string;
  total_questions: number;
  questions: ExamQuestion[];
}

export type ConfidenceLevel = 'guessing' | 'unsure' | 'confident' | 'not_rated';

export interface QuestionState {
  answer: string | null;
  flagged: boolean;
  notes: string;
  visited: boolean;
  locked: boolean;
  highlights: Array<{ start: number; end: number; type: 'highlight' | 'strikethrough' }>;
  confidence: ConfidenceLevel | null;
  timeSpent: number;
  whyWrong: string;
  streak: number;
}

export interface BlockState {
  blockIndex: number;
  timeRemaining: number;
  questionStates: Record<number, QuestionState>;
  completed: boolean;
  timeUsed: number;
}

export type ExamPhase = 'start' | 'exam' | 'break' | 'blockRecap' | 'complete' | 'results' | 'review' | 'reviewDeck';

export interface ExamState {
  examData: ExamData | null;
  phase: ExamPhase;
  currentBlock: number;
  currentQuestionIndex: number;
  blocks: BlockState[];
  reviewFilter: 'all' | 'incorrect' | 'flagged' | 'overconfident';
  reviewBlockIndex: number | null;
  instantFeedback: boolean;
  confidenceTracking: boolean;
  timeTracking: boolean;
  paused: boolean;
  storageKey: string;
}

export interface ReviewDeckItem {
  questionId: number;
  examName: string;
  question: ExamQuestion;
  userAnswer: string;
  confidence: ConfidenceLevel | null;
  addedAt: number;
}

export interface ExamHistoryEntry {
  id: string;
  examName: string;
  dateStarted: number;
  storageKey: string;
  totalQuestions: number;
  completed: boolean;
  score?: number;
  currentBlock: number;
  currentQuestionIndex: number;
  totalBlocks: number;
}
