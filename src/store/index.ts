// Redux store configuration

import {configureStore} from '@reduxjs/toolkit';
import espDevicesReducer from './slices/espDevices';
import audioFilesReducer from './slices/audioFiles';
import settingsReducer from './slices/settings';

// Configure the Redux store
export const store = configureStore({
  reducer: {
    espDevices: espDevicesReducer,
    audioFiles: audioFilesReducer,
    settings: settingsReducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore non-serializable date instances in actions
        ignoredActions: ['espDevices/updateDevice'],
      },
    }),
});

// Export types for TypeScript type safety
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
