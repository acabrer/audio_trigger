// src/services/audioDeviceMonitor.ts
// Bridges the native AudioDeviceObserver (output-route changes) to an
// AudioContext rebuild. react-native-audio-api's Oboe stream does not survive a
// Bluetooth / wired-headset route change and goes permanently silent; rebuilding
// the context recreates the stream on whatever the current output device is.
//
// Fully defensive: on iOS, or if the native module is unavailable (a build
// without it), every call is a no-op so nothing breaks.

import {
  NativeModules,
  DeviceEventEmitter,
  Platform,
  type EmitterSubscription,
} from 'react-native';
import AudioService from './audio';

const NativeObserver: {start: () => void; stop: () => void} | undefined =
  NativeModules.AudioDeviceObserver;

let subscription: EmitterSubscription | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// A single route change fires several device callbacks in a burst (A2DP, AVRCP
// and headset profiles connect separately). Debounce so we rebuild exactly once,
// after the route has settled.
const DEBOUNCE_MS = 800;

export const startAudioDeviceMonitor = (): void => {
  if (Platform.OS !== 'android' || !NativeObserver || subscription) {
    return;
  }
  try {
    NativeObserver.start();
    subscription = DeviceEventEmitter.addListener(
      'audioDeviceChanged',
      (type: string) => {
        console.log('[AudioDeviceMonitor] output route changed:', type);
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          AudioService.rebuildContext();
        }, DEBOUNCE_MS);
      },
    );
    console.log('[AudioDeviceMonitor] started');
  } catch (e) {
    console.warn('[AudioDeviceMonitor] failed to start:', e);
  }
};

export const stopAudioDeviceMonitor = (): void => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
  try {
    NativeObserver?.stop();
  } catch {
    // ignore
  }
};
