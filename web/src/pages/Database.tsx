import { FileJson } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { BackupRestorePanel } from '@/components/backup-restore-panel';
import { TursoSyncPanel } from '@/components/turso-sync-panel';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { shouldPersistToSqlite } from '@/lib/offline-db';
import { isTursoConfigured } from '@/lib/sync/cloud-bootstrap';

function nativeStorageNote(): string {
  const platform = Capacitor.getPlatform();
  const tursoOn = isTursoConfigured();

  if (tursoOn) {
    const cache =
      shouldPersistToSqlite() || platform === 'android'
        ? 'Cache sesi di SQLite lokal (bukan sumber kebenaran).'
        : 'Cache sesi di browser (bukan sumber kebenaran).';
    return (
      `Mode full online Turso. Data masuk ke tabel cloud (santri, kamar, kelas, …); wajib internet. ${cache} ` +
      'Web, PC, dan Android memakai database Turso yang sama.'
    );
  }

  if (shouldPersistToSqlite()) {
    return (
      'Database SQLite lokal (Turso belum dikonfigurasi). ' +
      'Ekspor cadangan .sql ke folder Unduhan.'
    );
  }

  return (
    'Mode lokal browser (localStorage). Isi VITE_TURSO_* di web/.env untuk full online Turso.'
  );
}

export default function DatabasePage() {
  return (
    <PageWithPullRefresh
      keys={['dashboard', 'santri', 'kamar', 'kelas', 'kegiatan', 'settings']}
      className="space-y-4"
    >
      <div className="bg-blue-50 dark:bg-blue-950/40 rounded-sm p-4 border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-sm bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 flex items-center justify-center flex-shrink-0">
            <FileJson className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-blue-900 dark:text-blue-100 mb-1">
              {isTursoConfigured() ? 'Full online Turso' : 'Satu sumber data'}
            </h3>
            <p className="text-[11px] text-blue-700 dark:text-blue-200 leading-relaxed">
              {nativeStorageNote()}
            </p>
          </div>
        </div>
      </div>

      <TursoSyncPanel />
      <BackupRestorePanel />
    </PageWithPullRefresh>
  );
}
