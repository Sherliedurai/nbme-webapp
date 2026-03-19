import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onClose: () => void;
}

const CalculatorModal: React.FC<Props> = ({ open, onClose }) => {
  const [display, setDisplay] = useState('0');
  const [memory, setMemory] = useState(0);
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [resetNext, setResetNext] = useState(false);

  const handleNumber = (num: string) => {
    if (resetNext) {
      setDisplay(num);
      setResetNext(false);
    } else {
      setDisplay(display === '0' ? num : display + num);
    }
  };

  const handleDecimal = () => {
    if (resetNext) {
      setDisplay('0.');
      setResetNext(false);
    } else if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const calculate = () => {
    if (prevValue === null || !operation) return;
    const current = parseFloat(display);
    let result = 0;
    switch (operation) {
      case '+': result = prevValue + current; break;
      case '-': result = prevValue - current; break;
      case '×': result = prevValue * current; break;
      case '÷': result = current !== 0 ? prevValue / current : 0; break;
      default: return;
    }
    setDisplay(String(parseFloat(result.toFixed(10))));
    setPrevValue(null);
    setOperation(null);
    setResetNext(true);
  };

  const handleOperation = (op: string) => {
    if (prevValue !== null && operation) {
      calculate();
    }
    setPrevValue(parseFloat(display));
    setOperation(op);
    setResetNext(true);
  };

  const handleClear = () => {
    setDisplay('0');
    setPrevValue(null);
    setOperation(null);
    setResetNext(false);
  };

  const handlePercent = () => {
    setDisplay(String(parseFloat(display) / 100));
    setResetNext(true);
  };

  const handleSqrt = () => {
    const val = parseFloat(display);
    setDisplay(val >= 0 ? String(parseFloat(Math.sqrt(val).toFixed(10))) : 'Error');
    setResetNext(true);
  };

  const handleSign = () => {
    setDisplay(String(-parseFloat(display)));
  };

  const buttonClass = "h-10 text-sm font-medium rounded";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Calculator</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="bg-muted rounded-lg p-3 text-right text-2xl font-mono overflow-hidden">
            {display}
          </div>

          {/* Memory row */}
          <div className="grid grid-cols-4 gap-1">
            <Button variant="outline" className={buttonClass} onClick={() => setMemory(0)}>MC</Button>
            <Button variant="outline" className={buttonClass} onClick={() => { setDisplay(String(memory)); setResetNext(true); }}>MR</Button>
            <Button variant="outline" className={buttonClass} onClick={() => setMemory(memory + parseFloat(display))}>M+</Button>
            <Button variant="outline" className={buttonClass} onClick={() => setMemory(memory - parseFloat(display))}>M-</Button>
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-4 gap-1">
            <Button variant="secondary" className={buttonClass} onClick={handleClear}>C</Button>
            <Button variant="secondary" className={buttonClass} onClick={handleSign}>±</Button>
            <Button variant="secondary" className={buttonClass} onClick={handlePercent}>%</Button>
            <Button className={`${buttonClass} bg-primary`} onClick={() => handleOperation('÷')}>÷</Button>

            {['7','8','9'].map(n => <Button key={n} variant="outline" className={buttonClass} onClick={() => handleNumber(n)}>{n}</Button>)}
            <Button className={`${buttonClass} bg-primary`} onClick={() => handleOperation('×')}>×</Button>

            {['4','5','6'].map(n => <Button key={n} variant="outline" className={buttonClass} onClick={() => handleNumber(n)}>{n}</Button>)}
            <Button className={`${buttonClass} bg-primary`} onClick={() => handleOperation('-')}>-</Button>

            {['1','2','3'].map(n => <Button key={n} variant="outline" className={buttonClass} onClick={() => handleNumber(n)}>{n}</Button>)}
            <Button className={`${buttonClass} bg-primary`} onClick={() => handleOperation('+')}>+</Button>

            <Button variant="outline" className={buttonClass} onClick={handleSqrt}>√</Button>
            <Button variant="outline" className={buttonClass} onClick={() => handleNumber('0')}>0</Button>
            <Button variant="outline" className={buttonClass} onClick={handleDecimal}>.</Button>
            <Button className={`${buttonClass} bg-success text-success-foreground`} onClick={calculate}>=</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CalculatorModal;
