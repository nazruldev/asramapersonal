import { BedDouble } from 'lucide-react';
import { cn } from '@/lib/utils';
import { kamarSlotStates } from '@/lib/kamar-slots';

type KamarSlotStripProps = {
  terisi: number;
  kapasitas: number;
  size?: 'sm' | 'md';
  className?: string;
};

export function KamarSlotStrip({
  terisi,
  kapasitas,
  size = 'sm',
  className,
}: KamarSlotStripProps) {
  const slots = kamarSlotStates(terisi, kapasitas);
  const box =
    size === 'md'
      ? 'w-7 h-7 rounded-sm'
      : 'w-6 h-6 rounded-[3px]';

  return (
    <div className={cn('flex flex-wrap gap-1', className)} aria-hidden>
      {slots.map((state, idx) => (
        <div
          key={idx}
          className={cn(
            box,
            'flex items-center justify-center border',
            state === 'filled'
              ? 'bg-emerald-600 border-emerald-700 text-white dark:bg-emerald-600 dark:border-emerald-500'
              : 'bg-slate-100 border-dashed border-slate-300 text-slate-400 dark:bg-slate-700/50 dark:border-slate-500'
          )}
          title={state === 'filled' ? 'Slot jiwa terisi' : 'Slot jiwa kosong'}
        >
          <BedDouble className={size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'} strokeWidth={2.25} />
        </div>
      ))}
    </div>
  );
}
