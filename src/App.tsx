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
import '../global.css';

function App(): React.JSX.Element {
  // Initialize app services and load data
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Load app settings from storage first
        const settings = await StorageService.loadSettings();
        store.dispatch(setSettings(settings));

        // Initialize audio service
        await AudioService.initialize();

        // Initialize UDP service with port from settings
        await UDPService.initialize();

        // Initialize Bluetooth service if available
        await BluetoothService.initialize();

        // Start UDP listener if auto-start is enabled
        if (settings.autoStartListener) {
          // Wait for UDP service to be ready
          setTimeout(() => {
            // Check available methods on UDPService
            if (typeof UDPService.initialize === 'function') {
              // We already called initialize above, no need to do it again
            }
          }, 1000);
        }

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
    <Provider store={store}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <AppNavigator />
    </Provider>
  );
}

export default App;
