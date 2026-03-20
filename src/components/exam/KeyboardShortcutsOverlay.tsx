import React from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  { key: 'A–E', desc: 'Select answer' },
  { key: 'F', desc: 'Toggle flag' },
  { key: 'N', desc: 'Open notes' },
  { key: '← →', desc: 'Prev / Next' },
  { key: 'P', desc: 'Pause / Resume' },
  { key: 'L', desc: 'Lab Values' },
  { key: 'C', desc: 'Calculator' },
  { key: 'Esc', desc: 'Close overlay' },
];

const KeyboardShortcutsOverlay: React.FC<Props> = ({ open, onClose }) => {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card border rounded-lg shadow-lg p-5 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-3">⌨️ Keyboard Shortcuts</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {shortcuts.map((s) => (
            <div key={s.key} className="flex items-center gap-2 text-xs">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px] font-mono font-semibold min-w-[2rem] text-center">
                {s.key}
              </kbd>
              <span className="text-muted-foreground">{s.desc}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 text-center">Click anywhere or press Esc to close</p>
      </div>
    </div>
  );
};

export default KeyboardShortcutsOverlay;
