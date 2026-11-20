import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BottomSheetFrame } from '@/components/ui/bottom-sheet-frame';

type AppModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Bottom sheet on mobile by default */
  sheet?: boolean;
  /** Tampil di atas modal lain (konfirmasi) */
  elevated?: boolean;
};

function useMobileSheetEnabled(sheet: boolean) {
  const [mobile, setMobile] = useState(() => {
    if (!sheet || typeof window === 'undefined') return false;
    return !window.matchMedia('(min-width: 640px)').matches;
  });

  useEffect(() => {
    if (!sheet) {
      setMobile(false);
      return;
    }
    const mq = window.matchMedia('(min-width: 640px)');
    const update = () => setMobile(!mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [sheet]);

  return sheet && mobile;
}

export function AppModal({
  open,
  onClose,
  title,
  description,
  children,
  className,
  sheet = true,
  elevated = false,
}: AppModalProps) {
  const mobileSheet = useMobileSheetEnabled(sheet);

  if (!open || typeof document === 'undefined') return null;

  if (mobileSheet) {
    return createPortal(
      <BottomSheetFrame open={open} onClose={onClose} elevated={elevated} panelClassName={className}>
        {(title || description) && (
          <div data-sheet-handle className="flex items-start justify-between gap-3 px-4 sm:px-5 pb-3 border-b border-slate-200 dark:border-slate-700 shrink-0 touch-none select-none">
            <div className="min-w-0">
              {title && <h3 className="text-base font-semibold leading-tight">{title}</h3>}
              {description && (
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-sm hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 flex-1 min-h-0 flex flex-col">{children}</div>
      </BottomSheetFrame>,
      document.body
    );
  }

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 flex items-end sm:items-center justify-center px-0 pb-[max(0.375rem,var(--keyboard-inset,0px))] pt-0 sm:p-4',
        elevated ? 'z-[110]' : 'z-[100]'
      )}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Tutup"
        className="absolute inset-0 bg-black/60 backdrop-blur-xs"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative w-full max-w-full sm:max-w-md max-h-[min(92vh,calc(100dvh-var(--keyboard-inset,0px)-1rem))] flex flex-col shadow-2xl animate-in fade-in duration-200',
          elevated ? 'z-[111]' : 'z-[101]',
          'bg-card text-card-foreground border-t border-border sm:border',
          sheet
            ? 'rounded-sm sm:rounded-sm slide-in-from-bottom sm:zoom-in-95'
            : 'rounded-sm zoom-in-95 sm:max-w-sm',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {sheet && (
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-600 mx-auto mt-3 shrink-0 sm:hidden" />
        )}
        {(title || description) && (
          <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <div className="min-w-0">
              {title && <h3 className="text-base font-semibold leading-tight">{title}</h3>}
              {description && (
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-sm hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 flex-1 min-h-0">{children}</div>
      </div>
    </div>,
    document.body
  );
}
