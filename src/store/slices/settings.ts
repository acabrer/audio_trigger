// src/store/slices/settings.ts

import {createSlice, PayloadAction} from '@reduxjs/toolkit';
import {AppSettings} from '../../services/storage';

// Default app settings
const initialState: AppSettings = {
  udpPort: 4210, // Updated to match ESP8266 port
  autoStartListener: true,
  maxVolume: 1.0,
  darkMode: false,
  lastConnectedDevices: [],
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setSettings(state, action: PayloadAction<AppSettings>) {
      return {...state, ...action.payload};
    },
    updateSettings(state, action: PayloadAction<Partial<AppSettings>>) {
      return {...state, ...action.payload};
    },
    setUDPPort(state, action: PayloadAction<number>) {
      state.udpPort = action.payload;
    },
    setAutoStartListener(state, action: PayloadAction<boolean>) {
      state.autoStartListener = action.payload;
    },
    setBluetoothDeviceName(state, action: PayloadAction<string | undefined>) {
      state.bluetoothDeviceName = action.payload;
    },
    setMaxVolume(state, action: PayloadAction<number>) {
      state.maxVolume = action.payload;
    },
    setDarkMode(state, action: PayloadAction<boolean>) {
      state.darkMode = action.payload;
    },
    addLastConnectedDevice(state, action: PayloadAction<string>) {
      if (!state.lastConnectedDevices.includes(action.payload)) {
        state.lastConnectedDevices.push(action.payload);
        // Keep only the last 5 devices
        if (state.lastConnectedDevices.length > 5) {
          state.lastConnectedDevices.shift();
        }
      }
    },
    clearLastConnectedDevices(state) {
      state.lastConnectedDevices = [];
    },
  },
});

// Export actions
export const {
  setSettings,
  updateSettings,
  setUDPPort,
  setAutoStartListener,
  setBluetoothDeviceName,
  setMaxVolume,
  setDarkMode,
  addLastConnectedDevice,
  clearLastConnectedDevices,
} = settingsSlice.actions;

// Export reducer
export default settingsSlice.reducer;
