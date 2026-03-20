import React from 'react';
import { useExam } from '@/context/ExamContext';
import { Button } from '@/components/ui/button';
import { CheckCircle, BarChart3 } from 'lucide-react';

const CompleteScreen: React.FC = () => {
  const { dispatch } = useExam();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md mx-auto p-8">
        <div className="bg-navy text-navy-foreground rounded-lg p-8 mb-6">
          <CheckCircle className="h-16 w-16 mx-auto mb-4" />
          <h1 className="text-3xl font-bold">Exam Complete</h1>
          <p className="mt-2 opacity-80">You have completed all blocks.</p>
        </div>
        <Button size="lg" onClick={() => dispatch({ type: 'VIEW_RESULTS' })} className="w-full gap-2">
          <BarChart3 className="h-5 w-5" />
          View Results
        </Button>
      </div>
    </div>
  );
};

export default CompleteScreen;
