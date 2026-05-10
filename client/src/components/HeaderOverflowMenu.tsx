import { useEffect, useRef, useState } from 'react';

interface Props {
  onOpenRules: () => void;
  onLogout: () => void;
}

export function HeaderOverflowMenu({ onOpenRules, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="header-overflow" ref={ref}>
      <button
        className="btn-ghost btn-overflow"
        onClick={() => setOpen((v) => !v)}
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && (
        <div className="header-overflow-menu" role="menu">
          <button role="menuitem" onClick={() => { setOpen(false); onOpenRules(); }}>
            <span className="overflow-icon">?</span> Rules &amp; Powers
          </button>
          <button role="menuitem" onClick={() => { setOpen(false); onLogout(); }}>
            <span className="overflow-icon">⎋</span> Log Out
          </button>
        </div>
      )}
    </div>
  );
}
