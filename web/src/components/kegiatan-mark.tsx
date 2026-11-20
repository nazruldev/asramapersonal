import { cn } from '@/lib/utils';
import { appRadius } from '@/lib/ui-tokens';
import { kegiatanInitial, kegiatanMarkIsEmoji } from '@/lib/kegiatan-schedule';

type Props = {
  nama: string;
  icon?: string | null;
  className?: string;
};

/** Logo kegiatan: singkatan, inisial nama, atau emoji. */
export function KegiatanMark({ nama, icon, className }: Props) {
  const isEmoji = kegiatanMarkIsEmoji(icon);
  return (
    <span
      className={cn(
        'w-9 h-9 flex items-center justify-center shrink-0 font-bold',
        isEmoji
          ? 'text-lg bg-emerald-50 border border-emerald-200/80'
          : 'text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200/80',
        appRadius,
        className
      )}
      aria-hidden
    >
      {kegiatanInitial(nama, icon)}
    </span>
  );
}
