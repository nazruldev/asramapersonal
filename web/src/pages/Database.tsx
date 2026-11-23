import { FileJson } from 'lucide-react';
import { BackupRestorePanel } from '@/components/backup-restore-panel';
import { TursoSyncPanel } from '@/components/turso-sync-panel';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { shouldPersistToSqlite } from '@/lib/offline-db';
import { isTursoConfigured } from '@/lib/sync/cloud-bootstrap';

function nativeStorageNote(): string {
  const tursoOn = isTursoConfigured();

  if (tursoOn) {
    return (
      'Mode direct Turso: setiap baca/tulis tembak cloud langsung. ' +
      'Internet wajib — tanpa jaringan layar dikunci. Web, PC, dan Android memakai database Turso yang sama.'
    );
  }

  if (shouldPersistToSqlite()) {
    return (
      'Database SQLite lokal (Turso belum dikonfigurasi). ' +
      'Isi VITE_TURSO_* di web/.env — aplikasi memerlukan Turso.'
    );
  }

  return (
    'Turso belum dikonfigurasi. Isi VITE_TURSO_DATABASE_URL dan VITE_TURSO_AUTH_TOKEN di web/.env.'
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
          <FileJson className="w-5 h-5 text-blue-600 dark:text-blue-300 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-blue-900 dark:text-blue-100 mb-1">
              {isTursoConfigured() ? 'Full-online Turso' : 'Turso wajib'}
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
