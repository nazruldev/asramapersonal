import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import {
  getAblyDeviceId,
  getAblyRealtime,
  getAblySyncChannel,
  isAblyConfigured,
  waitForAblyConnected,
} from '@/lib/sync/ably-realtime';

let started = false;

async function registerDeviceWithAbly(fcmToken: string): Promise<void> {
  const ok = await waitForAblyConnected();
  const realtime = getAblyRealtime();
  const channel = getAblySyncChannel();
  if (!ok || !realtime || !channel) {
    console.warn('[push] Ably belum connected — skip registrasi device');
    return;
  }

  const deviceId = getAblyDeviceId();
  await realtime.push.admin.deviceRegistrations.save({
    id: deviceId,
    clientId: deviceId,
    platform: 'android',
    formFactor: 'phone',
    push: {
      recipient: {
        transportType: 'fcm',
        registrationToken: fcmToken,
      },
    },
  });

  // Subscribe semua device dengan clientId ini ke channel sync (dapat push saat publish + extras.push).
  await channel.push.subscribeClient();
  console.info('[push] device registered + subscribed:', deviceId);
}

/**
 * Aktifkan FCM + daftar ke Ably. Hanya Android native.
 * Panggil setelah startAutoSync() agar Ably client sudah ada.
 */
export async function startAblyPushNotifications(
  onSyncPush?: () => void
): Promise<void> {
  if (started) return;
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return;
  }
  if (!isAblyConfigured()) {
    console.info('[push] skipped — VITE_ABLY_API_KEY belum diisi');
    return;
  }

  started = true;

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      console.warn('[push] izin notifikasi ditolak');
      return;
    }

    await PushNotifications.addListener('registration', (token) => {
      void registerDeviceWithAbly(token.value).catch((err) => {
        console.warn('[push] register Ably failed:', err);
      });
    });

    await PushNotifications.addListener('registrationError', (err) => {
      console.warn('[push] FCM registration error:', err.error);
    });

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const data = (notification.data ?? {}) as Record<string, unknown>;
      const fromId = typeof data.deviceId === 'string' ? data.deviceId : '';
      if (fromId && fromId === getAblyDeviceId()) return;
      if (data.type === 'sync') {
        onSyncPush?.();
      }
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = (action.notification.data ?? {}) as Record<string, unknown>;
      if (data.type === 'sync') {
        onSyncPush?.();
      }
    });

    await PushNotifications.register();
    console.info('[push] FCM register() called');
  } catch (err) {
    console.warn('[push] start failed:', err);
    started = false;
  }
}
