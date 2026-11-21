import { BedDouble } from 'lucide-react';
import { cn } from '@/lib/utils';
import { kamarSlotStates } from '@/lib/kamar-slots';
import { SantriAvatar } from '@/components/santri-avatar';

export type KamarSlotOccupant = {
  id: string;
  nama: string;
  foto?: string | null;
};

type KamarSlotStripProps = {
  terisi: number;
  kapasitas: number;
  /** Penghuni untuk slot terisi — avatar sama gaya daftar Santri. */
  occupants?: KamarSlotOccupant[];
  size?: 'sm' | 'md';
  className?: string;
};

export function KamarSlotStrip({
  terisi,
  kapasitas,
  occupants,
  size = 'sm',
  className,
}: KamarSlotStripProps) {
  const slots = kamarSlotStates(terisi, kapasitas);
  const avatarSize = size === 'md' ? 'sm' : 'xs';
  const emptyBox =
    size === 'md'
      ? 'w-9 h-9 rounded-sm'
      : 'w-6 h-6 rounded-[3px]';

  return (
    <div className={cn('flex flex-wrap gap-1', className)} aria-hidden>
      {slots.map((state, idx) => {
        if (state === 'filled') {
          const occupant = occupants?.[idx];
          if (occupant) {
            return (
              <SantriAvatar
                key={occupant.id || idx}
                nama={occupant.nama}
                foto={occupant.foto}
                size={avatarSize}
                className="border border-emerald-700/30 dark:border-emerald-500/40"
              />
            );
          }
          return (
            <div
              key={idx}
              className={cn(
                emptyBox,
                'flex items-center justify-center border',
                'bg-emerald-600 border-emerald-700 text-white dark:bg-emerald-600 dark:border-emerald-500'
              )}
              title="Slot jiwa terisi"
            >
              <BedDouble className={size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'} strokeWidth={2.25} />
            </div>
          );
        }
        return (
          <div
            key={idx}
            className={cn(
              emptyBox,
              'flex items-center justify-center border',
              'bg-slate-100 border-dashed border-slate-300 text-slate-400 dark:bg-slate-700/50 dark:border-slate-500'
            )}
            title="Slot jiwa kosong"
          >
            <BedDouble className={size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'} strokeWidth={2.25} />
          </div>
        );
      })}
    </div>
  );
}
