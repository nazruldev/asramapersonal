import { useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { Download, Upload, Trash2, RefreshCw, Eraser } from 'lucide-react';
import type { BackupClearScope } from '@/lib/client-api';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import { notifyFileSaved } from '@/lib/file-download-hints';
import { saveTextUserFile, saveUserFile } from '@/lib/save-user-file';
import { toast } from '@/lib/toast';
import { AppLoadingIndicator } from '@/components/app-loading-indicator';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { shouldPersistToSqlite } from '@/lib/offline-db';
import { exportDatabaseAsSql, importDatabaseFromSql, looksLikeSqlBackup } from '@/lib/db/sql-backup';
import { flushClientApiPersist, reloadClientApiFromStorage } from '@/lib/client-api';

type BackupRestorePanelProps = {
  compact?: boolean;
};

export function BackupRestorePanel({ compact }: BackupRestorePanelProps) {
  const reloadAll = useAppStore((s) => s.reloadAll);
  const confirmDialog = useConfirmDialog();
  const [loading, setLoading] = useState(false);

  const backupDate = () => new Date().toISOString().split('T')[0];

  const handleExport = async () => {
    try {
      setLoading(true);
      await flushClientApiPersist();

      if (shouldPersistToSqlite()) {
        const sql = await exportDatabaseAsSql();
        const filename = `asrama-backup-${backupDate()}.sql`;
        const { method } = await saveTextUserFile(sql, filename, 'application/sql;charset=utf-8');
        notifyFileSaved(method, filename);
        return;
      }

      const res = await fetch('/api/backup');
      if (!res.ok) throw new Error('export failed');
      const data = await res.json();
      const json = JSON.stringify(data, null, 2);
      const filename = `asrama-backup-${backupDate()}.json`;
      const blob = new Blob([json], { type: 'application/json' });
      const { method } = await saveUserFile(blob, filename, 'application/json');
      notifyFileSaved(method, filename);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Gagal mengeksport data';
      toast.error(msg.length > 160 ? 'Gagal mengeksport data' : msg);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const text = await file.text();

      if (shouldPersistToSqlite() && looksLikeSqlBackup(text, file.name)) {
        await importDatabaseFromSql(text);
        await reloadClientApiFromStorage();
        await reloadAll();
        toast.success('Cadangan SQL berhasil diimpor', {
          description:
            'Data dari berkas .sql sudah dimuat ke SQLite aplikasi. Tidak perlu menyalin file ke folder internal.',
          duration: 8_000,
        });
        return;
      }

      const data = JSON.parse(text);
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'import failed');
      }
      await reloadAll();
      toast.success('Data berhasil diimpor');
    } catch (error) {
      const message =
        error instanceof Error && error.message && error.message !== 'import failed'
          ? error.message
          : shouldPersistToSqlite()
            ? 'Gagal mengimpor. Gunakan berkas .sql dari ekspor cadangan di aplikasi ini.'
            : 'Gagal mengimpor data. Pastikan file JSON valid.';
      toast.error(message);
      console.error(error);
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  const requestRestoreInitial = () => {
    confirmDialog.ask({
      title: 'Reset ke kondisi awal?',
      message:
        'Santri, kamar, absensi, izin, dan data operasional lain akan dikosongkan. Daftar kelas default (7–12) diisi ulang otomatis. Kata sandi & pertanyaan keamanan tetap.',
      confirmLabel: 'Ya, Reset',
      onConfirm: async () => {
        try {
          setLoading(true);
          const res = await fetch('/api/backup/restore-initial', { method: 'POST' });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err as { error?: string }).error || 'restore failed');
          }
          await reloadAll();
          toast.success('Data direset ke kondisi awal');
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message.includes('DOCTYPE') || error.message.includes('<!')
                ? 'API tidak tersedia. Pastikan server jalan (npm run dev) atau buka dari aplikasi Android.'
                : error.message
              : 'Gagal mereset data';
          toast.error(message);
          console.error(error);
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const CLEAR_SCOPE_OPTIONS: {
    scope: BackupClearScope;
    title: string;
    detail: string;
    tone: string;
  }[] = [
    {
      scope: 'pelanggaran',
      title: 'Kosongkan pelanggaran / BK',
      detail: 'Hapus catatan pembinaan & hitungan pelanggaran (santri tetap)',
      tone: 'bg-rose-500',
    },
    {
      scope: 'absensi',
      title: 'Kosongkan absensi',
      detail: 'Semua riwayat kehadiran dihapus',
      tone: 'bg-violet-500',
    },
    {
      scope: 'izin',
      title: 'Kosongkan izin',
      detail: 'Semua data izin keluar/masuk dihapus',
      tone: 'bg-sky-500',
    },
  ];

  const requestClearScope = (scope: BackupClearScope, title: string, detail: string) => {
    confirmDialog.ask({
      title,
      message: `${detail} Santri, kamar, kegiatan, dan jadwal tidak diubah.`,
      confirmLabel: 'Ya, kosongkan',
      destructive: true,
      onConfirm: async () => {
        try {
          setLoading(true);
          const res = await fetch('/api/backup/clear-scope', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scope }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err as { error?: string }).error || 'Gagal mengosongkan');
          }
          await reloadAll();
          toast.success('Data berhasil dikosongkan');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Gagal mengosongkan data';
          toast.error(message);
          console.error(error);
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const requestClearAll = () => {
    confirmDialog.ask({
      title: 'Hapus semua data?',
      message:
        'Semua data santri, kamar, absensi, dan lainnya akan dihapus. Pengaturan asrama & keamanan tetap.',
      confirmLabel: 'Ya, Hapus Semua',
      destructive: true,
      onConfirm: async () => {
        try {
          setLoading(true);
          const res = await fetch('/api/backup/clear', { method: 'POST' });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err as { error?: string }).error || 'Gagal menghapus data');
          }
          await reloadAll();
          toast.success('Semua data berhasil dihapus');
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Gagal menghapus data';
          toast.error(message);
          console.error(error);
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const btnClass = cn(
    appCardClass,
    'w-full text-left flex items-center gap-3 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all disabled:opacity-50',
    compact ? 'p-3' : 'p-4 gap-4 active:scale-[0.98] hover:shadow-md dark:hover:shadow-none'
  );

  const iconClass = compact ? 'w-5 h-5 shrink-0 mt-0.5' : 'w-6 h-6 shrink-0 mt-0.5';

  const exportHint = shouldPersistToSqlite()
    ? 'Unduh cadangan SQL (seluruh tabel SQLite) ke folder Unduhan'
    : 'Unduh cadangan JSON (pengembangan / browser)';

  const importHint = shouldPersistToSqlite()
    ? 'Pulihkan dari berkas .sql hasil ekspor di aplikasi ini'
    : 'Pulihkan dari berkas cadangan JSON';

  const importAccept = shouldPersistToSqlite()
    ? '.sql,application/sql,.json,application/json'
    : '.json,application/json';

  return (
    <div className="space-y-3">
      <button type="button" onClick={handleExport} disabled={loading} className={btnClass}>
        <Download className={`${iconClass} text-emerald-600`} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 mb-0.5">Ekspor cadangan</h3>
          <p className="text-[11px] text-slate-500 leading-snug">{exportHint}</p>
        </div>
      </button>

      <button type="button" onClick={requestRestoreInitial} disabled={loading} className={btnClass}>
        <RefreshCw className={`${iconClass} text-amber-600`} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 mb-0.5">Reset data operasional</h3>
          <p className="text-[11px] text-slate-500 leading-snug">Kosongkan santri/kamar; kelas default tetap diisi</p>
        </div>
      </button>

      <div className={cn(appCardClass, compact ? 'p-3 space-y-2' : 'p-4 space-y-3')}>
        <div className="flex items-start gap-2">
          <Eraser className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">Kosongkan sebagian</h3>
            <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
              Santri, kamar, kegiatan, dan jadwal tidak dihapus.
            </p>
          </div>
        </div>
        <div className="grid gap-2">
          {CLEAR_SCOPE_OPTIONS.map((opt) => (
            <button
              key={opt.scope}
              type="button"
              disabled={loading}
              onClick={() => requestClearScope(opt.scope, opt.title, opt.detail)}
              className={cn(
                'w-full flex items-center gap-3 rounded-sm border border-slate-200 dark:border-slate-700',
                'bg-white dark:bg-slate-800 px-3 py-2.5 text-left hover:border-emerald-300 dark:hover:border-emerald-700',
                'transition-all disabled:opacity-50 active:scale-[0.99]'
              )}
            >
              <span className={cn('w-2 h-8 rounded-full shrink-0', opt.tone)} aria-hidden />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-slate-900 dark:text-slate-50">{opt.title}</span>
                <span className="block text-[10px] text-slate-500 leading-snug">{opt.detail}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <label className={`${btnClass} cursor-pointer block`}>
        <Upload className={`${iconClass} text-blue-600`} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 mb-0.5">Impor cadangan</h3>
          <p className="text-[11px] text-slate-500 leading-snug">{importHint}</p>
        </div>
        <input type="file" accept={importAccept} onChange={handleImport} disabled={loading} className="hidden" />
      </label>

      <button type="button" onClick={requestClearAll} disabled={loading} className={btnClass}>
        <Trash2 className={`${iconClass} text-red-600`} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 mb-0.5">Hapus semua data</h3>
          <p className="text-[11px] text-slate-500 leading-snug">Kosongkan data operasional</p>
        </div>
      </button>

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

      {loading && <AppLoadingIndicator message="Memproses…" fullscreen />}
    </div>
  );
}
