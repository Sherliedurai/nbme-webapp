import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { ExamData, ExamState, QuestionState, BlockState, ConfidenceLevel, ExamHistoryEntry } from '@/types/exam';

const LEGACY_STORAGE_KEY = 'nbme-exam-state';
const HISTORY_KEY = 'nbme-exam-history';
const QUESTIONS_PER_BLOCK = 50;
const BLOCK_TIME_SECONDS = 60 * 60;
const BREAK_TIME_SECONDS = 10 * 60;

function generateStorageKey() {
  return `nbme-exam-${Date.now()}`;
}

// --- Exam History Helpers ---
export function getExamHistory(): ExamHistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch { return []; }
}

function updateExamHistoryEntry(state: ExamState) {
  if (!state.examData || !state.storageKey) return;
  const history = getExamHistory();
  const existing = history.findIndex(h => h.storageKey === state.storageKey);
  const totalBlocks = Math.ceil(state.examData.questions.length / QUESTIONS_PER_BLOCK);
  const completed = state.phase === 'results' || state.phase === 'complete';

  let score: number | undefined;
  if (completed) {
    let correct = 0;
    state.examData.questions.forEach((q, i) => {
      const blockIdx = Math.floor(i / QUESTIONS_PER_BLOCK);
      if (state.blocks[blockIdx]?.questionStates[q.id]?.answer === q.correct) correct++;
    });
    score = Math.round((correct / state.examData.questions.length) * 100);
  }

  const entry: ExamHistoryEntry = {
    id: state.storageKey,
    examName: state.examData.exam_name,
    dateStarted: existing >= 0 ? history[existing].dateStarted : Date.now(),
    storageKey: state.storageKey,
    totalQuestions: state.examData.questions.length,
    completed,
    score,
    currentBlock: state.currentBlock,
    currentQuestionIndex: state.currentQuestionIndex,
    totalBlocks,
  };

  if (existing >= 0) {
    history[existing] = entry;
  } else {
    history.unshift(entry);
  }
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function deleteExamHistoryEntry(id: string) {
  const history = getExamHistory();
  const entry = history.find(h => h.id === id);
  if (entry) localStorage.removeItem(entry.storageKey);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.filter(h => h.id !== id)));
}

type Action =
  | { type: 'LOAD_EXAM'; payload: ExamData }
  | { type: 'BEGIN_EXAM' }
  | { type: 'SET_ANSWER'; payload: { questionId: number; answer: string } }
  | { type: 'SET_CONFIDENCE'; payload: { questionId: number; confidence: ConfidenceLevel } }
  | { type: 'TOGGLE_FLAG'; payload: { questionId: number } }
  | { type: 'SET_NOTES'; payload: { questionId: number; notes: string } }
  | { type: 'SET_HIGHLIGHTS'; payload: { questionId: number; highlights: QuestionState['highlights'] } }
  | { type: 'VISIT_QUESTION'; payload: { questionId: number } }
  | { type: 'GO_TO_QUESTION'; payload: number }
  | { type: 'NEXT_QUESTION' }
  | { type: 'PREV_QUESTION' }
  | { type: 'TICK_TIMER' }
  | { type: 'END_BLOCK' }
  | { type: 'CONTINUE_NEXT_BLOCK' }
  | { type: 'REVIEW_BLOCK' }
  | { type: 'VIEW_RESULTS' }
  | { type: 'START_REVIEW'; payload: { filter: 'all' | 'incorrect' | 'flagged' | 'overconfident'; blockIndex?: number } }
  | { type: 'SET_REVIEW_FILTER'; payload: 'all' | 'incorrect' | 'flagged' | 'overconfident' }
  | { type: 'RESET_EXAM' }
  | { type: 'RESET_KEEP_EXAM' }
  | { type: 'END_EXAM_EARLY' }
  | { type: 'TOGGLE_INSTANT_FEEDBACK' }
  | { type: 'TOGGLE_CONFIDENCE_TRACKING' }
  | { type: 'TOGGLE_TIME_TRACKING' }
  | { type: 'TOGGLE_PAUSE' }
  | { type: 'GO_TO_REVIEW_DECK' }
  | { type: 'RESTORE_STATE'; payload: ExamState };

function createInitialBlockStates(examData: ExamData): BlockState[] {
  const totalBlocks = Math.ceil(examData.questions.length / QUESTIONS_PER_BLOCK);
  const blocks: BlockState[] = [];
  for (let i = 0; i < totalBlocks; i++) {
    const startIdx = i * QUESTIONS_PER_BLOCK;
    const endIdx = Math.min(startIdx + QUESTIONS_PER_BLOCK, examData.questions.length);
    const questionStates: Record<number, QuestionState> = {};
    for (let j = startIdx; j < endIdx; j++) {
      questionStates[examData.questions[j].id] = {
        answer: null,
        flagged: false,
        notes: '',
        visited: false,
        locked: false,
        highlights: [],
        confidence: null,
        timeSpent: 0,
      };
    }
    blocks.push({ blockIndex: i, timeRemaining: BLOCK_TIME_SECONDS, questionStates, completed: false, timeUsed: 0 });
  }
  return blocks;
}

const initialState: ExamState = {
  examData: null,
  phase: 'start',
  currentBlock: 0,
  currentQuestionIndex: 0,
  blocks: [],
  reviewFilter: 'all',
  reviewBlockIndex: null,
  instantFeedback: false,
  confidenceTracking: false,
  timeTracking: false,
  paused: false,
  storageKey: '',
};

function examReducer(state: ExamState, action: Action): ExamState {
  switch (action.type) {
    case 'LOAD_EXAM':
      return {
        ...initialState,
        examData: action.payload,
        blocks: createInitialBlockStates(action.payload),
        storageKey: generateStorageKey(),
      };

    case 'BEGIN_EXAM': {
      const firstQ = state.examData!.questions[0];
      const newBlocks = [...state.blocks];
      newBlocks[0] = {
        ...newBlocks[0],
        questionStates: {
          ...newBlocks[0].questionStates,
          [firstQ.id]: { ...newBlocks[0].questionStates[firstQ.id], visited: true },
        },
      };
      return { ...state, phase: 'exam', currentBlock: 0, currentQuestionIndex: 0, blocks: newBlocks };
    }

    case 'SET_ANSWER': {
      const currentQs = state.blocks[state.currentBlock]?.questionStates[action.payload.questionId];
      if (currentQs?.locked) return state;

      const shouldLock = state.instantFeedback && !state.confidenceTracking;
      return {
        ...state,
        blocks: state.blocks.map((b, i) =>
          i === state.currentBlock
            ? {
                ...b,
                questionStates: {
                  ...b.questionStates,
                  [action.payload.questionId]: {
                    ...b.questionStates[action.payload.questionId],
                    answer: action.payload.answer,
                    locked: shouldLock,
                  },
                },
              }
            : b
        ),
      };
    }

    case 'SET_CONFIDENCE': {
      return {
        ...state,
        blocks: state.blocks.map((b, i) =>
          i === state.currentBlock
            ? {
                ...b,
                questionStates: {
                  ...b.questionStates,
                  [action.payload.questionId]: {
                    ...b.questionStates[action.payload.questionId],
                    confidence: action.payload.confidence,
                    locked: true,
                  },
                },
              }
            : b
        ),
      };
    }

    case 'TOGGLE_FLAG': {
      const qs = state.blocks[state.currentBlock].questionStates[action.payload.questionId];
      return {
        ...state,
        blocks: state.blocks.map((b, i) =>
          i === state.currentBlock
            ? {
                ...b,
                questionStates: {
                  ...b.questionStates,
                  [action.payload.questionId]: { ...qs, flagged: !qs.flagged },
                },
              }
            : b
        ),
      };
    }

    case 'SET_NOTES': {
      return {
        ...state,
        blocks: state.blocks.map((b, i) =>
          i === state.currentBlock
            ? {
                ...b,
                questionStates: {
                  ...b.questionStates,
                  [action.payload.questionId]: {
                    ...b.questionStates[action.payload.questionId],
                    notes: action.payload.notes,
                  },
                },
              }
            : b
        ),
      };
    }

    case 'SET_HIGHLIGHTS': {
      return {
        ...state,
        blocks: state.blocks.map((b, i) =>
          i === state.currentBlock
            ? {
                ...b,
                questionStates: {
                  ...b.questionStates,
                  [action.payload.questionId]: {
                    ...b.questionStates[action.payload.questionId],
                    highlights: action.payload.highlights,
                  },
                },
              }
            : b
        ),
      };
    }

    case 'VISIT_QUESTION': {
      return {
        ...state,
        blocks: state.blocks.map((b, i) =>
          i === state.currentBlock
            ? {
                ...b,
                questionStates: {
                  ...b.questionStates,
                  [action.payload.questionId]: {
                    ...b.questionStates[action.payload.questionId],
                    visited: true,
                  },
                },
              }
            : b
        ),
      };
    }

    case 'GO_TO_QUESTION': {
      const blockStart = state.currentBlock * QUESTIONS_PER_BLOCK;
      const qId = state.examData!.questions[blockStart + action.payload]?.id;
      const newBlocks = state.blocks.map((b, i) =>
        i === state.currentBlock && qId
          ? {
              ...b,
              questionStates: {
                ...b.questionStates,
                [qId]: { ...b.questionStates[qId], visited: true },
              },
            }
          : b
      );
      return { ...state, currentQuestionIndex: action.payload, blocks: newBlocks };
    }

    case 'NEXT_QUESTION': {
      const blockSize = getBlockSize(state);
      if (state.currentQuestionIndex < blockSize - 1) {
        const newIdx = state.currentQuestionIndex + 1;
        const blockStart = state.currentBlock * QUESTIONS_PER_BLOCK;
        const qId = state.examData!.questions[blockStart + newIdx].id;
        return {
          ...state,
          currentQuestionIndex: newIdx,
          blocks: state.blocks.map((b, i) =>
            i === state.currentBlock
              ? {
                  ...b,
                  questionStates: {
                    ...b.questionStates,
                    [qId]: { ...b.questionStates[qId], visited: true },
                  },
                }
              : b
          ),
        };
      }
      return state;
    }

    case 'PREV_QUESTION': {
      if (state.currentQuestionIndex > 0) {
        return { ...state, currentQuestionIndex: state.currentQuestionIndex - 1 };
      }
      return state;
    }

    case 'TICK_TIMER': {
      if (state.phase !== 'exam' || state.paused) return state;
      const block = state.blocks[state.currentBlock];
      if (block.timeRemaining <= 0) {
        return examReducer(state, { type: 'END_BLOCK' });
      }

      const blockStart = state.currentBlock * QUESTIONS_PER_BLOCK;
      const globalIdx = blockStart + state.currentQuestionIndex;
      const currentQId = state.examData?.questions[globalIdx]?.id;

      return {
        ...state,
        blocks: state.blocks.map((b, i) =>
          i === state.currentBlock
            ? {
                ...b,
                timeRemaining: b.timeRemaining - 1,
                timeUsed: b.timeUsed + 1,
                questionStates:
                  currentQId && state.timeTracking
                    ? {
                        ...b.questionStates,
                        [currentQId]: {
                          ...b.questionStates[currentQId],
                          timeSpent: (b.questionStates[currentQId]?.timeSpent || 0) + 1,
                        },
                      }
                    : b.questionStates,
              }
            : b
        ),
      };
    }

    case 'END_BLOCK': {
      const isLastBlock = state.currentBlock >= state.blocks.length - 1;
      return {
        ...state,
        phase: isLastBlock ? 'complete' : 'break',
        paused: false,
        blocks: state.blocks.map((b, i) =>
          i === state.currentBlock ? { ...b, completed: true } : b
        ),
      };
    }

    case 'CONTINUE_NEXT_BLOCK': {
      const nextBlock = state.currentBlock + 1;
      if (nextBlock >= state.blocks.length) {
        return { ...state, phase: 'complete' };
      }
      const blockStart = nextBlock * QUESTIONS_PER_BLOCK;
      const qId = state.examData!.questions[blockStart]?.id;
      return {
        ...state,
        phase: 'exam',
        currentBlock: nextBlock,
        currentQuestionIndex: 0,
        paused: false,
        blocks: state.blocks.map((b, i) =>
          i === nextBlock && qId
            ? {
                ...b,
                questionStates: {
                  ...b.questionStates,
                  [qId]: { ...b.questionStates[qId], visited: true },
                },
              }
            : b
        ),
      };
    }

    case 'REVIEW_BLOCK':
      return { ...state, phase: 'exam' };

    case 'VIEW_RESULTS':
      return { ...state, phase: 'results' };

    case 'START_REVIEW':
      return {
        ...state,
        phase: 'review',
        reviewFilter: action.payload.filter,
        currentBlock: action.payload.blockIndex ?? 0,
        currentQuestionIndex: 0,
      };

    case 'SET_REVIEW_FILTER':
      return { ...state, reviewFilter: action.payload, currentQuestionIndex: 0 };

    case 'END_EXAM_EARLY':
      return {
        ...state,
        phase: 'results',
        paused: false,
        blocks: state.blocks.map((b) => ({ ...b, completed: true })),
      };

    case 'TOGGLE_INSTANT_FEEDBACK':
      return { ...state, instantFeedback: !state.instantFeedback };

    case 'TOGGLE_CONFIDENCE_TRACKING':
      return { ...state, confidenceTracking: !state.confidenceTracking };

    case 'TOGGLE_TIME_TRACKING':
      return { ...state, timeTracking: !state.timeTracking };

    case 'TOGGLE_PAUSE':
      return { ...state, paused: !state.paused };

    case 'GO_TO_REVIEW_DECK':
      return { ...state, phase: 'reviewDeck' };

    case 'RESET_EXAM':
      return initialState;

    case 'RESET_KEEP_EXAM': {
      if (!state.examData) return initialState;
      return {
        ...initialState,
        examData: state.examData,
        blocks: createInitialBlockStates(state.examData),
        storageKey: generateStorageKey(),
      };
    }

    case 'RESTORE_STATE':
      return action.payload;

    default:
      return state;
  }
}

function getBlockSize(state: ExamState): number {
  if (!state.examData) return 0;
  const blockStart = state.currentBlock * QUESTIONS_PER_BLOCK;
  return Math.min(QUESTIONS_PER_BLOCK, state.examData.questions.length - blockStart);
}

interface ExamContextValue {
  state: ExamState;
  dispatch: React.Dispatch<Action>;
  getCurrentQuestion: () => ReturnType<typeof getCurrentQuestionHelper> | null;
  getBlockQuestions: () => ReturnType<typeof getBlockQuestionsHelper>;
  getBlockSize: () => number;
  totalBlocks: number;
  getRunningStats: () => { correct: number; answered: number; total: number };
}

function getCurrentQuestionHelper(state: ExamState) {
  if (!state.examData) return null;
  const blockStart = state.currentBlock * QUESTIONS_PER_BLOCK;
  const globalIdx = blockStart + state.currentQuestionIndex;
  const question = state.examData.questions[globalIdx];
  if (!question) return null;
  const qs = state.blocks[state.currentBlock]?.questionStates[question.id];
  return { question, questionState: qs };
}

function getBlockQuestionsHelper(state: ExamState) {
  if (!state.examData) return [];
  const blockStart = state.currentBlock * QUESTIONS_PER_BLOCK;
  const blockEnd = Math.min(blockStart + QUESTIONS_PER_BLOCK, state.examData.questions.length);
  return state.examData.questions.slice(blockStart, blockEnd).map((q) => ({
    question: q,
    questionState: state.blocks[state.currentBlock]?.questionStates[q.id],
  }));
}

const ExamContext = createContext<ExamContextValue | null>(null);

export function ExamProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(examReducer, initialState);
  const initialized = useRef(false);

  // Restore from localStorage on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try {
      // Try legacy key first
      const saved = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ExamState;
        if (parsed.examData && parsed.phase !== 'start') {
          // Migrate: add new fields if missing
          if (!parsed.storageKey) parsed.storageKey = generateStorageKey();
          if (parsed.confidenceTracking === undefined) parsed.confidenceTracking = false;
          if (parsed.timeTracking === undefined) parsed.timeTracking = false;
          if (parsed.paused === undefined) parsed.paused = false;
          // Migrate question states
          Object.values(parsed.blocks).forEach(block => {
            Object.values(block.questionStates).forEach((qs: any) => {
              if (qs.confidence === undefined) qs.confidence = null;
              if (qs.timeSpent === undefined) qs.timeSpent = 0;
            });
          });
          dispatch({ type: 'RESTORE_STATE', payload: parsed });
        }
      }
    } catch {}
  }, []);

  // Save to localStorage on state change
  useEffect(() => {
    if (state.examData && state.phase !== 'start') {
      try {
        const serialized = JSON.stringify(state);
        localStorage.setItem(LEGACY_STORAGE_KEY, serialized);
        if (state.storageKey) {
          localStorage.setItem(state.storageKey, serialized);
        }
        updateExamHistoryEntry(state);
      } catch {}
    }
  }, [state]);

  // Timer
  useEffect(() => {
    if (state.phase !== 'exam') return;
    const interval = setInterval(() => {
      dispatch({ type: 'TICK_TIMER' });
    }, 1000);
    return () => clearInterval(interval);
  }, [state.phase]);

  const getCurrentQuestion = useCallback(() => getCurrentQuestionHelper(state), [state]);
  const getBlockQuestionsData = useCallback(() => getBlockQuestionsHelper(state), [state]);
  const getBlockSizeFn = useCallback(() => getBlockSize(state), [state]);
  const totalBlocks = state.examData ? Math.ceil(state.examData.questions.length / QUESTIONS_PER_BLOCK) : 0;

  const getRunningStats = useCallback(() => {
    if (!state.examData) return { correct: 0, answered: 0, total: 0 };
    let correct = 0;
    let answered = 0;
    // Count across all blocks up to and including current
    for (let bi = 0; bi <= state.currentBlock; bi++) {
      const block = state.blocks[bi];
      if (!block) continue;
      const start = bi * QUESTIONS_PER_BLOCK;
      const end = Math.min(start + QUESTIONS_PER_BLOCK, state.examData.questions.length);
      for (let qi = start; qi < end; qi++) {
        const q = state.examData.questions[qi];
        const qs = block.questionStates[q.id];
        if (qs?.answer) {
          answered++;
          if (qs.answer === q.correct) correct++;
        }
      }
    }
    return { correct, answered, total: state.examData.questions.length };
  }, [state]);

  return (
    <ExamContext.Provider
      value={{
        state,
        dispatch,
        getCurrentQuestion,
        getBlockQuestions: getBlockQuestionsData,
        getBlockSize: getBlockSizeFn,
        totalBlocks,
        getRunningStats,
      }}
    >
      {children}
    </ExamContext.Provider>
  );
}

export function useExam() {
  const ctx = useContext(ExamContext);
  if (!ctx) throw new Error('useExam must be used within ExamProvider');
  return ctx;
}

export { QUESTIONS_PER_BLOCK, BLOCK_TIME_SECONDS, BREAK_TIME_SECONDS };
