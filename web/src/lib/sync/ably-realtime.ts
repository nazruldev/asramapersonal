import * as Ably from 'ably';

export const ABLY_SYNC_CHANNEL = 'asrama:sync';
const EVENT = 'data-changed';
const DEVICE_ID_KEY = 'asrama_ably_device_id';

export type SyncSignalPayload = {
  deviceId: string;
  at: string;
  reason?: string;
};

type SyncSignalHandler = (payload: SyncSignalPayload) => void;

let realtime: Ably.Realtime | null = null;
let channel: Ably.RealtimeChannel | null = null;
let started = false;
let deviceId = '';
let connectedWaiters: Array<() => void> = [];

function readAblyKey(): string | null {
  const key = (import.meta.env.VITE_ABLY_API_KEY as string | undefined)?.trim();
  return key || null;
}

function getOrCreateDeviceId(): string {
  if (typeof localStorage === 'undefined') {
    return `ephemeral-${Math.random().toString(36).slice(2)}`;
  }
  const existing = localStorage.getItem(DEVICE_ID_KEY)?.trim();
  if (existing) return existing;
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

function notifyConnected() {
  const waiters = connectedWaiters;
  connectedWaiters = [];
  for (const resolve of waiters) resolve();
}

export function isAblyConfigured(): boolean {
  return Boolean(readAblyKey());
}

export function getAblyDeviceId(): string {
  if (!deviceId) deviceId = getOrCreateDeviceId();
  return deviceId;
}

export function getAblyRealtime(): Ably.Realtime | null {
  return realtime;
}

export function getAblySyncChannel(): Ably.RealtimeChannel | null {
  return channel;
}

/** Tunggu koneksi Ably (timeout default 15 dtk). */
export function waitForAblyConnected(timeoutMs = 15_000): Promise<boolean> {
  if (!realtime) return Promise.resolve(false);
  if (realtime.connection.state === 'connected') return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      resolve(false);
    }, timeoutMs);
    connectedWaiters.push(() => {
      window.clearTimeout(timer);
      resolve(true);
    });
  });
}

function pushBodyForReason(reason: string): string {
  if (reason === 'kamar') return 'Data kamar diperbarui';
  if (reason === 'izin') return 'Data izin diperbarui';
  if (reason === 'absensi') return 'Data absensi diperbarui';
  if (reason === 'seed') return 'Data awal asrama disinkronkan';
  return 'Data asrama diperbarui';
}

/**
 * Publish sinyal realtime (wajib) + FCM push (opsional).
 * Realtime dipisah dari push: channel harus "Push notifications enabled"
 * di Ably Channel rules (namespace `asrama` / channel `asrama:sync`).
 */
export async function publishSyncSignal(reason = 'push'): Promise<void> {
  if (!channel) return;
  const payload: SyncSignalPayload = {
    deviceId: getAblyDeviceId(),
    at: new Date().toISOString(),
    reason,
  };

  // 1) Realtime sync — selalu tanpa extras.push
  try {
    await channel.publish(EVENT, payload);
  } catch (err) {
    console.warn('[ably] realtime publish failed:', err);
    return;
  }

  // 2) FCM — terpisah; gagal jika channel rule belum push-enabled
  try {
    await channel.publish({
      name: 'push-notify',
      data: payload,
      extras: {
        push: {
          notification: {
            title: 'Asrama Manager',
            body: pushBodyForReason(reason),
          },
          data: {
            type: 'sync',
            deviceId: payload.deviceId,
            reason,
          },
        },
      },
    });
  } catch (err) {
    console.warn(
      '[ably] FCM push skipped — aktifkan Channel rule Push notifications untuk `asrama:*` di Ably dashboard:',
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Hubungkan Ably realtime. Dipanggil sekali dari startAutoSync.
 * onRemoteSignal: device lain baru push → pull lokal.
 */
export function startAblyRealtime(onRemoteSignal: SyncSignalHandler): void {
  if (started || typeof window === 'undefined') return;
  const key = readAblyKey();
  if (!key) {
    console.info('[ably] skipped — set VITE_ABLY_API_KEY di web/.env');
    return;
  }

  started = true;
  deviceId = getOrCreateDeviceId();

  realtime = new Ably.Realtime({
    key,
    clientId: deviceId,
    autoConnect: true,
  });

  channel = realtime.channels.get(ABLY_SYNC_CHANNEL);

  void channel.subscribe(EVENT, (message) => {
    const data = (message.data ?? {}) as Partial<SyncSignalPayload>;
    const remoteId = typeof data.deviceId === 'string' ? data.deviceId : '';
    if (!remoteId || remoteId === deviceId) return;
    onRemoteSignal({
      deviceId: remoteId,
      at: typeof data.at === 'string' ? data.at : new Date().toISOString(),
      reason: typeof data.reason === 'string' ? data.reason : undefined,
    });
  });

  realtime.connection.on('connected', () => {
    console.info('[ably] connected — realtime sync on');
    notifyConnected();
  });
  realtime.connection.on('failed', (state) => {
    console.warn('[ably] connection failed:', state.reason?.message ?? state);
  });
}

export function stopAblyRealtime(): void {
  if (channel) {
    channel.unsubscribe();
    channel = null;
  }
  if (realtime) {
    realtime.close();
    realtime = null;
  }
  started = false;
  connectedWaiters = [];
}
