import { useEffect, useState } from 'react';
import { Cloud, CloudOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from '@/lib/sync/turso-sync';

function relTime(iso: string | null): string {
  if (!iso) return 'belum pernah';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return new Date(iso).toLocaleDateString('id-ID');
}

/** Indikator status sinkronisasi global — selalu terlihat di header. */
export function SyncStatusBadge() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus);
  useEffect(() => subscribeSyncStatus(setStatus), []);

  if (!status.configured) return null;

  const { icon, cls, title } = status.running
    ? { icon: <Loader2 className="w-4 h-4 animate-spin" />, cls: 'text-sky-600 dark:text-sky-400', title: 'Menyinkronkan…' }
    : !status.online
      ? { icon: <CloudOff className="w-4 h-4" />, cls: 'text-amber-600 dark:text-amber-400', title: 'Offline — perubahan tersimpan lokal, sinkron saat online' }
      : { icon: <Cloud className="w-4 h-4" />, cls: 'text-emerald-600 dark:text-emerald-400', title: `Sinkron terakhir: ${relTime(status.lastSyncAt)}` };

  return (
    <span
      title={status.lastError ?? title}
      aria-label={title}
      className={cn('inline-flex items-center p-1.5 rounded-sm', cls)}
    >
      {icon}
    </span>
  );
}
