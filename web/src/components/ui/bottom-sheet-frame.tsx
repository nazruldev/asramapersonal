import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

type Snap = 'half' | 'full';

type SheetMetrics = {
  half: number;
  full: number;
};

function measureSheetHeights(): SheetMetrics {
  const vv = window.visualViewport;
  const vh = vv?.height ?? window.innerHeight;
  const available = Math.max(240, vh - 8);
  return {
    half: Math.round(available * 0.52),
    full: Math.round(available * 0.94),
  };
}

const DRAG_CLOSE_PX = 80;
const DRAG_SNAP_PX = 56;

type BottomSheetFrameProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  elevated?: boolean;
};

export function BottomSheetFrame({
  open,
  onClose,
  children,
  className,
  panelClassName,
  elevated = false,
}: BottomSheetFrameProps) {
  const [snap, setSnap] = useState<Snap>('half');
  const [metrics, setMetrics] = useState<SheetMetrics>(() => measureSheetHeights());
  const [dragY, setDragY] = useState(0);
  const dragging = useRef(false);
  const startY = useRef(0);
  const snapRef = useRef<Snap>('half');

  const remeasure = useCallback(() => {
    setMetrics(measureSheetHeights());
  }, []);

  useEffect(() => {
    if (!open) return;
    setSnap('half');
    snapRef.current = 'half';
    setDragY(0);
    remeasure();
  }, [open, remeasure]);

  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    vv?.addEventListener('resize', remeasure);
    window.addEventListener('resize', remeasure);
    return () => {
      vv?.removeEventListener('resize', remeasure);
      window.removeEventListener('resize', remeasure);
    };
  }, [open, remeasure]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);

  const onHandlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    startY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHandlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const dy = e.clientY - startY.current;
    const maxDown = snapRef.current === 'full' ? metrics.full * 0.45 : metrics.half * 0.55;
    const clamped =
      dy > 0 ? Math.min(dy, maxDown) : snapRef.current === 'full' ? dy : Math.max(dy, -metrics.half * 0.35);
    setDragY(clamped);
  };

  const onHandlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const dy = e.clientY - startY.current;
    setDragY(0);

    if (dy > DRAG_CLOSE_PX) {
      if (snapRef.current === 'full') {
        setSnap('half');
      } else {
        onClose();
      }
      return;
    }
    if (dy < -DRAG_SNAP_PX) {
      setSnap('full');
      return;
    }
  };

  const onHandlePointerCancel = () => {
    dragging.current = false;
    setDragY(0);
  };

  if (!open) return null;

  const panelHeight = snap === 'full' ? metrics.full : metrics.half;
  const isAnimating = !dragging.current;

  return (
    <div
      className={cn(
        'fixed inset-0 flex items-end justify-center px-1.5 pt-0 pointer-events-none',
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
          'relative w-full max-w-[calc(100vw-0.75rem)] flex flex-col min-h-0 shadow-2xl pointer-events-auto',
          'bg-card text-card-foreground border border-border rounded-t-sm',
          'animate-in fade-in slide-in-from-bottom duration-200',
          elevated ? 'z-[111]' : 'z-[101]',
          panelClassName
        )}
        style={{
          height: panelHeight,
          maxHeight: `calc(100dvh - var(--keyboard-inset, 0px) - 0.5rem)`,
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: isAnimating ? 'height 0.28s ease-out, transform 0.28s ease-out' : 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="shrink-0 touch-none cursor-grab active:cursor-grabbing select-none py-2.5"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerCancel}
          aria-hidden
        >
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-600 mx-auto" />
        </div>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
