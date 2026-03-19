import React from 'react';
import { ExamProvider, useExam } from '@/context/ExamContext';
import StartScreen from '@/components/exam/StartScreen';
import ExamScreen from '@/components/exam/ExamScreen';
import BreakScreen from '@/components/exam/BreakScreen';
import CompleteScreen from '@/components/exam/CompleteScreen';
import ResultsScreen from '@/components/exam/ResultsScreen';
import ReviewDeckScreen from '@/components/exam/ReviewDeckScreen';

const ExamRouter: React.FC = () => {
  const { state } = useExam();

  switch (state.phase) {
    case 'start':
      return <StartScreen />;
    case 'exam':
    case 'review':
      return <ExamScreen />;
    case 'break':
      return <BreakScreen />;
    case 'complete':
      return <CompleteScreen />;
    case 'results':
      return <ResultsScreen />;
    case 'reviewDeck':
      return <ReviewDeckScreen />;
    default:
      return <StartScreen />;
  }
};

const Index: React.FC = () => {
  return (
    <ExamProvider>
      <ExamRouter />
    </ExamProvider>
  );
};

export default Index;
