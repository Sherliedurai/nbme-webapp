import React from 'react';
import { useExam, QUESTIONS_PER_BLOCK } from '@/context/ExamContext';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

const BlockRecapScreen: React.FC<{ onContinue: () => void }> = ({ onContinue }) => {
  const { state } = useExam();
  if (!state.examData) return null;

  const blockIdx = state.currentBlock;
  const block = state.blocks[blockIdx];
  const start = blockIdx * QUESTIONS_PER_BLOCK;
  const end = Math.min(start + QUESTIONS_PER_BLOCK, state.examData.questions.length);
  const blockQs = state.examData.questions.slice(start, end);

  const answered = blockQs.filter((q) => block?.questionStates[q.id]?.answer).length;
  const correct = blockQs.filter((q) => block?.questionStates[q.id]?.answer === q.correct).length;
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;

  // Hardest questions: wrong + confident, or most time spent
  const hardest = blockQs
    .filter((q) => {
      const qs = block?.questionStates[q.id];
      return qs?.answer && qs.answer !== q.correct;
    })
    .sort((a, b) => {
      const qsA = block?.questionStates[a.id];
      const qsB = block?.questionStates[b.id];
      const scoreA = (qsA?.confidence === 'confident' ? 100 : 0) + (qsA?.timeSpent || 0);
      const scoreB = (qsB?.confidence === 'confident' ? 100 : 0) + (qsB?.timeSpent || 0);
      return scoreB - scoreA;
    })
    .slice(0, 3);

  // Weak topics in this block
  const topicMap: Record<string, { correct: number; total: number }> = {};
  blockQs.forEach((q) => {
    const t = q.topic || 'Uncategorized';
    if (!topicMap[t]) topicMap[t] = { correct: 0, total: 0 };
    topicMap[t].total++;
    if (block?.questionStates[q.id]?.answer === q.correct) topicMap[t].correct++;
  });
  const weakTopics = Object.entries(topicMap)
    .map(([topic, d]) => ({ topic, pct: Math.round((d.correct / d.total) * 100) }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3);

  const motivational =
    accuracy >= 80
      ? '🔥 Strong block! Keep this energy.'
      : accuracy >= 60
      ? '👍 Good effort — review the flagged ones.'
      : '💪 Tough block. Focus on the weak topics below.';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full p-6 space-y-5">
        <div className="bg-navy text-navy-foreground rounded-lg p-5 text-center">
          <h1 className="text-xl font-bold">Block {blockIdx + 1} Recap</h1>
          <p className="text-3xl font-bold mt-1">
            {correct}/{answered} ({accuracy}%)
          </p>
          <p className="text-sm mt-2 opacity-80">{motivational}</p>
        </div>

        {hardest.length > 0 && (
          <div className="bg-card rounded-lg border p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Hardest Questions</h3>
            <div className="space-y-2">
              {hardest.map((q, i) => {
                const idx = blockQs.indexOf(q);
                const qs = block?.questionStates[q.id];
                return (
                  <div key={q.id} className="flex items-center justify-between text-sm">
                    <span>
                      Q{idx + 1} — <span className="text-muted-foreground">{q.topic}</span>
                    </span>
                    <div className="flex items-center gap-2 text-xs">
                      {qs?.confidence === 'confident' && (
                        <span className="text-destructive font-medium">Overconfident</span>
                      )}
                      {(qs?.timeSpent || 0) > 60 && (
                        <span className="text-muted-foreground">{Math.floor((qs?.timeSpent || 0) / 60)}m</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {weakTopics.length > 0 && (
          <div className="bg-card rounded-lg border p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Topics to Review</h3>
            <div className="space-y-1.5">
              {weakTopics.map((t) => (
                <div key={t.topic} className="flex items-center justify-between text-sm">
                  <span>{t.topic}</span>
                  <span className={`font-semibold text-xs ${t.pct < 60 ? 'text-destructive' : t.pct < 80 ? 'text-warning' : 'text-success'}`}>
                    {t.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button size="lg" onClick={onContinue} className="w-full gap-2">
          <ArrowRight className="h-4 w-4" />
          Continue
        </Button>
      </div>
    </div>
  );
};

export default BlockRecapScreen;
