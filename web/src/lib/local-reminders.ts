/**
 * Pengingat lokal (tanpa backend): absensi, izin, tunggakan.
 * Android: @capacitor/local-notifications — tetap jalan saat app mati.
 * Web/Electron: no-op (setTimeout tidak andal saat app ditutup).
 */
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import {
  isKegiatanActiveOnDate,
  parseJamMenit,
  type KegiatanSchedule,
} from '@/lib/kegiatan-schedule';
import {
  isIzinBatasBelumPasti,
  type IzinRow,
} from '@/lib/izin-group';
import {
  effectiveJatuhTempo,
  isTagihanTunggakan,
  listTagihan,
  sisaTagihan,
  type TagihanRow,
} from '@/lib/pembayaran-store';

const CHANNEL_ID = 'asrama-reminders';
const KIND = 'asrama-reminder';

/** Namespace ID notifikasi (integer unik per jenis). */
const NS_ABSENSI = 100_000;
const NS_IZIN = 200_000;
const NS_TUNGGAKAN = 300_000;

const ABSENSI_LOOKAHEAD_DAYS = 14;
const MAX_ABSENSI_NOTIFS = 40;
const MAX_IZIN_NOTIFS = 30;
const TUNGGAKAN_DAILY_DAYS = 7;

let started = false;
let rescheduleTimer: ReturnType<typeof setTimeout> | null = null;
let scheduling = false;

export const LOCAL_REMINDER_NAV_EVENT = 'asrama:local-reminder-navigate';

function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function todayDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayDateKey(d);
}

function stableId(ns: number, key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ns + (Math.abs(h) % 90_000);
}

function atDateTime(dateKey: string, minutesOfDay: number): Date {
  const h = Math.floor(minutesOfDay / 60);
  const min = minutesOfDay % 60;
  return new Date(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(5, 7)) - 1,
    Number(dateKey.slice(8, 10)),
    h,
    min,
    0,
    0
  );
}

function isFuture(d: Date, now = new Date()): boolean {
  return d.getTime() > now.getTime() + 15_000;
}

function buildAbsensiNotifications(
  kegiatan: KegiatanSchedule[],
  now: Date
): LocalNotificationSchema[] {
  const today = todayDateKey(now);
  const out: LocalNotificationSchema[] = [];

  for (let i = 0; i < ABSENSI_LOOKAHEAD_DAYS && out.length < MAX_ABSENSI_NOTIFS; i++) {
    const dateKey = addDaysDateKey(today, i);
    for (const keg of kegiatan) {
      if (out.length >= MAX_ABSENSI_NOTIFS) break;
      if (keg.untuk_absensi === false) continue;
      if (!isKegiatanActiveOnDate(keg, dateKey)) continue;

      const startMin = parseJamMenit(keg.jam_mulai);
      // 10 menit sebelum jam mulai; kalau tanpa jam → 07:00
      const remindMin =
        startMin !== null ? Math.max(0, startMin - 10) : 7 * 60;
      const when = atDateTime(dateKey, remindMin);
      if (!isFuture(when, now)) continue;

      const id = stableId(NS_ABSENSI, `${keg.id}|${dateKey}|${remindMin}`);
      out.push({
        id,
        title: `Absensi: ${keg.nama}`,
        body:
          startMin !== null
            ? `Pengingat absensi ${keg.nama} sebentar lagi (${keg.jam_mulai}).`
            : `Pengingat absensi ${keg.nama} hari ini.`,
        schedule: { at: when, allowWhileIdle: true },
        channelId: CHANNEL_ID,
        extra: { kind: KIND, type: 'absensi', route: '/laporan/absensi' },
      });
    }
  }
  return out;
}

function buildIzinNotifications(izin: IzinRow[], now: Date): LocalNotificationSchema[] {
  const out: LocalNotificationSchema[] = [];
  const active = izin.filter((i) => String(i.status_kembali) === 'Belum');

  for (const row of active) {
    if (out.length >= MAX_IZIN_NOTIFS) break;
    if (isIzinBatasBelumPasti(row.batas_kembali)) continue;

    const batas = new Date(row.batas_kembali);
    if (Number.isNaN(batas.getTime())) continue;

    const nama = row.santri_nama?.trim() || 'Santri';
    const route = '/laporan/izin';

    // 1 jam sebelum batas kembali
    const before = new Date(batas.getTime() - 60 * 60 * 1000);
    if (isFuture(before, now)) {
      out.push({
        id: stableId(NS_IZIN, `${row.id}|before`),
        title: 'Izin hampir habis',
        body: `${nama} harus kembali dalam 1 jam.`,
        schedule: { at: before, allowWhileIdle: true },
        channelId: CHANNEL_ID,
        extra: { kind: KIND, type: 'izin', route },
      });
    }

    // Saat batas tiba
    if (isFuture(batas, now)) {
      out.push({
        id: stableId(NS_IZIN, `${row.id}|due`),
        title: 'Batas izin tiba',
        body: `${nama} sudah harus kembali ke asrama.`,
        schedule: { at: batas, allowWhileIdle: true },
        channelId: CHANNEL_ID,
        extra: { kind: KIND, type: 'izin', route },
      });
    } else {
      // Sudah lewat: ingatkan besok pagi (sekali)
      const tomorrowMorning = atDateTime(addDaysDateKey(todayDateKey(now), 1), 7 * 60);
      if (isFuture(tomorrowMorning, now) && out.length < MAX_IZIN_NOTIFS) {
        out.push({
          id: stableId(NS_IZIN, `${row.id}|overdue`),
          title: 'Izin lewat batas',
          body: `${nama} belum kembali — cek status izin.`,
          schedule: { at: tomorrowMorning, allowWhileIdle: true },
          channelId: CHANNEL_ID,
          extra: { kind: KIND, type: 'izin', route },
        });
      }
    }
  }
  return out;
}

function buildTunggakanNotifications(
  tagihan: TagihanRow[],
  now: Date
): LocalNotificationSchema[] {
  const out: LocalNotificationSchema[] = [];
  const today = todayDateKey(now);
  const unpaid = tagihan.filter((t) => sisaTagihan(t) > 0);

  // Tagihan jatuh tempo hari ini / 1 hari lagi
  for (const t of unpaid) {
    const due = effectiveJatuhTempo(t);
    if (!due) continue;
    if (due < today) continue; // overdue ditangani ringkas di bawah
    const daysUntil =
      (new Date(`${due}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) /
      86_400_000;
    if (daysUntil > 1) continue;

    const when = atDateTime(due, 8 * 60);
    if (!isFuture(when, now) && due === today) {
      // Sudah lewat jam 8 hari ini → skip; ringkasan overdue akan cover
      continue;
    }
    if (!isFuture(when, now)) continue;

    out.push({
      id: stableId(NS_TUNGGAKAN, `due|${t.id}|${due}`),
      title: daysUntil === 0 ? 'Tagihan jatuh tempo hari ini' : 'Tagihan jatuh tempo besok',
      body: `${t.nama_jenis || 'Tagihan'} — sisa Rp ${sisaTagihan(t).toLocaleString('id-ID')}.`,
      schedule: { at: when, allowWhileIdle: true },
      channelId: CHANNEL_ID,
      extra: { kind: KIND, type: 'tunggakan', route: '/master/pembayaran' },
    });
  }

  // Ringkasan tunggakan (sudah lewat tempo): tiap pagi 7 hari ke depan
  const overdue = unpaid.filter((t) => isTagihanTunggakan(t, today));
  if (overdue.length > 0) {
    const totalSisa = overdue.reduce((acc, t) => acc + sisaTagihan(t), 0);
    const santriIds = new Set(overdue.map((t) => t.santri_id));
    for (let i = 0; i < TUNGGAKAN_DAILY_DAYS; i++) {
      const dateKey = addDaysDateKey(today, i);
      const when = atDateTime(dateKey, 8 * 60);
      if (!isFuture(when, now)) continue;
      out.push({
        id: stableId(NS_TUNGGAKAN, `summary|${dateKey}`),
        title: 'Pengingat tunggakan',
        body: `${santriIds.size} santri · ${overdue.length} tagihan · sisa Rp ${totalSisa.toLocaleString('id-ID')}.`,
        schedule: { at: when, allowWhileIdle: true },
        channelId: CHANNEL_ID,
        extra: { kind: KIND, type: 'tunggakan', route: '/master/pembayaran' },
      });
    }
  }

  return out;
}

async function ensurePermissionAndChannel(): Promise<boolean> {
  let perm = await LocalNotifications.checkPermissions();
  if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') {
    perm = await LocalNotifications.requestPermissions();
  }
  if (perm.display !== 'granted') {
    console.warn('[local-reminders] izin notifikasi ditolak');
    return false;
  }

  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Pengingat Asrama',
      description: 'Absensi, izin, dan tunggakan',
      importance: 5,
      visibility: 1,
      sound: 'default',
      vibration: true,
    });
  } catch {
    /* channel sudah ada */
  }
  return true;
}

async function cancelOurPending(): Promise<void> {
  try {
    const pending = await LocalNotifications.getPending();
    const ours = pending.notifications.filter(
      (n) => (n.extra as { kind?: string } | undefined)?.kind === KIND
    );
    if (ours.length === 0) return;
    await LocalNotifications.cancel({
      notifications: ours.map((n) => ({ id: n.id })),
    });
  } catch (err) {
    console.warn('[local-reminders] cancel pending failed:', err);
  }
}

async function scheduleAll(): Promise<void> {
  if (!isAndroidNative()) return;
  if (scheduling) return;
  scheduling = true;
  try {
    const ok = await ensurePermissionAndChannel();
    if (!ok) return;

    const { useAppStore } = await import('@/store/app-store');
    const state = useAppStore.getState();
    if (!state.hydrated || state.cloudBlocked) return;

    const kegiatan = state.kegiatan as unknown as KegiatanSchedule[];
    const izin = state.izin as unknown as IzinRow[];

    let tagihan: TagihanRow[] = [];
    try {
      tagihan = await listTagihan();
    } catch (err) {
      console.warn('[local-reminders] listTagihan failed:', err);
    }

    const now = new Date();
    const notifications = [
      ...buildAbsensiNotifications(kegiatan, now),
      ...buildIzinNotifications(izin, now),
      ...buildTunggakanNotifications(tagihan, now),
    ];

    await cancelOurPending();

    if (notifications.length === 0) {
      console.info('[local-reminders] tidak ada jadwal');
      return;
    }

    // Schedule in chunks (plugin aman untuk batch sedang)
    const chunk = 40;
    for (let i = 0; i < notifications.length; i += chunk) {
      await LocalNotifications.schedule({
        notifications: notifications.slice(i, i + chunk),
      });
    }
    console.info('[local-reminders] terjadwal', notifications.length);
  } catch (err) {
    console.warn('[local-reminders] schedule failed:', err);
  } finally {
    scheduling = false;
  }
}

/** Debounced — aman dipanggil sering (reload / resume). */
export function rescheduleLocalReminders(): void {
  if (!isAndroidNative()) return;
  if (rescheduleTimer) clearTimeout(rescheduleTimer);
  rescheduleTimer = setTimeout(() => {
    rescheduleTimer = null;
    void scheduleAll();
  }, 800);
}

/**
 * Mulai pengingat lokal + listener resume / tap notifikasi.
 * Panggil sekali setelah bootstrap Android.
 */
export async function startLocalReminders(): Promise<void> {
  if (started) return;
  if (!isAndroidNative()) return;
  started = true;

  try {
    await LocalNotifications.addListener('localNotificationReceived', (notification) => {
      const extra = (notification.extra ?? {}) as {
        type?: string;
        route?: string;
        kind?: string;
      };
      if (extra.kind !== KIND) return;
      void import('@/lib/in-app-notifications').then(({ pushFromLocalOsNotification }) => {
        pushFromLocalOsNotification({
          title: notification.title,
          body: notification.body,
          type:
            extra.type === 'absensi' || extra.type === 'izin' || extra.type === 'tunggakan'
              ? extra.type
              : 'sistem',
          route: typeof extra.route === 'string' ? extra.route : undefined,
          idHint: `os-recv:${notification.id}`,
        });
      });
    });

    await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const n = action.notification;
      const extra = (n.extra ?? {}) as { route?: string; type?: string; kind?: string };
      void import('@/lib/in-app-notifications').then(({ pushFromLocalOsNotification }) => {
        pushFromLocalOsNotification({
          title: n.title,
          body: n.body,
          type:
            extra.type === 'absensi' || extra.type === 'izin' || extra.type === 'tunggakan'
              ? extra.type
              : 'sistem',
          route: typeof extra.route === 'string' ? extra.route : undefined,
          idHint: `os-tap:${n.id}`,
        });
      });
      const route = typeof extra.route === 'string' ? extra.route : '';
      if (!route) return;
      window.dispatchEvent(
        new CustomEvent(LOCAL_REMINDER_NAV_EVENT, { detail: { path: route } })
      );
    });

    await CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        rescheduleLocalReminders();
        void import('@/store/app-store').then(({ useAppStore }) => {
          const st = useAppStore.getState();
          if (!st.hydrated || st.cloudBlocked) return;
          void import('@/lib/in-app-notifications').then(({ syncOperationalInAppNotifications }) =>
            syncOperationalInAppNotifications({
              kegiatan: st.kegiatan as never,
              izin: st.izin as never,
            })
          );
        });
      }
    });

    rescheduleLocalReminders();
  } catch (err) {
    console.warn('[local-reminders] start failed:', err);
    started = false;
  }
}
