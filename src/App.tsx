import React, {useEffect} from 'react';
import {StatusBar} from 'react-native';
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
import {registerBleForegroundService} from './services/foregroundService';
import '../global.css';

function App(): React.JSX.Element {
  // Initialize app services and load data
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Register the BLE foreground-service task now that the RN runtime is
        // ready (must NOT run at bundle top-level — notifee's native module is
        // not resolvable during early bridgeless startup).
        registerBleForegroundService();

        // Load app settings from storage first
        const settings = await StorageService.loadSettings();
        store.dispatch(setSettings(settings));

        // Initialize audio service
        await AudioService.initialize();

        // Initialize UDP service with port from settings
        await UDPService.initialize();

        // Initialize Bluetooth service if available
        await BluetoothService.initialize();

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
    };
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
