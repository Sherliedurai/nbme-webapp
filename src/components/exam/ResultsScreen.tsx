import React, { useState } from 'react';
import { useExam, QUESTIONS_PER_BLOCK } from '@/context/ExamContext';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Eye, Flag, RotateCcw, RefreshCw, AlertTriangle, Pin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

const ResultsScreen: React.FC = () => {
  const { state, dispatch, totalBlocks } = useExam();
  const [showStartOver, setShowStartOver] = useState(false);
  const { examData, blocks } = state;

  if (!examData) return null;

  let totalCorrect = 0;
  const totalQuestions = examData.questions.length;

  const blockResults = blocks.map((block, blockIdx) => {
    const start = blockIdx * QUESTIONS_PER_BLOCK;
    const end = Math.min(start + QUESTIONS_PER_BLOCK, totalQuestions);
    const blockQs = examData.questions.slice(start, end);
    let correct = 0;
    blockQs.forEach((q) => {
      if (block.questionStates[q.id]?.answer === q.correct) correct++;
    });
    totalCorrect += correct;
    return {
      block: blockIdx + 1,
      correct,
      total: blockQs.length,
      pct: Math.round((correct / blockQs.length) * 100),
      timeUsed: block.timeUsed,
    };
  });

  // Topic breakdown with confidence data
  const topicMap: Record<string, { correct: number; total: number; confidentWrong: number; guessingWrong: number }> = {};
  examData.questions.forEach((q) => {
    const topic = q.topic || 'Uncategorized';
    if (!topicMap[topic]) topicMap[topic] = { correct: 0, total: 0, confidentWrong: 0, guessingWrong: 0 };
    topicMap[topic].total++;
    const blockIdx = Math.floor(examData.questions.indexOf(q) / QUESTIONS_PER_BLOCK);
    const qs = blocks[blockIdx]?.questionStates[q.id];
    if (qs?.answer === q.correct) {
      topicMap[topic].correct++;
    } else if (qs?.answer) {
      if (qs.confidence === 'confident') topicMap[topic].confidentWrong++;
      if (qs.confidence === 'guessing') topicMap[topic].guessingWrong++;
    }
  });

  const topicResults = Object.entries(topicMap)
    .map(([topic, data]) => ({ topic, ...data, pct: Math.round((data.correct / data.total) * 100) }))
    .sort((a, b) => a.pct - b.pct);

  // Confidence breakdown
  const confidenceStats = { guessing: { correct: 0, total: 0 }, unsure: { correct: 0, total: 0 }, confident: { correct: 0, total: 0 }, not_rated: { correct: 0, total: 0 } };
  examData.questions.forEach((q) => {
    const blockIdx = Math.floor(examData.questions.indexOf(q) / QUESTIONS_PER_BLOCK);
    const qs = blocks[blockIdx]?.questionStates[q.id];
    if (qs?.answer && qs.confidence) {
      const key = qs.confidence as keyof typeof confidenceStats;
      if (confidenceStats[key]) {
        confidenceStats[key].total++;
        if (qs.answer === q.correct) confidenceStats[key].correct++;
      }
    }
  });

  const hasConfidenceData = Object.values(confidenceStats).some(v => v.total > 0);
  const overallPct = Math.round((totalCorrect / totalQuestions) * 100);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getPctColor = (pct: number) => {
    if (pct < 60) return 'text-destructive';
    if (pct < 80) return 'text-warning';
    return 'text-success';
  };

  const getTopicBadge = (pct: number) => {
    if (pct < 60) return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">WEAK</Badge>;
    if (pct < 75) return <Badge className="text-[10px] px-1.5 py-0 bg-warning text-warning-foreground">REVIEW</Badge>;
    return null;
  };

  const downloadCSV = () => {
    let csv = 'Topic,Correct,Total,Percentage\n';
    topicResults.forEach((r) => {
      csv += `"${r.topic}",${r.correct},${r.total},${r.pct}%\n`;
    });
    csv += `\nOverall,${totalCorrect},${totalQuestions},${overallPct}%\n`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${examData.exam_name}_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReviewOverconfident = () => {
    dispatch({ type: 'START_REVIEW', payload: { filter: 'overconfident' } });
  };

  const handlePracticeWeakTopic = (topic: string) => {
    // Start review of incorrect questions for this topic
    // Find the first block containing incorrect questions for this topic
    dispatch({ type: 'START_REVIEW', payload: { filter: 'incorrect' } });
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-navy text-navy-foreground rounded-lg p-6 text-center">
          <h1 className="text-2xl font-bold">{examData.exam_name} - Results</h1>
          <p className="text-4xl font-bold mt-2">
            {totalCorrect} / {totalQuestions} ({overallPct}%)
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Block Breakdown */}
          <div className="bg-card rounded-lg border p-4">
            <h2 className="font-semibold mb-3">Block Performance</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Block</TableHead>
                  <TableHead>Correct</TableHead>
                  <TableHead>%</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blockResults.map((r) => (
                  <TableRow key={r.block}>
                    <TableCell className="font-medium">Block {r.block}</TableCell>
                    <TableCell>{r.correct}/{r.total}</TableCell>
                    <TableCell className={`font-semibold ${getPctColor(r.pct)}`}>{r.pct}%</TableCell>
                    <TableCell>{formatTime(r.timeUsed)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Confidence Breakdown */}
          {hasConfidenceData && (
            <div className="bg-card rounded-lg border p-4">
              <h2 className="font-semibold mb-3">Accuracy by Confidence</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Level</TableHead>
                    <TableHead>Correct</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(['confident', 'unsure', 'guessing', 'not_rated'] as const).map(level => {
                    const s = confidenceStats[level];
                    if (s.total === 0) return null;
                    const pct = Math.round((s.correct / s.total) * 100);
                    const labels = { confident: '💪 Confident', unsure: '🤔 Unsure', guessing: '🎲 Guessing', not_rated: '— Not rated' };
                    return (
                      <TableRow
                        key={level}
                        className="cursor-pointer hover:bg-accent"
                        onClick={() => {
                          if (level === 'confident' && s.total - s.correct > 0) handleReviewOverconfident();
                        }}
                      >
                        <TableCell className="font-medium">{labels[level]}</TableCell>
                        <TableCell>{s.correct}</TableCell>
                        <TableCell>{s.total}</TableCell>
                        <TableCell className={`font-semibold ${getPctColor(pct)}`}>{pct}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {confidenceStats.confident.total - confidenceStats.confident.correct > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 text-xs text-destructive border-destructive/30"
                  onClick={handleReviewOverconfident}
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Review {confidenceStats.confident.total - confidenceStats.confident.correct} Overconfident Errors
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Focus Areas (Weak Topics) */}
        <div className="bg-card rounded-lg border p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Focus Areas
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Topic</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>%</TableHead>
                {hasConfidenceData && <TableHead>Confident Wrong</TableHead>}
                {hasConfidenceData && <TableHead>Guessing Wrong</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topicResults.map((r) => (
                <TableRow key={r.topic}>
                  <TableCell className="font-medium">{r.topic}</TableCell>
                  <TableCell>{r.correct}/{r.total}</TableCell>
                  <TableCell className={`font-semibold ${getPctColor(r.pct)}`}>{r.pct}%</TableCell>
                  {hasConfidenceData && <TableCell className="text-destructive">{r.confidentWrong || '—'}</TableCell>}
                  {hasConfidenceData && <TableCell className="text-muted-foreground">{r.guessingWrong || '—'}</TableCell>}
                  <TableCell>{getTopicBadge(r.pct)}</TableCell>
                  <TableCell>
                    {r.pct < 75 && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => handlePracticeWeakTopic(r.topic)}>
                        Practice
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 justify-center">
          <Button onClick={() => dispatch({ type: 'START_REVIEW', payload: { filter: 'incorrect' } })} className="gap-2">
            <Eye className="h-4 w-4" />
            Review Incorrect
          </Button>
          <Button onClick={() => dispatch({ type: 'START_REVIEW', payload: { filter: 'flagged' } })} variant="outline" className="gap-2">
            <Flag className="h-4 w-4" />
            Review Flagged
          </Button>
          {hasConfidenceData && (
            <Button onClick={handleReviewOverconfident} variant="outline" className="gap-2 text-destructive border-destructive/30">
              <AlertTriangle className="h-4 w-4" />
              Review Overconfident
            </Button>
          )}
          <Button onClick={() => dispatch({ type: 'START_REVIEW', payload: { filter: 'all' } })} variant="outline" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Review All
          </Button>
          <Button onClick={() => dispatch({ type: 'GO_TO_REVIEW_DECK' })} variant="outline" className="gap-2">
            <Pin className="h-4 w-4" />
            Review Deck
          </Button>
          <Button onClick={downloadCSV} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Download CSV
          </Button>
          <Button onClick={() => setShowStartOver(true)} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Start Over
          </Button>
          <Button onClick={() => dispatch({ type: 'RESET_EXAM' })} variant="destructive" className="gap-2">
            New Exam
          </Button>
        </div>

        <Dialog open={showStartOver} onOpenChange={setShowStartOver}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start Over?</DialogTitle>
              <DialogDescription>
                This will clear all answers and restart from the beginning with the same exam.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowStartOver(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setShowStartOver(false);
                  dispatch({ type: 'RESET_KEEP_EXAM' });
                }}
              >
                Start Over
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ResultsScreen;
