import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { CalendarRange, RefreshCw, User, BedDouble } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { useReloadKeyLoading, useReloadKeyReady } from '@/hooks/use-reload-key';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useAppReload } from '@/hooks/use-app-reload';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { EmptyState } from '@/components/ui/empty-state';
import {
  JENIS_PENJADWALAN_BAWAAN,
  addDaysIso,
  clampBulanKeDepan,
  dateRangeForMonths,
  jenisLabel,
  lastTanggalForJenis,
  penjadwalanJenisPath,
  todayDateOnlyIso,
  type PenjadwalanEntry,
  type PenjadwalanJenis,
  type PenjadwalanMode,
  type PenjadwalanPreset,
} from '@/lib/penjadwalan';
import { appFieldClass, appFormGrid2, appLabelClass } from '@/lib/form-styles';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';

function todayIso(): string {
  return todayDateOnlyIso();
}

export default function PenjadwalanGenerate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const jenisParam = searchParams.get('jenis')?.trim() ?? '';

  const reload = useAppReload();
  const dataReady = useReloadKeyReady('penjadwalan');
  const dataLoading = useReloadKeyLoading('penjadwalan');

  const santriList = useAppStore((s) => s.santri);
  const kamarList = useAppStore((s) => s.kamar);
  const penjadwalanRows = useAppStore((s) => s.penjadwalan) as PenjadwalanEntry[];
  const presets = useAppStore((s) => s.penjadwalanPreset) as PenjadwalanPreset[];

  const presetForParam = useMemo(
    () => (jenisParam ? presets.find((p) => String(p.jenis) === jenisParam) : undefined),
    [presets, jenisParam]
  );

  const initialJenis = useMemo((): PenjadwalanJenis | 'lainnya' => {
    if (!jenisParam) return 'adzan';
    const builtIn = JENIS_PENJADWALAN_BAWAAN.find((j) => j.id === jenisParam);
    return builtIn ? builtIn.id : 'lainnya';
  }, [jenisParam]);

  const [jenisAktif, setJenisAktif] = useState<PenjadwalanJenis | 'lainnya'>(initialJenis);
  const [jenisKustom, setJenisKustom] = useState(
    initialJenis === 'lainnya' && jenisParam ? jenisParam : ''
  );
  const [mode, setMode] = useState<PenjadwalanMode>('santri');
  const [bulanKeDepan, setBulanKeDepan] = useState(1);
  const [mulai, setMulai] = useState(todayIso());

  useEffect(() => {
    if (!presetForParam) return;
    const builtIn = JENIS_PENJADWALAN_BAWAAN.find((j) => j.id === presetForParam.jenis);
    if (builtIn) {
      setJenisAktif(builtIn.id);
      setJenisKustom('');
    } else {
      setJenisAktif('lainnya');
      setJenisKustom(String(presetForParam.jenis));
    }
    setMode(presetForParam.mode);
    setBulanKeDepan(presetForParam.bulanKeDepan);
    const terakhir = lastTanggalForJenis(penjadwalanRows, String(presetForParam.jenis));
    const hariIni = todayIso();
    if (terakhir && terakhir < hariIni) {
      setMulai(addDaysIso(terakhir, 1));
    } else {
      setMulai(presetForParam.mulai.slice(0, 10));
    }
  }, [presetForParam, penjadwalanRows]);

  const jenisGenerate = jenisAktif === 'lainnya' ? jenisKustom.trim() : jenisAktif;
  const poolCount = mode === 'santri' ? santriList.length : kamarList.length;
  const previewRange = dateRangeForMonths(mulai, bulanKeDepan);

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!jenisGenerate) throw new Error('Jenis kosong');
      const res = await fetch('/api/penjadwalan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jenis: jenisGenerate,
          mode,
          mulai,
          bulanKeDepan: clampBulanKeDepan(bulanKeDepan),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        created?: number;
      };
      if (!res.ok) throw new Error(data?.error ?? 'generate failed');
      return data;
    },
    onSuccess: (data) => {
      void reload(['penjadwalan', 'penjadwalanPreset']);
      const { dari, sampai } = previewRange;
      const n = data?.created ?? 0;
      toast.success(
        n > 0
          ? `Jadwal ${jenisLabel(jenisGenerate)} dibuat ulang: ${n} hari (${dari} s/d ${sampai})`
          : `Tidak ada jadwal dibuat untuk periode ${dari} s/d ${sampai}.`
      );
      navigate(penjadwalanJenisPath(jenisGenerate));
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal membuat jadwal'),
  });

  if (dataLoading && !dataReady) {
    return <ListSkeleton rows={6} className="py-2" />;
  }

  return (
    <PageWithPullRefresh
      keys={['penjadwalan', 'penjadwalanPreset', 'santri', 'kamar']}
      className="space-y-4"
    >
      <div className={cn(appCardClass, 'p-4 space-y-4')}>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Setiap generate membuat jadwal <strong>baru</strong> untuk periode yang dipilih (default{' '}
          <strong>1 bulan</strong>). Jadwal lama pada rentang tanggal yang sama diganti otomatis.
        </p>

        <div>
          <label className={appLabelClass}>Jenis</label>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            {JENIS_PENJADWALAN_BAWAAN.map((j) => (
              <button
                key={j.id}
                type="button"
                onClick={() => setJenisAktif(j.id)}
                className={`px-3 py-2.5 rounded-sm text-left text-xs font-semibold border transition-all ${
                  jenisAktif === j.id
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {j.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setJenisAktif('lainnya')}
              className={`px-3 py-2.5 rounded-sm text-left text-xs font-semibold border transition-all ${
                jenisAktif === 'lainnya'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              Jenis lain
            </button>
          </div>
          {jenisAktif === 'lainnya' && (
            <input
              className={`mt-2 ${appFieldClass}`}
              placeholder="Nama jadwal, mis. Petugas Muhadharah"
              value={jenisKustom}
              onChange={(e) => setJenisKustom(e.target.value)}
            />
          )}
        </div>

        <div>
          <label className={appLabelClass}>Rotasi penugasan</label>
          <div className="flex gap-2 mt-1.5">
            <button
              type="button"
              onClick={() => setMode('santri')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-sm text-xs font-bold border ${
                mode === 'santri'
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              Per Santri
            </button>
            <button
              type="button"
              onClick={() => setMode('kamar')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-sm text-xs font-bold border ${
                mode === 'kamar'
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              <BedDouble className="w-3.5 h-3.5" />
              Per Kamar
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Pool rotasi: {poolCount} {mode === 'santri' ? 'santri' : 'kamar'}.
          </p>
        </div>

        <div className={appFormGrid2}>
          <div className="min-w-0">
            <label className={appLabelClass}>Mulai tanggal</label>
            <input
              type="date"
              className={appFieldClass}
              value={mulai}
              onChange={(e) => setMulai(e.target.value)}
            />
          </div>
          <div className="min-w-0">
            <label className={appLabelClass}>Berapa bulan</label>
            <input
              type="number"
              min={1}
              max={24}
              className={appFieldClass}
              value={bulanKeDepan}
              onChange={(e) => setBulanKeDepan(clampBulanKeDepan(Number(e.target.value)))}
            />
          </div>
        </div>

        <p className="text-[11px] text-slate-500 bg-slate-50 rounded-sm px-3 py-2 border border-slate-100">
          Periode: <strong>{previewRange.dari}</strong> sampai <strong>{previewRange.sampai}</strong>
        </p>

        <Button
          type="button"
          className="w-full bg-emerald-700 hover:bg-emerald-800"
          disabled={generateMutation.isPending || poolCount === 0 || !jenisGenerate}
          onClick={() => generateMutation.mutate()}
        >
          {generateMutation.isPending ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <CalendarRange className="w-4 h-4 mr-2" />
              Generate & simpan
            </>
          )}
        </Button>
        {poolCount === 0 && (
          <EmptyState
            icon={mode === 'santri' ? User : BedDouble}
            title="Data pool masih kosong"
            description="Tambah data santri/kamar dulu sebelum generate."
            variant="minimal"
            className="[&_p]:text-rose-600"
          />
        )}
      </div>
    </PageWithPullRefresh>
  );
}
