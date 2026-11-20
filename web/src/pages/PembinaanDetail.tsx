import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { CircleAlert, Crown, MessageCircle, Phone, ShieldAlert, Trash2 } from 'lucide-react';
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
  type PembinaanRow,
} from '@/lib/pembinaan-group';
import {
  buildPelanggaranWaliWhatsAppMessage,
  formatWhatsAppPhone,
  openWhatsAppWithText,
} from '@/lib/pembinaan-wa';
import { Button } from '@/components/ui/button';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { AppLogo } from '@/components/app-logo';

type SantriDetailRow = {
  id: string;
  nama?: string;
  kelas?: string;
  kamar?: string;
  nomor_wali?: string;
  include_wa?: boolean;
  jumlah_pelanggaran?: number;
};

function countJenis(rows: PembinaanRow[]) {
  let pelanggaran = 0;
  let teguran = 0;
  for (const r of rows) {
    if (r.jenis === 'Pelanggaran') pelanggaran += 1;
    else if (r.jenis === 'Teguran') teguran += 1;
  }
  return { pelanggaran, teguran, total: rows.length };
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
      toast.success('Catatan pembinaan berhasil dihapus');
      void reload(['pembinaan', 'santri', 'dashboard']);
    },
    onError: () => toast.error('Gagal menghapus catatan'),
  });

  const { santri: resolvedSantri, displayName: resolvedName } = useResolvedSantri(santriId);
  const santri =
    resolvedSantri ??
    ((santriList as SantriDetailRow[]).find((s) => String(s.id) === String(santriId)) ?? null);

  const allRecords = useMemo(() => {
    if (!santriId) return [];
    const rows = Array.isArray(pembinaanList) ? (pembinaanList as PembinaanRow[]) : [];
    return rows
      .filter((p) => String(p.santri_id) === santriId)
      .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
  }, [pembinaanList, santriId]);

  const records = allRecords;

  const totalCounts = useMemo(() => countJenis(allRecords), [allRecords]);

  const pelanggaranRecords = useMemo(
    () => allRecords.filter((r) => r.jenis === 'Pelanggaran'),
    [allRecords]
  );

  const poinAkumulasi = Number(santri?.jumlah_pelanggaran) || 0;
  const tier = getPelanggaranTier(poinAkumulasi, settings);
  const displayName =
    santri?.nama?.trim() || records[0]?.santri_nama?.trim() || resolvedName || 'Santri';
  const displayKamar = santri?.kamar || records[0]?.santri_kamar || '-';
  const displayKelas = santri?.kelas || '-';
  const nomorWali = santri?.nomor_wali?.trim() || '';

  const ketuaKamar = useMemo(() => {
    if (!displayKamar || displayKamar === '-') return 'Belum ada kamar';
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

  const handleWhatsAppPelanggaran = useCallback(() => {
    if (!nomorWali) {
      toast.error('Nomor wali belum diisi');
      return;
    }
    if (santri?.include_wa === false) {
      toast.error('Santri ini tidak menggunakan WhatsApp untuk wali');
      return;
    }
    const text = buildPelanggaranWaliWhatsAppMessage({
      namaAsrama: settings.namaAsrama,
      santriNama: displayName,
      kelas: displayKelas,
      kamar: displayKamar,
      ketuaKamar,
      akumulasiHitungan: poinAkumulasi,
      tierLabel: tier?.level ? tier.label : null,
      totalPelanggaran: totalCounts.pelanggaran,
      totalTeguran: totalCounts.teguran,
      pelanggaranRecords,
    });
    if (!openWhatsAppWithText(nomorWali, text)) {
      toast.error('Nomor wali tidak valid');
    }
  }, [
    displayKamar,
    displayKelas,
    displayName,
    ketuaKamar,
    nomorWali,
    pelanggaranRecords,
    poinAkumulasi,
    santri?.include_wa,
    settings.namaAsrama,
    tier?.label,
    tier?.level,
    totalCounts.pelanggaran,
    totalCounts.teguran,
  ]);

  const waDisplay = formatWhatsAppPhone(nomorWali);

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
          <AppLogo size="md" />
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
            {totalCounts.pelanggaran} pelanggaran
          </span>
          <span
            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${getPembinaanBadgeStyle('Teguran')}`}
          >
            {totalCounts.teguran} teguran
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
            size="sm"
            className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={!waDisplay || santri?.include_wa === false}
            onClick={handleWhatsAppPelanggaran}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            WA laporan BK
          </Button>
        </div>
      </div>

      <div className="rounded-sm border border-rose-100 bg-rose-50/60 p-4 text-xs text-rose-900 space-y-1">
        <p className="font-bold text-[10px] uppercase tracking-wider text-rose-700">
          Ringkasan
        </p>
        <p>
          Total <span className="font-bold">{totalCounts.total}</span> catatan BK ·{' '}
          <span className="font-bold">{totalCounts.pelanggaran}</span> pelanggaran ·{' '}
          {totalCounts.teguran} teguran
        </p>
        <p className="text-rose-800/80">
          Hapus catatan dengan ikon tempat sampah; hitungan pelanggaran menyesuaikan otomatis.
        </p>
      </div>

      {records.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="Belum ada catatan BK">
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
                    {item.jenis}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {new Date(item.tanggal).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    confirmDialog.ask({
                      title: 'Hapus catatan?',
                      message: `Yakin menghapus catatan ${item.jenis} ini?`,
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
