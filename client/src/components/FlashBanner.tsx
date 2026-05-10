import { useEffect } from 'react';
import { useUiStore } from '@/stores/uiStore';

export function FlashBanner() {
  const flashMessage = useUiStore((s) => s.flashMessage);
  const clearFlash = useUiStore((s) => s.clearFlash);

  useEffect(() => {
    if (!flashMessage) return;
    const t = window.setTimeout(clearFlash, 4500);
    return () => window.clearTimeout(t);
  }, [flashMessage, clearFlash]);

  if (!flashMessage) return null;
  return (
    <div className="flash-banner" role="status" aria-live="polite">
      <span className="flash-banner-icon" aria-hidden="true">ℹ</span>
      <span className="flash-banner-text">{flashMessage}</span>
      <button className="flash-banner-close" onClick={clearFlash} aria-label="Dismiss">×</button>
    </div>
  );
}
