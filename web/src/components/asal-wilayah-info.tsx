import type { ReactNode } from 'react';
import type { SantriAsalWilayahFields } from '@/lib/wilayah-types';
import { asalWilayahDetailLevels } from '@/lib/wilayah-types';
import { appMutedTextClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';

type RowProps = { label: string; value: string };

type Props = {
  row: SantriAsalWilayahFields | null | undefined;
  /** Gaya baris label–nilai (mis. InfoRow di halaman detail). */
  Row?: (props: RowProps) => ReactNode;
  className?: string;
};

function DefaultRow({ label, value }: RowProps) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className={appMutedTextClass}>{label}</span>
      <span className="font-medium text-slate-800 dark:text-slate-100 text-right">{value}</span>
    </div>
  );
}

/** Tampilan asal wilayah per tingkat (desa opsional). */
export function AsalWilayahInfo({ row, Row = DefaultRow, className }: Props) {
  const levels = asalWilayahDetailLevels(row);
  if (levels.length === 0) {
    return (
      <p className={cn('text-xs text-slate-500 dark:text-slate-400', className)}>Belum diisi</p>
    );
  }
  return (
    <div className={cn('space-y-2', className)}>
      {levels.map((level) => (
        <Row key={level.key} label={level.label} value={level.value} />
      ))}
    </div>
  );
}
