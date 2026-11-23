import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Banknote,
  CircleAlert,
  FileDown,
  Phone,
  Share2,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useAppStore } from '@/store/app-store';
import { AppLoadingIndicator } from '@/components/app-loading-indicator';
import { useResolvedSantri } from '@/hooks/use-resolved-santri';
import { toast } from '@/lib/toast';
import {
  downloadTunggakanWaliPdf,
  shareTunggakanWaliPdf,
} from '@/lib/laporan-print';
import {
  isTagihanTunggakan,
  sisaTagihan,
  type TagihanRow,
} from '@/lib/pembayaran-store';
import {
  labelPeriodeTagihan,
  parseSantriIdFromTunggakanPath,
} from '@/lib/santri-tunggakan';
import { Button } from '@/components/ui/button';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { SantriAvatar } from '@/components/santri-avatar';

type TagihanView = TagihanRow & {
  sisa?: number;
  santri_nama?: string;
  santri_kamar?: string;
  santri_kelas?: string;
};

type SantriDetailRow = {
  id: string;
  nama?: string;
  kelas?: string;
  kamar?: string;
  nomor_wali?: string;
  include_wa?: boolean;
  foto?: string;
};

const rupiah = (n: number) =>
  `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n || 0)}`;

function statusBadge(t: TagihanRow): { label: string; cls: string } {
  if (isTagihanTunggakan(t)) {
    return {
      label: 'Sudah jatuh tempo',
      cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800',
    };
  }
  if (t.status === 'sebagian') {
    return {
      label: 'Sebagian',
      cls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
    };
  }
  return {
    label: 'Belum bayar',
    cls: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
  };
}

export default function SantriTunggakan() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const santriId = parseSantriIdFromTunggakanPath(pathname);

  const settings = useAppStore((s) => s.settings);
  const santriList = useAppStore((s) => s.santri);

  const [detailLoading, setDetailLoading] = useState(true);
  const [tagihan, setTagihan] = useState<TagihanView[]>([]);
  const [pdfBusy, setPdfBusy] = useState<'unduh' | 'bagikan' | null>(null);

  const { santri: resolvedSantri, displayName: resolvedName } = useResolvedSantri(santriId);
  const santri =
    resolvedSantri ??
    ((santriList as SantriDetailRow[]).find((s) => String(s.id) === String(santriId)) ?? null);

  const loadTagihan = useCallback(async () => {
    if (!santriId) {
      setTagihan([]);
      return;
    }
    setDetailLoading(true);
    try {
      await fetch('/api/pembayaran/sync', { method: 'POST' }).catch(() => null);
      const res = await fetch(
        `/api/pembayaran/tagihan?santri_id=${encodeURIComponent(santriId)}`
      );
      if (!res.ok) throw new Error('Gagal memuat tagihan');
      const rows = (await res.json()) as TagihanView[];
      setTagihan(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setTagihan([]);
      toast.error(e instanceof Error ? e.message : 'Gagal memuat tagihan');
    } finally {
      setDetailLoading(false);
    }
  }, [santriId]);

  useEffect(() => {
    void loadTagihan();
  }, [loadTagihan]);

  /** Hanya tagihan belum dibayar/lunas; yang lewat tempo ditandai. */
  const daftarTagihan = useMemo(() => {
    return tagihan
      .filter((t) => sisaTagihan(t) > 0)
      .sort((a, b) => {
        const aLate = isTagihanTunggakan(a);
        const bLate = isTagihanTunggakan(b);
        if (aLate !== bLate) return aLate ? -1 : 1;
        return `${b.periode}|${b.nama_jenis}`.localeCompare(`${a.periode}|${a.nama_jenis}`);
      });
  }, [tagihan]);

  const totalSisa = useMemo(
    () => daftarTagihan.reduce((acc, t) => acc + sisaTagihan(t), 0),
    [daftarTagihan]
  );
  const jumlahLewatTempo = useMemo(
    () => daftarTagihan.filter((t) => isTagihanTunggakan(t)).length,
    [daftarTagihan]
  );

  const displayName = santri?.nama?.trim() || resolvedName || 'Santri';
  const displayKamar = santri?.kamar || '-';
  const displayKelas = santri?.kelas || '-';
  const nomorWali = santri?.nomor_wali?.trim() || '';

  const pdfOpts = useMemo(
    () => ({
      namaAsrama: settings.namaAsrama || 'Asrama',
      santri: {
        nama: displayName,
        kelas: displayKelas,
        kamar: displayKamar,
        nomorWali,
      },
      items: daftarTagihan.map((t) => ({
        nama_jenis: t.nama_jenis,
        periode: t.periode,
        nominal: t.nominal,
        terbayar: t.terbayar,
        sisa: sisaTagihan(t),
        status: t.status,
        jatuh_tempo: t.jatuh_tempo,
        lewat_tempo: isTagihanTunggakan(t),
      })),
    }),
    [daftarTagihan, displayKelas, displayKamar, displayName, nomorWali, settings.namaAsrama]
  );

  const handleCallWali = useCallback(() => {
    if (!nomorWali) {
      toast.error('Nomor wali belum diisi');
      return;
    }
    const clean = nomorWali.replace(/[^0-9]/g, '');
    window.location.href = `tel:${clean}`;
  }, [nomorWali]);

  const runPdf = useCallback(
    async (action: 'unduh' | 'bagikan') => {
      if (!daftarTagihan.length) {
        toast.error('Belum ada tagihan belum dibayar untuk dikirim');
        return;
      }
      setPdfBusy(action);
      try {
        if (action === 'unduh') await downloadTunggakanWaliPdf(pdfOpts);
        else await shareTunggakanWaliPdf(pdfOpts);
      } catch {
        toast.error(action === 'unduh' ? 'Gagal mengunduh PDF' : 'Gagal membagikan PDF');
      } finally {
        setPdfBusy(null);
      }
    },
    [daftarTagihan.length, pdfOpts]
  );

  if (!santriId) {
    return <EmptyState icon={CircleAlert} title="Santri tidak valid" variant="inline" />;
  }

  if (detailLoading) {
    return (
      <PageWithPullRefresh keys={['santri']} extraRefresh={loadTagihan}>
        <div className={cn(appCardClass, 'overflow-hidden')}>
          <AppLoadingIndicator message="Memuat tagihan…" />
        </div>
      </PageWithPullRefresh>
    );
  }

  return (
    <PageWithPullRefresh keys={['santri']} extraRefresh={loadTagihan} className="space-y-4">
      <div className={cn(appCardClass, 'p-4 space-y-3')}>
        <div className="flex items-start gap-3">
          <SantriAvatar
            nama={displayName}
            foto={(santri as SantriDetailRow | null)?.foto || null}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-50 leading-snug">
              {displayName}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Kelas {displayKelas}
              {displayKamar && displayKamar !== '-' ? ` · ${displayKamar}` : ''}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-2 text-xs">
          <div className="flex justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800">
            <dt className="text-slate-500">Nomor wali</dt>
            <dd className="font-semibold text-slate-800 dark:text-slate-100 text-right tabular-nums">
              {nomorWali || 'Belum diisi'}
            </dd>
          </div>
          <div className="flex justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800">
            <dt className="text-slate-500">Belum dibayar</dt>
            <dd className="font-semibold text-slate-800 dark:text-slate-100 text-right">
              {daftarTagihan.length} tagihan
            </dd>
          </div>
          <div className="flex justify-between gap-2 py-1.5">
            <dt className="text-slate-500">Total sisa</dt>
            <dd className="font-black text-rose-600 dark:text-rose-400 text-right">
              {rupiah(totalSisa)}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800">
            {daftarTagihan.length} belum dibayar
          </span>
          {jumlahLewatTempo > 0 ? (
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800">
              {jumlahLewatTempo} sudah jatuh tempo
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            disabled={!nomorWali}
            onClick={handleCallWali}
          >
            <Phone className="w-3.5 h-3.5" />
            Telepon wali
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            disabled={pdfBusy !== null || daftarTagihan.length === 0}
            onClick={() => void runPdf('unduh')}
          >
            <FileDown className="w-3.5 h-3.5" />
            {pdfBusy === 'unduh' ? 'Menyiapkan…' : 'Unduh PDF'}
          </Button>
          <Button
            type="button"
            size="sm"
            className="text-xs gap-1.5 col-span-2 bg-teal-600 hover:bg-teal-700 text-white"
            disabled={pdfBusy !== null || daftarTagihan.length === 0}
            onClick={() => void runPdf('bagikan')}
          >
            <Share2 className="w-3.5 h-3.5" />
            {pdfBusy === 'bagikan' ? 'Menyiapkan…' : 'Bagikan PDF ke ortu'}
          </Button>
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Hanya menampilkan tagihan yang belum dibayar. Yang sudah lewat jatuh tempo ditandai merah.
        </p>
      </div>

      {daftarTagihan.length === 0 ? (
        <EmptyState icon={Banknote} title="Tidak ada tagihan belum dibayar">
          <p className="text-[11px] text-slate-500 mb-2">
            Semua tagihan santri ini sudah lunas, atau belum ada tagihan.
          </p>
          <button
            type="button"
            onClick={() => navigate('/master/pembayaran')}
            className="text-[11px] font-semibold text-emerald-700"
          >
            Ke halaman pembayaran
          </button>
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {daftarTagihan.map((t) => {
            const sisa = sisaTagihan(t);
            const late = isTagihanTunggakan(t);
            const badge = statusBadge(t);
            return (
              <div
                key={t.id}
                className={cn(
                  appCardClass,
                  'p-3',
                  late && 'border-rose-300 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-950/20'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                      {t.nama_jenis}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {labelPeriodeTagihan(t.periode)}
                      {t.jatuh_tempo ? ` · JT ${t.jatuh_tempo}` : ''}
                    </p>
                    {late ? (
                      <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 mt-1">
                        Sudah jatuh tempo
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border',
                      badge.cls
                    )}
                  >
                    {badge.label}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    {rupiah(t.terbayar)} / {rupiah(t.nominal)}
                  </span>
                  <span className="font-black text-rose-600 dark:text-rose-400">
                    Sisa {rupiah(sisa)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageWithPullRefresh>
  );
}
