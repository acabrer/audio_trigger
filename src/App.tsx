import React, {useEffect} from 'react';
import {StatusBar, AppState} from 'react-native';
import {Provider} from 'react-redux';
import {store} from './store';
import AppNavigator from './navigation/AppNavigator';
import AudioService from './services/audio';
import UDPService from './services/udp';
import BluetoothService from './services/bluetooth';
import {setFiles} from './store/slices/audioFiles';
import {setDevices} from './store/slices/espDevices';
import {setSettings} from './store/slices/settings';
import StorageService from './services/storage';
import ErrorBoundary from './components/ErrorBoundary';
import StreamingLoopPlayer from './components/StreamingLoopPlayer';
import {registerForegroundService} from './services/foregroundService';
import {
  startAudioDeviceMonitor,
  stopAudioDeviceMonitor,
} from './services/audioDeviceMonitor';
import '../global.css';

function App(): React.JSX.Element {
  // Initialize app services and load data
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Register the foreground-service task now that the RN runtime is ready
        // (must NOT run at bundle top-level — notifee's native module is not
        // resolvable during early bridgeless startup). Covers both the BLE link
        // and the UDP listener; the service is ref-counted per subsystem.
        registerForegroundService();

        // Load app settings from storage first
        const settings = await StorageService.loadSettings();
        store.dispatch(setSettings(settings));

        // Initialize audio service
        await AudioService.initialize();

        // Watch for audio output-route changes (BT speaker / headset) and
        // rebuild the audio engine when they happen, so playback doesn't go
        // permanently silent after connecting/disconnecting a device.
        startAudioDeviceMonitor();

        // Initialize UDP service with port from settings
        await UDPService.initialize();

        // Initialize Bluetooth service if available. Non-fatal: a Bluetooth
        // failure must not stop saved devices/audio files below from loading
        // (UDP mode must work without Bluetooth).
        try {
          await BluetoothService.initialize();
        } catch (btErr) {
          console.warn('Bluetooth init failed (non-fatal), continuing:', btErr);
        }

        // Note: UDP auto-start is handled in Home screen after component mount
        // This ensures proper UI state synchronization

        // Load saved ESP devices
        const devices = await StorageService.loadESPDevices();
        store.dispatch(setDevices(devices));

        // Load audio files
        const audioFiles = await AudioService.loadAudioFiles();
        store.dispatch(setFiles(audioFiles));

        console.log('App initialization complete');
      } catch (error) {
        console.error('Error during app initialization:', error);
      }
    };

    initializeApp();

    // Clean up resources when app is closed
    return () => {
      BluetoothService.cleanup();
      UDPService.stop();
      stopAudioDeviceMonitor();
    };
  }, []);

  // Resume the audio engine whenever the app returns to the foreground. The OS
  // (notably Android 15 / HyperOS) can move the AudioContext to 'suspended'
  // while backgrounded; without resuming, playback stays silent afterwards and
  // sounds never fire onended. Harmless no-op when already running.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        AudioService.ensureContextRunning();
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <ErrorBoundary>
      <Provider store={store}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <AppNavigator />
        <StreamingLoopPlayer />
      </Provider>
    </ErrorBoundary>
  );
}

export default App;
