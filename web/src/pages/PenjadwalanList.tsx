import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import {
  CalendarRange,
  ChevronRight,
  FileDown,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { useReloadKeyLoading, useReloadKeyReady } from '@/hooks/use-reload-key';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useAppReload } from '@/hooks/use-app-reload';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import {
  dateRangeForMonths,
  jenisLabel,
  penjadwalanJenisPath,
  penjadwalanVitalitas,
  type PenjadwalanEntry,
  type PenjadwalanPreset,
  type PenjadwalanVitalitas,
} from '@/lib/penjadwalan';
import {
  usePenjadwalanEnriched,
  type EnrichedPenjadwalanEntry,
} from '@/pages/penjadwalan/use-penjadwalan-enriched';
import { toast } from '@/lib/toast';
import {
  downloadPenjadwalanPdf,
  printPenjadwalanPdf,
  shouldOfferBrowserPrintFallback,
  type PenjadwalanPrintOrientation,
} from '@/lib/penjadwalan-print';
import { EmptyState } from '@/components/ui/empty-state';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';

function PenjadwalanStatusBadge({ status }: { status: PenjadwalanVitalitas }) {
  if (status === 'kosong') {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-600">
        Belum ada data
      </span>
    );
  }
  if (status === 'kadaluarsa') {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-900">
        Kadaluarsa
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm bg-emerald-100 text-emerald-800">
      Aktif
    </span>
  );
}

function formatUpdated(iso: string): string {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function PenjadwalanList() {
  const navigate = useNavigate();
  const reload = useAppReload();
  const confirmDialog = useConfirmDialog();
  const jadwalReady = useReloadKeyReady('penjadwalan');
  const jadwalLoading = useReloadKeyLoading('penjadwalan');
  const presets = useAppStore((s) => s.penjadwalanPreset) as PenjadwalanPreset[];
  const penjadwalanRows = useAppStore((s) => s.penjadwalan) as PenjadwalanEntry[];
  const settings = useAppStore((s) => s.settings);
  const enriched = usePenjadwalanEnriched();

  const cetakJadwal = async (
    jenis: string,
    rows: EnrichedPenjadwalanEntry[],
    dataDari?: string,
    dataSampai?: string
  ) => {
    const sorted = rows
      .filter((e) => e.jenis === jenis)
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
    if (!sorted.length) {
      toast.error('Belum ada jadwal untuk dicetak.');
      return;
    }
    const dari = dataDari ?? sorted[0].tanggal;
    const sampai = dataSampai ?? sorted[sorted.length - 1].tanggal;
    const orientation: PenjadwalanPrintOrientation = 'portrait';
    const options = {
      namaAsrama: settings.namaAsrama,
      jenis,
      bulan: dari.slice(0, 7),
      orientation,
      periodeTeks: `${dari} — ${sampai}`,
      rows: sorted.map((r) => ({
        tanggal: r.tanggal,
        assignee_nama: r.assignee_nama,
        assignee_detail: r.assignee_detail,
        mode: r.mode,
      })),
    };
    const saved = await downloadPenjadwalanPdf(options);
    if (!saved && shouldOfferBrowserPrintFallback()) {
      printPenjadwalanPdf(options);
      toast.message('Dialog cetak dibuka — pilih Simpan sebagai PDF.');
    }
  };

  const cards = useMemo(() => {
    const sorted = [...presets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return sorted.map((preset) => {
      const rows = enriched.filter((e) => e.jenis === preset.jenis);
      const dates = rows.map((r) => r.tanggal).sort();
      const range = dateRangeForMonths(preset.mulai, preset.bulanKeDepan);
      const jenisKey = String(preset.jenis);
      return {
        preset,
        count: rows.length,
        dataDari: dates[0],
        dataSampai: dates[dates.length - 1],
        range,
        status: penjadwalanVitalitas(penjadwalanRows, jenisKey),
      };
    });
  }, [presets, enriched, penjadwalanRows]);

  const purgeMutation = useMutation({
    mutationFn: async (jenis: string) => {
      const res = await fetch('/api/penjadwalan/purge-jenis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jenis }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data?.error ?? 'Gagal menghapus jadwal');
      return data;
    },
    onSuccess: (_data, jenis) => {
      void reload(['penjadwalan', 'penjadwalanPreset']);
      toast.success(`Jadwal ${jenisLabel(jenis)} dihapus`);
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal menghapus jadwal'),
  });

  const requestHapusJenis = (preset: PenjadwalanPreset) => {
    const label = jenisLabel(preset.jenis);
    confirmDialog.ask({
      title: `Hapus jadwal ${label}?`,
      message: `Semua entri ${label} akan dihapus. Anda bisa generate lagi dari menu penjadwalan.`,
      confirmLabel: 'Hapus',
      destructive: true,
      onConfirm: () => purgeMutation.mutate(String(preset.jenis)),
    });
  };

  if (jadwalLoading && !jadwalReady) {
    return <ListSkeleton rows={6} className="py-2" />;
  }

  return (
    <PageWithPullRefresh
      keys={['penjadwalan', 'penjadwalanPreset', 'santri', 'kamar']}
      className="space-y-4"
    >
      <div className="bg-emerald-700 text-white rounded-sm p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 shrink-0 mt-0.5 opacity-90" />
          <div>
            <p className="text-sm font-bold">Penjadwalan</p>
            <p className="text-[11px] text-emerald-100/90 leading-relaxed mt-1">
              Setiap generate mengisi ulang periode yang Anda pilih. Cetak PDF dari kartu di bawah.
            </p>
          </div>
        </div>
        <Button
          type="button"
          className="w-full bg-card text-emerald-800 dark:text-emerald-300 border border-border hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
          onClick={() => navigate('/penjadwalan/generate')}
        >
          <Plus className="w-4 h-4 mr-2" />
          Generate jadwal
        </Button>
      </div>

      {cards.length === 0 ? (
        <EmptyState icon={CalendarRange} title="Belum ada jadwal tersimpan">
          <button
            type="button"
            className="text-emerald-700 font-semibold text-xs"
            onClick={() => navigate('/penjadwalan/generate')}
          >
            Mulai generate jadwal
          </button>
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {cards.map(({ preset, count, dataDari, dataSampai, range, status }) => (
            <div key={preset.id} className={cn(appCardClass, 'p-4 space-y-3')}>
              <button
                type="button"
                className="w-full text-left flex items-start justify-between gap-2"
                onClick={() => navigate(penjadwalanJenisPath(String(preset.jenis)))}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-900">{jenisLabel(preset.jenis)}</p>
                    <PenjadwalanStatusBadge status={status} />
                  </div>
                  {status === 'kadaluarsa' && dataSampai && (
                    <p className="text-[10px] text-amber-700 mt-1">
                      Terakhir {dataSampai}. Generate lagi untuk periode baru.
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Rotasi {preset.mode === 'santri' ? 'per santri' : 'per kamar'} · {preset.bulanKeDepan}{' '}
                    bulan
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {count > 0 && dataDari && dataSampai
                      ? `Data: ${dataDari} — ${dataSampai} (${count} hari)`
                      : `Periode target: ${range.dari} — ${range.sampai}`}
                  </p>
                  <p className="text-[10px] text-slate-400">Terakhir diubah: {formatUpdated(preset.updatedAt)}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-1" />
              </button>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs min-w-0"
                  onClick={() => navigate(penjadwalanJenisPath(String(preset.jenis)))}
                >
                  <CalendarRange className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  Lihat jadwal
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs min-w-0 border-emerald-200 text-emerald-800"
                  disabled={count === 0}
                  onClick={() =>
                    void cetakJadwal(
                      String(preset.jenis),
                      enriched,
                      dataDari,
                      dataSampai
                    )
                  }
                >
                  <FileDown className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  Cetak PDF
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="text-xs bg-emerald-700 hover:bg-emerald-800"
                  onClick={() =>
                    navigate(`/penjadwalan/generate?jenis=${encodeURIComponent(String(preset.jenis))}`)
                  }
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Generate lagi
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                  disabled={purgeMutation.isPending}
                  onClick={() => requestHapusJenis(preset)}
                >
                  {purgeMutation.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Hapus jadwal
                </Button>
              </div>
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
