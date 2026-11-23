import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell, CheckCheck, CalendarCheck, ClockAlert, Wallet, Info } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { Button } from '@/components/ui/button';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import {
  clearReadInAppNotifications,
  listInAppNotifications,
  markAllInAppNotificationsRead,
  markInAppNotificationRead,
  subscribeInAppNotifications,
  syncOperationalInAppNotifications,
  type InAppNotification,
  type InAppNotificationType,
} from '@/lib/in-app-notifications';
import { useAppStore } from '@/store/app-store';
import type { KegiatanSchedule } from '@/lib/kegiatan-schedule';
import type { IzinRow } from '@/lib/izin-group';

function typeIcon(type: InAppNotificationType) {
  switch (type) {
    case 'absensi':
      return CalendarCheck;
    case 'izin':
      return ClockAlert;
    case 'tunggakan':
      return Wallet;
    default:
      return Info;
  }
}

function typeTone(type: InAppNotificationType): string {
  switch (type) {
    case 'absensi':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'izin':
      return 'bg-amber-50 text-amber-800 border-amber-100';
    case 'tunggakan':
      return 'bg-rose-50 text-rose-700 border-rose-100';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-100';
  }
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export default function Notifikasi() {
  const navigate = useNavigate();
  const kegiatan = useAppStore((s) => s.kegiatan);
  const izin = useAppStore((s) => s.izin);
  const [items, setItems] = useState<InAppNotification[]>(() => listInAppNotifications());

  useEffect(() => subscribeInAppNotifications(() => setItems(listInAppNotifications())), []);

  useEffect(() => {
    void syncOperationalInAppNotifications({
      kegiatan: kegiatan as unknown as KegiatanSchedule[],
      izin: izin as unknown as IzinRow[],
    });
  }, [kegiatan, izin]);

  const unread = useMemo(() => items.filter((n) => !n.readAt).length, [items]);

  const openItem = (n: InAppNotification) => {
    markInAppNotificationRead(n.id);
    if (n.route) navigate(n.route);
  };

  return (
    <PageWithPullRefresh
      keys={['kegiatan', 'izin']}
      className="space-y-3"
      extraRefresh={async () => {
        await syncOperationalInAppNotifications({
          kegiatan: useAppStore.getState().kegiatan as unknown as KegiatanSchedule[],
          izin: useAppStore.getState().izin as unknown as IzinRow[],
        });
      }}
    >
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className="text-xs text-slate-500">
          {unread > 0 ? `${unread} belum dibaca` : 'Semua sudah dibaca'}
        </p>
        <div className="flex items-center gap-1.5">
          {unread > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => markAllInAppNotificationsRead()}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Tandai dibaca
            </Button>
          ) : null}
          {items.some((n) => n.readAt) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-slate-500"
              onClick={() => clearReadInAppNotifications()}
            >
              Hapus dibaca
            </Button>
          ) : null}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Belum ada notifikasi"
          description="Pengingat absensi, izin, dan tunggakan akan muncul di sini."
        />
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const Icon = typeIcon(n.type);
            const unreadItem = !n.readAt;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => openItem(n)}
                className={cn(
                  appCardClass,
                  'w-full text-left p-3.5 flex gap-3 transition-colors',
                  unreadItem
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'opacity-80'
                )}
              >
                <div
                  className={cn(
                    'w-9 h-9 rounded-full border flex items-center justify-center shrink-0',
                    typeTone(n.type)
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3
                      className={cn(
                        'text-sm truncate',
                        unreadItem ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'
                      )}
                    >
                      {n.title}
                    </h3>
                    {unreadItem ? (
                      <span className="mt-1 w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{n.body}</p>
                  <p className="text-[10px] text-slate-400 mt-1.5">{formatWhen(n.createdAt)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </PageWithPullRefresh>
  );
}
