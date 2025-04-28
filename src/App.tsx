import React, {useEffect} from 'react';
import {StatusBar} from 'react-native';
import {Provider} from 'react-redux';
import {store} from './store';
import AppNavigator from './navigation/AppNavigator';
import AudioService from './services/audio';
import {setFiles} from './store/slices/audioFiles';
import {setDevices} from './store/slices/espDevices';
import {setSettings} from './store/slices/settings';
import StorageService from './services/storage';

function App(): React.JSX.Element {
  // Initialize app services and load data
  useEffect(() => {
    const initializeApp = async () => {
      // Initialize audio service
      await AudioService.initialize();

      // Load app settings from storage
      const settings = await StorageService.loadSettings();
      store.dispatch(setSettings(settings));

      // Load saved ESP devices
      const devices = await StorageService.loadESPDevices();
      store.dispatch(setDevices(devices));

      // Load audio files
      const audioFiles = await AudioService.loadAudioFiles();
      store.dispatch(setFiles(audioFiles));
    };

    initializeApp();
  }, []);

  return (
    <Provider store={store}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <AppNavigator />
    </Provider>
  );
}

export default App;
