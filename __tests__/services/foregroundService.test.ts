/**
 * Tests for the reference-counted Android foreground service.
 *
 * The service must stay alive while EITHER the UDP listener or a BLE connection
 * needs it, and only stop once the last one clears — this is what keeps UDP
 * packets flowing with the screen off.
 */
import {Platform} from 'react-native';

type Notifee = {
  registerForegroundService: jest.Mock;
  displayNotification: jest.Mock;
  stopForegroundService: jest.Mock;
  createChannel: jest.Mock;
  requestPermission: jest.Mock;
};

type FgsModule = typeof import('../../src/services/foregroundService');

const originalOS = Platform.OS;

describe('foregroundService', () => {
  afterAll(() => {
    (Platform as {OS: string}).OS = originalOS;
  });

  // Re-require notifee and the module together after resetModules so both share
  // the same fresh mock instance (jest re-runs the mock factory on reset).
  const load = (os: 'android' | 'ios'): {fgs: FgsModule; notifee: Notifee} => {
    jest.resetModules();
    (Platform as {OS: string}).OS = os;
    const notifee = require('@notifee/react-native').default as Notifee;
    const fgs = require('../../src/services/foregroundService') as FgsModule;
    return {fgs, notifee};
  };

  describe('on android', () => {
    it('starts the foreground service when UDP begins listening', async () => {
      const {fgs, notifee} = load('android');

      await fgs.startUdpForegroundService(4210);

      expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
      expect(fgs.isForegroundServiceRunning()).toBe(true);
      const arg = notifee.displayNotification.mock.calls[0][0];
      expect(arg.android.asForegroundService).toBe(true);
      expect(String(arg.body)).toContain('4210');
    });

    it('stays alive until all reasons clear (ref-counted BLE + UDP)', async () => {
      const {fgs, notifee} = load('android');

      await fgs.startUdpForegroundService(4210);
      await fgs.startBleForegroundService('ESP-1');
      expect(fgs.isForegroundServiceRunning()).toBe(true);

      // Clearing BLE while UDP is still listening must NOT stop the service.
      await fgs.stopBleForegroundService();
      expect(notifee.stopForegroundService).not.toHaveBeenCalled();
      expect(fgs.isForegroundServiceRunning()).toBe(true);

      // Clearing the final reason stops it.
      await fgs.stopUdpForegroundService();
      expect(notifee.stopForegroundService).toHaveBeenCalledTimes(1);
      expect(fgs.isForegroundServiceRunning()).toBe(false);
    });

    it('does not re-render for a repeated identical start', async () => {
      const {fgs, notifee} = load('android');

      await fgs.startUdpForegroundService(4210);
      await fgs.startUdpForegroundService(4210);

      expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
    });

    it('stopping an inactive reason is a harmless no-op', async () => {
      const {fgs, notifee} = load('android');

      await fgs.stopUdpForegroundService();

      expect(notifee.stopForegroundService).not.toHaveBeenCalled();
      expect(fgs.isForegroundServiceRunning()).toBe(false);
    });
  });

  describe('on ios', () => {
    it('is a no-op (never touches notifee)', async () => {
      const {fgs, notifee} = load('ios');

      fgs.registerForegroundService();
      await fgs.startUdpForegroundService(4210);
      await fgs.startBleForegroundService('ESP-1');

      expect(notifee.displayNotification).not.toHaveBeenCalled();
      expect(notifee.registerForegroundService).not.toHaveBeenCalled();
      expect(fgs.isForegroundServiceRunning()).toBe(false);
    });
  });
});
