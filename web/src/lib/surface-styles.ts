import { cn } from '@/lib/utils';
import { appRadius } from '@/lib/ui-tokens';

/** Kartu / panel konten standar — border ditegaskan light & dark. */
export const appCardClass = cn(
  appRadius,
  'bg-card text-card-foreground',
  'border border-slate-300 dark:border-slate-500',
  'shadow-xs dark:shadow-none'
);

/** Judul kecil di dalam kartu / section. */
export const appSectionTitleClass = 'text-xs font-bold text-slate-900 dark:text-slate-50';

/** Teks sekunder — mengikuti token muted (lebih terang di mode gelap). */
export const appMutedTextClass = 'text-muted-foreground dark:text-slate-300';

/** Angka / metrik besar. */
export const appMetricValueClass = 'text-2xl font-black text-slate-900 dark:text-slate-50 tabular-nums';

/** Tab aktif (segmented control). */
export const appTabActiveClass = cn(
  'bg-card text-card-foreground shadow-xs border border-slate-300 dark:border-slate-500'
);

/** Tab tidak aktif. */
export const appTabIdleClass = 'text-slate-600 dark:text-slate-300';

/** Chip / pill filter tidak aktif. */
export const appChipInactiveClass = cn(
  'bg-card text-card-foreground border border-slate-300 dark:border-slate-500',
  'hover:bg-slate-50 dark:hover:bg-slate-700/80'
);

/** Kartu daftar yang bisa diklik (izin, pembinaan, dll). */
export const appListCardButtonClass = cn(
  appCardClass,
  'w-full text-left p-4 space-y-2.5 active:scale-[0.99] transition-transform hover:border-emerald-300/80 dark:hover:border-emerald-500/70'
);

/** Bar pencarian / filter ringan di atas daftar. */
export const appSearchBarClass = cn(
  appRadius,
  'border border-slate-300 dark:border-slate-500 bg-card text-card-foreground',
  'placeholder:text-muted-foreground'
);
