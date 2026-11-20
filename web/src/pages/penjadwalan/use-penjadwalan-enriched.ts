import { useMemo } from 'react';
import { useAppStore } from '@/store/app-store';
import type { PenjadwalanEntry } from '@/lib/penjadwalan';

export type EnrichedPenjadwalanEntry = PenjadwalanEntry & {
  assignee_nama: string;
  assignee_detail?: string;
};

export function usePenjadwalanEnriched(): EnrichedPenjadwalanEntry[] {
  const rawList = useAppStore((s) => s.penjadwalan) as PenjadwalanEntry[];
  const santriList = useAppStore((s) => s.santri);
  const kamarList = useAppStore((s) => s.kamar);

  return useMemo((): EnrichedPenjadwalanEntry[] => {
    return rawList.map((row) => {
      const withAssignee = row as EnrichedPenjadwalanEntry;
      if (withAssignee.assignee_nama) return withAssignee;
      if (row.mode === 'kamar' && row.kamar_id) {
        const k = kamarList.find((x) => x.id === row.kamar_id);
        return {
          ...row,
          assignee_nama: k?.nama ? String(k.nama) : 'Kamar?',
          assignee_detail: k?.ketua ? `Ketua: ${String(k.ketua)}` : undefined,
        };
      }
      if (row.santri_id) {
        const s = santriList.find((x) => x.id === row.santri_id);
        return {
          ...row,
          assignee_nama: s?.nama ? String(s.nama) : 'Santri?',
          assignee_detail: s?.kamar ? String(s.kamar) : undefined,
        };
      }
      return { ...row, assignee_nama: '-' };
    });
  }, [rawList, santriList, kamarList]);
}
