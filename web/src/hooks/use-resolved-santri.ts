import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { fetchSantriById } from '@/lib/santri-api';

export type ResolvedSantriRow = {
  id: string;
  nama?: string;
  kelas?: string;
  kamar?: string;
  nomor_wali?: string;
  include_wa?: boolean;
  jumlah_pelanggaran?: number;
};

/** Profil santri: muat lengkap per-ID (untuk nomor wali/WA), fallback ke ringkasan store. */
export function useResolvedSantri(santriId: string | null | undefined) {
  const santriList = useAppStore((s) => s.santri) as ResolvedSantriRow[];
  const id = santriId ? String(santriId) : '';

  const fromStore = useMemo(
    () => (id ? santriList.find((s) => String(s.id) === id) : undefined),
    [santriList, id]
  );

  const [fetched, setFetched] = useState<ResolvedSantriRow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) {
      setFetched(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchSantriById(id)
      .then((row) => {
        if (!cancelled) setFetched(row as ResolvedSantriRow);
      })
      .catch(() => {
        if (!cancelled) setFetched(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const santri = fetched ?? fromStore;
  const displayName =
    santri?.nama?.trim() ||
    (loading ? 'Memuat profil…' : id ? `Santri` : '');

  return { santri, loading, displayName };
}
