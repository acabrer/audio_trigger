// src/services/foregroundService.ts
// Android foreground service wrapper (via @notifee/react-native).
//
// Purpose: keep the app process — and therefore its UDP socket / BLE connection
// and audio playback — alive when the screen is off or the app is backgrounded,
// so incoming triggers still fire while the device sleeps (Doze / App Standby).
// Without this, Android freezes the process after a while and UDP packets stop
// being delivered until the user manually wakes the phone.
//
// The service is REFERENCE-COUNTED across independent subsystems ("reasons"):
//   - 'ble' : started on BLE connect, stopped on disconnect
//   - 'udp' : started when the UDP listener binds, stopped when it closes
// The persistent notification is shown while at least one reason is active and
// removed only when the last reason clears. Android-only (no-op elsewhere).
//
// IMPORTANT (New Architecture / bridgeless): notifee is loaded LAZILY (require
// inside functions) so that merely importing this module never instantiates the
// native module. Notifee's constructor eagerly reads NativeModules.NotifeeApiModule
// (via NativeEventEmitter); touching it during early bundle evaluation throws
// "Notifee native module not found". We therefore only access notifee after the
// RN runtime is initialised — registerForegroundService() is invoked from App's
// init effect, and start/stop run only once a live connection/socket exists.

import {Platform} from 'react-native';

type Reason = 'ble' | 'udp';

const CHANNEL_ID = 'trigger-connection';
const NOTIFICATION_ID = 'trigger-foreground-service';

// Active reasons mapped to the notification line each contributes. The service
// runs while this map is non-empty.
const activeReasons = new Map<Reason, string>();
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
 * promise never resolves; the service is ended via stopForegroundService().
 */
export const registerForegroundService = (): void => {
  if (Platform.OS !== 'android') {
    return;
  }
  const notifee = getNotifee();
  notifee.registerForegroundService(() => {
    return new Promise(() => {
      // Keep the service alive for its lifetime. Ended by stopFor() below.
    });
  });
};

const ensureChannel = async (): Promise<void> => {
  const notifee = getNotifee();
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Trigger Connection',
    // LOW keeps a persistent, quiet notification (no sound / heads-up).
    importance: Importance.LOW,
  });
};

// Build the notification body from whichever reasons are currently active.
const buildBody = (): string => {
  const lines = Array.from(activeReasons.values());
  return lines.length > 0 ? lines.join(' · ') : 'Listening for triggers';
};

// (Re)display the foreground-service notification with the current body. Calling
// displayNotification with asForegroundService: true both starts the service and
// updates the notification if it is already running.
const render = async (): Promise<void> => {
  const notifee = getNotifee();
  // Android 13+ needs POST_NOTIFICATIONS granted for the FGS notification to be
  // visible (the service still runs if denied, just without a visible notif).
  await notifee.requestPermission();
  await ensureChannel();
  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: 'ESP Audio Trigger active',
    body: buildBody(),
    android: {
      channelId: CHANNEL_ID,
      asForegroundService: true,
      // Declare CONNECTED_DEVICE (external ESP link) and MEDIA_PLAYBACK
      // (background audio) so the OS permits both while backgrounded.
      foregroundServiceTypes: [
        ForegroundServiceType.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
        ForegroundServiceType.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
      ],
      ongoing: true, // not user-dismissable while a reason is active
      pressAction: {id: 'default'}, // tap returns to the app
    },
  });
  isRunning = true;
};

/**
 * Start (or refresh) the foreground service for a given reason. Idempotent per
 * reason/label. Android-only.
 */
const startFor = async (reason: Reason, label: string): Promise<void> => {
  if (Platform.OS !== 'android') {
    return;
  }
  // Nothing changed — avoid re-rendering the notification unnecessarily.
  if (isRunning && activeReasons.get(reason) === label) {
    return;
  }
  activeReasons.set(reason, label);
  try {
    await render();
    console.log(`[FGS] running for: ${Array.from(activeReasons.keys()).join(', ')}`);
  } catch (e) {
    console.error('[FGS] Failed to start foreground service:', e);
  }
};

/**
 * Clear a reason. Stops the service only when NO reasons remain; otherwise the
 * notification is refreshed to reflect the remaining reasons. Idempotent.
 * Android-only.
 */
const stopFor = async (reason: Reason): Promise<void> => {
  if (Platform.OS !== 'android' || !activeReasons.has(reason)) {
    return;
  }
  activeReasons.delete(reason);
  try {
    if (activeReasons.size > 0) {
      // Another subsystem still needs the service — just update the text.
      await render();
      return;
    }
    if (isRunning) {
      const notifee = getNotifee();
      await notifee.stopForegroundService();
      isRunning = false;
      console.log('[FGS] stopped (no active reasons)');
    }
  } catch (e) {
    console.error('[FGS] Failed to stop foreground service:', e);
  }
};

// --- BLE-specific wrappers (used by bluetoothLE.ts) ---

export const startBleForegroundService = (deviceName?: string): Promise<void> =>
  startFor(
    'ble',
    deviceName ? `Connected to ${deviceName}` : 'Listening for BLE triggers',
  );

export const stopBleForegroundService = (): Promise<void> => stopFor('ble');

// --- UDP-specific wrappers (used by udp.ts) ---

export const startUdpForegroundService = (port?: number): Promise<void> =>
  startFor(
    'udp',
    port ? `Listening for UDP triggers on port ${port}` : 'Listening for UDP triggers',
  );

export const stopUdpForegroundService = (): Promise<void> => stopFor('udp');

export const isForegroundServiceRunning = (): boolean => isRunning;
