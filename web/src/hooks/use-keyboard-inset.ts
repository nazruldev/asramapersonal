import { useEffect } from 'react';

function updateKeyboardInset() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  if (!vv) {
    root.style.setProperty('--keyboard-inset', '0px');
    return;
  }
  const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  root.style.setProperty('--keyboard-inset', `${Math.round(inset)}px`);
}

/** Global: CSS var `--keyboard-inset` + scroll fokus input agar tidak tertutup keyboard */
export function useKeyboardInset() {
  useEffect(() => {
    updateKeyboardInset();

    const vv = window.visualViewport;
    vv?.addEventListener('resize', updateKeyboardInset);
    vv?.addEventListener('scroll', updateKeyboardInset);
    window.addEventListener('resize', updateKeyboardInset);

    const onFocusIn = (ev: FocusEvent) => {
      const el = ev.target;
      if (!(el instanceof HTMLElement)) return;
      if (!el.matches('input, textarea, select, [contenteditable="true"]')) return;
      window.setTimeout(() => {
        try {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch {
          el.scrollIntoView({ block: 'center' });
        }
      }, 320);
    };
    document.addEventListener('focusin', onFocusIn);

    return () => {
      vv?.removeEventListener('resize', updateKeyboardInset);
      vv?.removeEventListener('scroll', updateKeyboardInset);
      window.removeEventListener('resize', updateKeyboardInset);
      document.removeEventListener('focusin', onFocusIn);
      document.documentElement.style.setProperty('--keyboard-inset', '0px');
    };
  }, []);
}
