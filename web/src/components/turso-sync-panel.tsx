import { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Cloud, CloudOff, Loader2, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getSyncStatus,
  pushToTursoNow,
  runTursoPull,
  subscribeSyncStatus,
  type SyncStatus,
} from '@/lib/sync/turso-sync';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { appCardClass } from '@/lib/surface-styles';
import { useAppReload } from '@/hooks/use-app-reload';

function formatSyncTime(iso: string | null): string {
  if (!iso) return 'Belum pernah';
  try {
    return new Date(iso).toLocaleString('id-ID');
  } catch {
    return iso;
  }
}

function tursoHostLabel(): string | null {
  const raw = (import.meta.env.VITE_TURSO_DATABASE_URL as string | undefined)?.trim();
  if (!raw) return null;
  try {
    return new URL(raw.replace(/^libsql:/i, 'https:')).hostname;
  } catch {
    return raw.replace(/^libsql:\/\//i, '').split('/')[0] || null;
  }
}

const RELOAD_KEYS = [
  'dashboard',
  'santri',
  'kamar',
  'kelas',
  'kegiatan',
  'penjadwalan',
  'penjadwalanPreset',
  'absensi',
  'izin',
  'pembinaan',
  'settings',
] as const;

export function TursoSyncPanel() {
  const reload = useAppReload();
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus);
  const [busy, setBusy] = useState<'pull' | 'push' | null>(null);
  const host = useMemo(() => tursoHostLabel(), []);

  useEffect(() => subscribeSyncStatus(setStatus), []);

  const afterCloud = async (result: SyncStatus) => {
    await reload([...RELOAD_KEYS]);
    toast.success(result.lastResult ? `OK — ${result.lastResult}` : 'Selesai');
  };

  const onPull = async () => {
    setBusy('pull');
    try {
      const result = await runTursoPull();
      await afterCloud(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal muat dari cloud');
    } finally {
      setBusy(null);
    }
  };

  const onPush = async () => {
    setBusy('push');
    try {
      const result = await pushToTursoNow();
      await afterCloud(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal kirim ke cloud');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn(appCardClass, 'p-4 space-y-3')}>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0',
            status.configured && status.online
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-slate-100 text-slate-500'
          )}
        >
          {status.configured && status.online ? (
            <Cloud className="w-4 h-4" />
          ) : (
            <CloudOff className="w-4 h-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Turso Cloud (full online)
          </h3>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed mt-0.5">
            {status.configured
              ? `Data di tabel Turso: santri, kamar, kelas, … (${Capacitor.getPlatform()}). Wajib online.`
              : 'Belum terhubung ke Turso. Isi kredensial cloud di web/.env.'}
          </p>
          {status.configured && host ? (
            <p className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 mt-1 truncate">
              {host}
            </p>
          ) : null}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-sm bg-slate-50 dark:bg-slate-900/50 p-2">
          <dt className="text-slate-500">Status</dt>
          <dd className="font-medium text-slate-800 dark:text-slate-100">
            {!status.configured
              ? 'Belum dikonfigurasi'
              : status.online
                ? 'Terhubung Turso'
                : 'Offline'}
          </dd>
        </div>
        <div className="rounded-sm bg-slate-50 dark:bg-slate-900/50 p-2">
          <dt className="text-slate-500">Terakhir sync</dt>
          <dd className="font-medium text-slate-800 dark:text-slate-100 truncate">
            {formatSyncTime(status.lastSyncAt)}
          </dd>
        </div>
      </dl>

      {status.lastError ? (
        <p className="text-[11px] text-red-600 dark:text-red-400">{status.lastError}</p>
      ) : null}
      {!status.configured ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          Isi <code className="font-mono">VITE_TURSO_*</code> di <code className="font-mono">web/.env</code>.
        </p>
      ) : (
        <p className="text-[11px] text-slate-600 dark:text-slate-300">
          Setiap simpan data langsung dikirim ke Turso. Tombol di bawah untuk muat ulang atau
          kirim ulang ke tabel Turso (santri, kamar, …).
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          type="button"
          className="w-full"
          disabled={busy !== null || status.running || !status.configured}
          onClick={() => void onPull()}
        >
          {busy === 'pull' || status.running ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          <span className="ml-2">
            {busy === 'pull' ? 'Memuat…' : 'Muat ulang dari cloud'}
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={busy !== null || status.running || !status.configured}
          onClick={() => void onPush()}
        >
          {busy === 'push' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          <span className="ml-2">{busy === 'push' ? 'Mengirim…' : 'Kirim ke cloud'}</span>
        </Button>
      </div>
    </div>
  );
}
