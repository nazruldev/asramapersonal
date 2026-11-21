import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

type BottomSheetFrameProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  elevated?: boolean;
};

/** Tinggi panel fixed 85% — hanya bisa di-tarik ke bawah untuk tutup. */
const PANEL_HEIGHT = '85dvh';
const DRAG_CLOSE_PX = 80;

export function BottomSheetFrame({
  open,
  onClose,
  children,
  className,
  panelClassName,
  elevated = false,
}: BottomSheetFrameProps) {
  const [dragY, setDragY] = useState(0);
  const dragging = useRef(false);
  const movedRef = useRef(false);
  const startY = useRef(0);

  useEffect(() => {
    if (!open) return;
    setDragY(0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const onHandlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-sheet-handle]')) return;
    if (target.closest('button, a, input, select, textarea, [role="button"], [role="menuitem"]')) return;
    dragging.current = true;
    startY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHandlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const dy = e.clientY - startY.current;
    // Hanya tarik ke bawah (tutup), tidak naikkan sheet
    setDragY(Math.max(0, Math.min(dy, window.innerHeight * 0.55)));
  };

  const onHandlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const dy = e.clientY - startY.current;
    if (Math.abs(dy) > 6) movedRef.current = true;
    setDragY(0);
    if (dy > DRAG_CLOSE_PX) onClose();
  };

  const onHandlePointerCancel = () => {
    dragging.current = false;
    setDragY(0);
  };

  const onPanelClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (movedRef.current) {
      movedRef.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  if (!open) return null;

  const isAnimating = !dragging.current;

  return (
    <div
      className={cn(
        'fixed inset-0 flex items-end justify-center pt-0 pointer-events-none',
        'pb-[max(0.375rem,calc(var(--keyboard-inset,0px)+env(safe-area-inset-bottom)))]',
        elevated ? 'z-[110]' : 'z-[100]',
        className
      )}
      role="presentation"
    >
      <button
        type="button"
        aria-label="Tutup"
        className="absolute inset-0 bg-black/60 backdrop-blur-xs pointer-events-auto"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative w-full sm:max-w-xl md:max-w-2xl lg:max-w-4xl xl:max-w-5xl flex flex-col min-h-0 shadow-2xl pointer-events-auto',
          'bg-card text-card-foreground border-t border-border rounded-t-sm',
          'animate-in fade-in slide-in-from-bottom duration-200',
          elevated ? 'z-[111]' : 'z-[101]',
          panelClassName
        )}
        style={{
          height: PANEL_HEIGHT,
          maxHeight: `calc(100dvh - var(--keyboard-inset, 0px) - 0.5rem)`,
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: isAnimating ? 'transform 0.28s ease-out' : 'none',
        }}
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerCancel}
        onClickCapture={onPanelClickCapture}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          data-sheet-handle
          className="shrink-0 touch-none cursor-grab active:cursor-grabbing select-none py-3.5"
          aria-hidden
        >
          <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto" />
        </div>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
