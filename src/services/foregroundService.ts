// src/services/foregroundService.ts
// Android foreground service wrapper (via @notifee/react-native).
//
// Purpose: while a BLE trigger device is connected, keep the app process — and
// therefore its BLE connection and audio playback — alive when the screen is
// off / the app is backgrounded, so touch triggers still fire during sleep.
// The persistent notification tells Android to keep us running; it is tied to
// the BLE connection lifecycle (started on connect, stopped on disconnect) and
// is Android-only (no-op elsewhere).
//
// IMPORTANT (New Architecture / bridgeless): notifee is loaded LAZILY (require
// inside functions) so that merely importing this module never instantiates the
// native module. Notifee's constructor eagerly reads NativeModules.NotifeeApiModule
// (via NativeEventEmitter); touching it during early bundle evaluation throws
// "Notifee native module not found". We therefore only access notifee after the
// RN runtime is initialised — registerBleForegroundService() is invoked from
// App's init effect, and start/stop run only on a live BLE connection.

import {Platform} from 'react-native';

const CHANNEL_ID = 'ble-connection';
const NOTIFICATION_ID = 'ble-foreground-service';

let isRunning = false;

// Lazily-resolved notifee module + enums (loaded on first use, post runtime-init).
let notifeeApi: any = null;
let ForegroundServiceType: any = null;
let Importance: any = null;

const getNotifee = (): any => {
  if (!notifeeApi) {
    const mod = require('@notifee/react-native');
    notifeeApi = mod.default;
    ForegroundServiceType = mod.AndroidForegroundServiceType;
    Importance = mod.AndroidImportance;
  }
  return notifeeApi;
};

/**
 * Register the long-running foreground-service task. Call once, AFTER the RN
 * runtime is ready (see App init effect) — not at bundle top-level. The task
 * promise never resolves; the service is ended via `stopForegroundService()`.
 */
export const registerBleForegroundService = (): void => {
  if (Platform.OS !== 'android') {
    return;
  }
  const notifee = getNotifee();
  notifee.registerForegroundService(() => {
    return new Promise(() => {
      // Keep the service alive for its lifetime. Ended by stopBleForegroundService().
    });
  });
};

const ensureChannel = async (): Promise<void> => {
  const notifee = getNotifee();
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'BLE Connection',
    // LOW keeps a persistent, quiet notification (no sound / heads-up).
    importance: Importance.LOW,
  });
};

/**
 * Start the foreground service. Idempotent. Android-only.
 * Declares both CONNECTED_DEVICE (BLE link) and MEDIA_PLAYBACK (background
 * audio) service types so the OS permits both while backgrounded.
 */
export const startBleForegroundService = async (
  deviceName?: string,
): Promise<void> => {
  if (Platform.OS !== 'android' || isRunning) {
    return;
  }
  try {
    const notifee = getNotifee();
    // Android 13+ needs POST_NOTIFICATIONS granted for the FGS notification to be
    // visible (the service still runs if denied, just without a visible notif).
    await notifee.requestPermission();
    await ensureChannel();
    await notifee.displayNotification({
      id: NOTIFICATION_ID,
      title: 'ESP Audio Trigger active',
      body: deviceName
        ? `Connected to ${deviceName} — listening for triggers`
        : 'Listening for BLE triggers',
      android: {
        channelId: CHANNEL_ID,
        asForegroundService: true,
        foregroundServiceTypes: [
          ForegroundServiceType.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
          ForegroundServiceType.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
        ],
        ongoing: true, // not user-dismissable while connected
        pressAction: {id: 'default'}, // tap returns to the app
      },
    });
    isRunning = true;
    console.log('[FGS] Foreground service started');
  } catch (e) {
    console.error('[FGS] Failed to start foreground service:', e);
  }
};

/**
 * Stop the foreground service and clear its notification. Idempotent. Android-only.
 */
export const stopBleForegroundService = async (): Promise<void> => {
  if (Platform.OS !== 'android' || !isRunning) {
    return;
  }
  try {
    const notifee = getNotifee();
    await notifee.stopForegroundService();
    isRunning = false;
    console.log('[FGS] Foreground service stopped');
  } catch (e) {
    console.error('[FGS] Failed to stop foreground service:', e);
  }
};

export const isForegroundServiceRunning = (): boolean => isRunning;
