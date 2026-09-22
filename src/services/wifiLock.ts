// src/services/wifiLock.ts
// Thin JS wrapper around the native WifiLock module (android/.../WifiLockModule.kt).
//
// Holds a high-performance Wi-Fi lock while the UDP listener is active so the
// radio does not enter power-save with the screen off — the other half (with the
// foreground service) of preventing UDP delivery from stalling during sleep.
//
// Fully defensive: on iOS, or if the native module is unavailable for any reason
// (e.g. a build without it), every call is a silent no-op so nothing crashes.

import {NativeModules, Platform} from 'react-native';

const NativeWifiLock: {
  acquire: () => Promise<boolean>;
  release: () => Promise<boolean>;
} | undefined = NativeModules.WifiLock;

let held = false;

const isAvailable = (): boolean =>
  Platform.OS === 'android' && !!NativeWifiLock;

const acquire = async (): Promise<void> => {
  if (!isAvailable() || held) {
    return;
  }
  try {
    await NativeWifiLock!.acquire();
    held = true;
  } catch (e) {
    console.warn('[WifiLock] acquire failed:', e);
  }
};

const release = async (): Promise<void> => {
  if (!isAvailable() || !held) {
    return;
  }
  try {
    await NativeWifiLock!.release();
    held = false;
  } catch (e) {
    console.warn('[WifiLock] release failed:', e);
  }
};

const isHeld = (): boolean => held;

export default {acquire, release, isHeld};
