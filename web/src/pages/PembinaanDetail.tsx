import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import {
  CircleAlert,
  Crown,
  FileDown,
  Phone,
  Share2,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useAppStore } from '@/store/app-store';
import { AppLoadingIndicator } from '@/components/app-loading-indicator';
import { useResolvedSantri } from '@/hooks/use-resolved-santri';
import { useAppReload } from '@/hooks/use-app-reload';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import { toast } from '@/lib/toast';
import { getPelanggaranTier } from '@/lib/app-settings';
import {
  getPembinaanBadgeStyle,
  parsePembinaanSantriIdFromPath,
  pembinaanJenisLabel,
  type PembinaanRow,
} from '@/lib/pembinaan-group';
import { downloadBkWaliPdf, shareBkWaliPdf } from '@/lib/laporan-print';
import { formatSantriDate } from '@/lib/santri-detail';
import { Button } from '@/components/ui/button';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { SantriAvatar } from '@/components/santri-avatar';

type SantriDetailRow = {
  id: string;
  nama?: string;
  kelas?: string;
  kamar?: string;
  nomor_wali?: string;
  include_wa?: boolean;
  jumlah_pelanggaran?: number;
  foto?: string;
};

function countPelanggaran(rows: PembinaanRow[]) {
  return { pelanggaran: rows.length, total: rows.length };
}

export default function PembinaanDetail() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const santriId = parsePembinaanSantriIdFromPath(pathname);

  const reload = useAppReload();
  const confirmDialog = useConfirmDialog();
  const [detailLoading, setDetailLoading] = useState(true);
  const settings = useAppStore((s) => s.settings);
  const pembinaanList = useAppStore((s) => s.pembinaan);
  const santriList = useAppStore((s) => s.santri);
  const kamarList = useAppStore((s) => s.kamar);

  useEffect(() => {
    if (!santriId) {
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    let cancelled = false;
    void reload(['pembinaan', 'santri', 'kamar']).finally(() => {
      if (!cancelled) setDetailLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [santriId, reload]);

  const deletePembinaanMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/pembinaan/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
    },
    onSuccess: () => {
      toast.success('Catatan pelanggaran berhasil dihapus');
      void reload(['pembinaan', 'santri', 'dashboard']);
    },
    onError: () => toast.error('Gagal menghapus catatan'),
  });

  const [pdfBusy, setPdfBusy] = useState<'unduh' | 'bagikan' | null>(null);

  const { santri: resolvedSantri, displayName: resolvedName } = useResolvedSantri(santriId);
  const santri =
    resolvedSantri ??
    ((santriList as SantriDetailRow[]).find((s) => String(s.id) === String(santriId)) ?? null);

  const allRecords = useMemo(() => {
    if (!santriId) return [];
    const rows = Array.isArray(pembinaanList) ? (pembinaanList as PembinaanRow[]) : [];
    const sortKey = (iso: string) => {
      const raw = String(iso ?? '').trim();
      const datePart = raw.slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        const [y, m, d] = datePart.split('-').map(Number);
        return new Date(y, m - 1, d).getTime();
      }
      const t = new Date(raw).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    return rows
      .filter((p) => String(p.santri_id) === santriId)
      .sort((a, b) => sortKey(b.tanggal) - sortKey(a.tanggal));
  }, [pembinaanList, santriId]);

  const records = allRecords;

  const totalCounts = useMemo(() => countPelanggaran(allRecords), [allRecords]);

  const poinAkumulasi = Number(santri?.jumlah_pelanggaran) || 0;
  const tier = getPelanggaranTier(poinAkumulasi, settings);
  const displayName =
    santri?.nama?.trim() || records[0]?.santri_nama?.trim() || resolvedName || 'Santri';
  const displayKamar = santri?.kamar || records[0]?.santri_kamar || '-';
  const displayKelas = santri?.kelas || '-';
  const nomorWali = santri?.nomor_wali?.trim() || '';

  const ketuaKamar = useMemo(() => {
    if (!displayKamar || displayKamar === '-') return 'Tanpa kamar';
    const kamar = (kamarList as { nama?: string; ketua?: string }[]).find(
      (k) => k.nama === displayKamar
    );
    return kamar?.ketua?.trim() || 'Belum ditetapkan';
  }, [kamarList, displayKamar]);

  const handleCallWali = useCallback(() => {
    if (!nomorWali) {
      toast.error('Nomor wali belum diisi');
      return;
    }
    const clean = nomorWali.replace(/[^0-9]/g, '');
    window.location.href = `tel:${clean}`;
  }, [nomorWali]);

  const bkPdfOpts = useMemo(
    () => ({
      namaAsrama: settings.namaAsrama || 'Asrama',
      santri: {
        nama: displayName,
        kelas: displayKelas,
        kamar: displayKamar,
        nomorWali,
        poinAkumulasi,
        tierLabel: tier?.level ? tier.label : null,
      },
      records: allRecords.map((r) => ({
        tanggal: r.tanggal,
        jenis: r.jenis,
        keterangan: r.keterangan,
        tindak_lanjut: r.tindak_lanjut,
      })),
    }),
    [
      allRecords,
      displayKelas,
      displayKamar,
      displayName,
      nomorWali,
      poinAkumulasi,
      settings.namaAsrama,
      tier?.label,
      tier?.level,
    ]
  );

  const runBkPdf = useCallback(
    async (action: 'unduh' | 'bagikan') => {
      if (!allRecords.length) {
        toast.error('Belum ada catatan pelanggaran untuk dikirim');
        return;
      }
      setPdfBusy(action);
      try {
        if (action === 'unduh') await downloadBkWaliPdf(bkPdfOpts);
        else await shareBkWaliPdf(bkPdfOpts);
      } catch {
        toast.error(action === 'unduh' ? 'Gagal mengunduh PDF' : 'Gagal membagikan PDF');
      } finally {
        setPdfBusy(null);
      }
    },
    [allRecords.length, bkPdfOpts]
  );

  if (!santriId) {
    return <EmptyState icon={CircleAlert} title="Santri tidak valid" variant="inline" />;
  }

  if (detailLoading) {
    return (
      <PageWithPullRefresh keys={['pembinaan', 'santri', 'kamar', 'settings']}>
        <div className={cn(appCardClass, 'overflow-hidden')}>
          <AppLoadingIndicator message="Memuat detail catatan…" />
        </div>
      </PageWithPullRefresh>
    );
  }

  return (
    <PageWithPullRefresh keys={['pembinaan', 'santri', 'kamar', 'settings']} className="space-y-4">
      <div className={cn(appCardClass, 'p-4 space-y-3')}>
        <div className="flex items-start gap-3">
          <SantriAvatar
            nama={displayName}
            foto={(santri as SantriDetailRow | null)?.foto || null}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-900 leading-snug">{displayName}</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Kelas {displayKelas}</p>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-2 text-xs">
          <div className="flex justify-between gap-2 py-1.5 border-b border-slate-100">
            <dt className="text-slate-500">Kamar</dt>
            <dd className="font-semibold text-slate-800 text-right">{displayKamar}</dd>
          </div>
          <div className="flex justify-between gap-2 py-1.5 border-b border-slate-100">
            <dt className="text-slate-500 flex items-center gap-1">
              <Crown className="w-3 h-3 text-amber-600" />
              Ketua kamar
            </dt>
            <dd className="font-semibold text-slate-800 text-right">{ketuaKamar}</dd>
          </div>
          <div className="flex justify-between gap-2 py-1.5">
            <dt className="text-slate-500">Nomor wali</dt>
            <dd className="font-semibold text-slate-800 text-right tabular-nums">
              {nomorWali || 'Belum diisi'}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-1.5 pt-1">
          <span
            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${getPembinaanBadgeStyle('Pelanggaran')}`}
          >
            {totalCounts.total} pelanggaran
          </span>
          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-200">
            Akumulasi {poinAkumulasi}x{tier?.level ? ` · ${tier.label}` : ''}
          </span>
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
            disabled={pdfBusy !== null || allRecords.length === 0}
            onClick={() => void runBkPdf('unduh')}
          >
            <FileDown className="w-3.5 h-3.5" />
            {pdfBusy === 'unduh' ? 'Menyiapkan…' : 'Unduh PDF'}
          </Button>
          <Button
            type="button"
            size="sm"
            className="text-xs gap-1.5 col-span-2 bg-teal-600 hover:bg-teal-700 text-white"
            disabled={pdfBusy !== null || allRecords.length === 0}
            onClick={() => void runBkPdf('bagikan')}
          >
            <Share2 className="w-3.5 h-3.5" />
            {pdfBusy === 'bagikan' ? 'Menyiapkan…' : 'Bagikan PDF ke ortu'}
          </Button>
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          PDF berisi seluruh catatan pelanggaran santri ini.
        </p>
      </div>

      <div className="rounded-sm border border-rose-100 bg-rose-50/60 p-4 text-xs text-rose-900 space-y-1">
        <p className="font-bold text-[10px] uppercase tracking-wider text-rose-700">
          Ringkasan
        </p>
        <p>
          Total <span className="font-bold">{totalCounts.total}</span> catatan pelanggaran
        </p>
        <p className="text-rose-800/80">
          Hapus catatan dengan ikon tempat sampah; hitungan pelanggaran menyesuaikan otomatis.
        </p>
      </div>

      {records.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="Belum ada catatan pelanggaran">
          <button
            type="button"
            onClick={() => navigate('/laporan/pembinaan')}
            className="text-[11px] font-semibold text-emerald-700"
          >
            Kembali ke daftar
          </button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {records.map((item) => (
            <div
              key={item.id}
              className={cn(appCardClass, 'p-4 space-y-2')}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getPembinaanBadgeStyle(item.jenis)}`}
                  >
                    {pembinaanJenisLabel(item.jenis)}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {formatSantriDate(item.tanggal)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    confirmDialog.ask({
                      title: 'Hapus catatan?',
                      message: 'Yakin menghapus catatan pelanggaran ini?',
                      confirmLabel: 'Ya, Hapus',
                      destructive: true,
                      onConfirm: () => deletePembinaanMutation.mutateAsync(item.id),
                    })
                  }
                  className="p-1.5 text-slate-300 hover:text-rose-600 rounded-sm transition-colors shrink-0"
                  title="Hapus catatan"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">{item.keterangan}</p>
              {item.tindak_lanjut && (
                <p className="text-[11px] text-amber-900 bg-amber-50/80 border border-amber-200/60 rounded-sm p-2.5 leading-relaxed">
                  <span className="font-bold">Tindak lanjut: </span>
                  {item.tindak_lanjut}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        onClose={confirmDialog.close}
        onConfirm={confirmDialog.confirm}
        loading={confirmDialog.loading}
        title={confirmDialog.request?.title}
        message={confirmDialog.request?.message ?? ''}
        confirmLabel={confirmDialog.request?.confirmLabel}
        cancelLabel={confirmDialog.request?.cancelLabel}
        destructive={confirmDialog.request?.destructive}
      />
    </PageWithPullRefresh>
  );
}
