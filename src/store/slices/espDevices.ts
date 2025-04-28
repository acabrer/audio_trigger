// src/store/slices/espDevices.ts

import {createSlice, PayloadAction} from '@reduxjs/toolkit';
import {ESPDevice} from '../../services/storage';

interface ESPDevicesState {
  devices: ESPDevice[];
  activeDeviceId: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: ESPDevicesState = {
  devices: [],
  activeDeviceId: null,
  loading: false,
  error: null,
};

const espDevicesSlice = createSlice({
  name: 'espDevices',
  initialState,
  reducers: {
    setDevices(state, action: PayloadAction<ESPDevice[]>) {
      state.devices = action.payload;
      state.loading = false;
      state.error = null;
    },
    addDevice(state, action: PayloadAction<ESPDevice>) {
      // Check if device already exists
      const exists = state.devices.some(
        device => device.id === action.payload.id,
      );
      if (!exists) {
        state.devices.push(action.payload);
      }
    },
    updateDevice(
      state,
      action: PayloadAction<Partial<ESPDevice> & {id: string}>,
    ) {
      const index = state.devices.findIndex(
        device => device.id === action.payload.id,
      );
      if (index !== -1) {
        state.devices[index] = {...state.devices[index], ...action.payload};
      }
    },
    removeDevice(state, action: PayloadAction<string>) {
      state.devices = state.devices.filter(
        device => device.id !== action.payload,
      );
      if (state.activeDeviceId === action.payload) {
        state.activeDeviceId = null;
      }
    },
    setActiveDevice(state, action: PayloadAction<string | null>) {
      state.activeDeviceId = action.payload;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      state.loading = false;
    },
  },
});

// Export actions
export const {
  setDevices,
  addDevice,
  updateDevice,
  removeDevice,
  setActiveDevice,
  setLoading,
  setError,
} = espDevicesSlice.actions;

// Export reducer
export default espDevicesSlice.reducer;
