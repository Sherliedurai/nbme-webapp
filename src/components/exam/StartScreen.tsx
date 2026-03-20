import React, { useRef, useState } from 'react';
import { useExam, getExamHistory, deleteExamHistoryEntry } from '@/context/ExamContext';
import { ExamData, ExamState, ExamHistoryEntry } from '@/types/exam';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Upload, BookOpen, Play, FlaskConical, Zap, Timer, Brain, Trash2, RotateCcw, Eye, Pin } from 'lucide-react';
import { useReviewDeck } from '@/hooks/useReviewDeck';
import demoExam from '@/data/demoExam';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

const StartScreen: React.FC = () => {
  const { state, dispatch } = useExam();
  const { deck } = useReviewDeck();
  const fileRef = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<ExamHistoryEntry[]>(getExamHistory);
  const [resumePrompt, setResumePrompt] = useState<{ entry: ExamHistoryEntry; newData: ExamData } | null>(null);

  const refreshHistory = () => setHistory(getExamHistory());

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as ExamData;
        if (!data.questions || !Array.isArray(data.questions)) {
          alert('Invalid JSON format. Must contain a "questions" array.');
          return;
        }
        data.total_questions = data.total_questions || data.questions.length;

        // Check if same exam name exists in history (not completed)
        const existing = history.find(h => h.examName === data.exam_name && !h.completed);
        if (existing) {
          setResumePrompt({ entry: existing, newData: data });
        } else {
          dispatch({ type: 'LOAD_EXAM', payload: data });
        }
      } catch {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
  };

  const handleResume = (entry: ExamHistoryEntry) => {
    try {
      const saved = localStorage.getItem(entry.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as ExamState;
        // Migrate missing fields
        if (parsed.confidenceTracking === undefined) parsed.confidenceTracking = false;
        if (parsed.timeTracking === undefined) parsed.timeTracking = false;
        if (parsed.paused === undefined) parsed.paused = false;
        if (!parsed.storageKey) parsed.storageKey = entry.storageKey;
        dispatch({ type: 'RESTORE_STATE', payload: parsed });
      }
    } catch {}
  };

  const handleDelete = (entry: ExamHistoryEntry) => {
    deleteExamHistoryEntry(entry.id);
    refreshHistory();
  };

  const examData = state.examData;
  const totalBlocks = examData ? Math.ceil(examData.questions.length / 50) : 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-lg mx-auto p-8">
        <div className="bg-navy text-navy-foreground rounded-lg p-6 mb-8">
          <BookOpen className="h-12 w-12 mx-auto mb-4" />
          <h1 className="text-3xl font-bold">NBME Practice Exam</h1>
          <p className="mt-2 text-sm opacity-80">USMLE Board Exam Simulator</p>
        </div>

        {!examData ? (
          <>
            <input ref={fileRef} type="file" accept=".json" onChange={handleUpload} className="hidden" />
            <Button size="lg" onClick={() => fileRef.current?.click()} className="w-full gap-2">
              <Upload className="h-5 w-5" />
              Upload Exam JSON
            </Button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <Button size="lg" variant="outline" onClick={() => dispatch({ type: 'LOAD_EXAM', payload: demoExam })} className="w-full gap-2">
              <FlaskConical className="h-5 w-5" />
              Try Demo Exam (10 Questions)
            </Button>

            {/* Review Deck */}
            {deck.length > 0 && (
              <Button
                size="lg"
                variant="outline"
                onClick={() => dispatch({ type: 'GO_TO_REVIEW_DECK' })}
                className="w-full gap-2 mt-3"
              >
                <Pin className="h-5 w-5" />
                Review Deck ({deck.length} questions)
              </Button>
            )}

            <p className="text-sm text-muted-foreground mt-4">
              Upload your own JSON or try the built-in demo.
            </p>

            {/* Exam History */}
            {history.length > 0 && (
              <div className="mt-8 text-left">
                <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase">Your Exams</h2>
                <div className="space-y-2">
                  {history.map((entry) => (
                    <div key={entry.id} className="bg-card rounded-lg border p-3 flex items-center justify-between">
                      <div className="text-left">
                        <p className="text-sm font-medium">{entry.examName}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(entry.dateStarted).toLocaleDateString()} —{' '}
                          {entry.completed
                            ? `Completed — ${entry.score}%`
                            : `Block ${entry.currentBlock + 1} of ${entry.totalBlocks} — Q${entry.currentQuestionIndex + 1}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {!entry.completed && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleResume(entry)}>
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Resume
                          </Button>
                        )}
                        {entry.completed && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleResume(entry)}>
                            <Eye className="h-3 w-3 mr-1" />
                            Review
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => handleDelete(entry)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div className="bg-card rounded-lg border p-6 text-left space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Exam Name</span>
                <span className="font-semibold">{examData.exam_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Questions</span>
                <span className="font-semibold">{examData.questions.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Blocks</span>
                <span className="font-semibold">{totalBlocks}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Time per Block</span>
                <span className="font-semibold">60 minutes</span>
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-2">
              {/* Instant Feedback */}
              <div className="bg-card rounded-lg border p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 text-left">
                  <Zap className="h-5 w-5 text-warning flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">Instant Feedback Mode</p>
                    <p className="text-xs text-muted-foreground">See answers & explanations after each question</p>
                  </div>
                </div>
                <Switch checked={state.instantFeedback} onCheckedChange={() => dispatch({ type: 'TOGGLE_INSTANT_FEEDBACK' })} />
              </div>

              {/* Confidence Tracking */}
              <div className="bg-card rounded-lg border p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 text-left">
                  <Brain className="h-5 w-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">Confidence Tracking</p>
                    <p className="text-xs text-muted-foreground">Rate your confidence before seeing answers</p>
                  </div>
                </div>
                <Switch checked={state.confidenceTracking} onCheckedChange={() => dispatch({ type: 'TOGGLE_CONFIDENCE_TRACKING' })} />
              </div>

              {/* Time Tracking */}
              <div className="bg-card rounded-lg border p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 text-left">
                  <Timer className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">Track Time Per Question</p>
                    <p className="text-xs text-muted-foreground">See how long you spend on each question</p>
                  </div>
                </div>
                <Switch checked={state.timeTracking} onCheckedChange={() => dispatch({ type: 'TOGGLE_TIME_TRACKING' })} />
              </div>
            </div>

            <Button size="lg" onClick={() => dispatch({ type: 'BEGIN_EXAM' })} className="w-full gap-2">
              <Play className="h-5 w-5" />
              Begin Exam
            </Button>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  localStorage.removeItem('nbme-exam-state');
                  dispatch({ type: 'LOAD_EXAM', payload: examData });
                }}
                className="flex-1"
              >
                Reset Progress
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  dispatch({ type: 'RESET_EXAM' });
                  if (fileRef.current) fileRef.current.value = '';
                }}
                className="flex-1"
              >
                Different Exam
              </Button>
            </div>
          </div>
        )}

        {/* Resume Prompt Dialog */}
        <Dialog open={!!resumePrompt} onOpenChange={() => setResumePrompt(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Resume or Start Fresh?</DialogTitle>
              <DialogDescription>
                You have a previous attempt for "{resumePrompt?.entry.examName}". Would you like to resume or start fresh?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                if (resumePrompt) handleResume(resumePrompt.entry);
                setResumePrompt(null);
              }}>
                Resume Previous
              </Button>
              <Button onClick={() => {
                if (resumePrompt) dispatch({ type: 'LOAD_EXAM', payload: resumePrompt.newData });
                setResumePrompt(null);
              }}>
                Start Fresh
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default StartScreen;
