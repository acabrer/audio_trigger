// src/services/storage.ts

import AsyncStorage from '@react-native-async-storage/async-storage';

// Define app settings type
export interface AppSettings {
  udpPort: number;
  autoStartListener: boolean;
  bluetoothDeviceName?: string;
  maxVolume: number;
  darkMode: boolean;
  lastConnectedDevices: string[];
}

// Default app settings
const DEFAULT_SETTINGS: AppSettings = {
  udpPort: 8888,
  autoStartListener: true,
  maxVolume: 1.0,
  darkMode: false,
  lastConnectedDevices: [],
};

// Storage keys
const KEYS = {
  SETTINGS: 'app_settings',
  ESP_DEVICES: 'esp_devices',
};

// Define ESP device type
export interface ESPDevice {
  id: string;
  name: string;
  lastSeen?: number;
  batteryLevel?: number;
  audioFileId?: string;
}

// Storage service for saving/loading app data
export const StorageService = {
  // Load app settings
  loadSettings: async (): Promise<AppSettings> => {
    try {
      const settingsJson = await AsyncStorage.getItem(KEYS.SETTINGS);
      if (settingsJson) {
        const savedSettings = JSON.parse(settingsJson);
        // Merge with defaults to ensure all fields exist
        return {...DEFAULT_SETTINGS, ...savedSettings};
      }
      return DEFAULT_SETTINGS;
    } catch (error) {
      console.error('Failed to load settings:', error);
      return DEFAULT_SETTINGS;
    }
  },

  // Save app settings
  saveSettings: async (settings: Partial<AppSettings>): Promise<boolean> => {
    try {
      // Load current settings
      const currentSettings = await StorageService.loadSettings();
      // Merge with new settings
      const updatedSettings = {...currentSettings, ...settings};
      // Save to storage
      await AsyncStorage.setItem(
        KEYS.SETTINGS,
        JSON.stringify(updatedSettings),
      );
      return true;
    } catch (error) {
      console.error('Failed to save settings:', error);
      return false;
    }
  },

  // Load saved ESP devices
  loadESPDevices: async (): Promise<ESPDevice[]> => {
    try {
      const devicesJson = await AsyncStorage.getItem(KEYS.ESP_DEVICES);
      if (devicesJson) {
        return JSON.parse(devicesJson);
      }
      return [];
    } catch (error) {
      console.error('Failed to load ESP devices:', error);
      return [];
    }
  },

  // Save ESP devices
  saveESPDevices: async (devices: ESPDevice[]): Promise<boolean> => {
    try {
      await AsyncStorage.setItem(KEYS.ESP_DEVICES, JSON.stringify(devices));
      return true;
    } catch (error) {
      console.error('Failed to save ESP devices:', error);
      return false;
    }
  },

  // Add or update a single ESP device
  updateESPDevice: async (device: ESPDevice): Promise<boolean> => {
    try {
      const devices = await StorageService.loadESPDevices();
      const index = devices.findIndex(d => d.id === device.id);

      if (index >= 0) {
        // Update existing device
        devices[index] = {...devices[index], ...device};
      } else {
        // Add new device
        devices.push(device);
      }

      await AsyncStorage.setItem(KEYS.ESP_DEVICES, JSON.stringify(devices));
      return true;
    } catch (error) {
      console.error('Failed to update ESP device:', error);
      return false;
    }
  },

  // Remove an ESP device
  removeESPDevice: async (deviceId: string): Promise<boolean> => {
    try {
      const devices = await StorageService.loadESPDevices();
      const updatedDevices = devices.filter(device => device.id !== deviceId);
      await AsyncStorage.setItem(
        KEYS.ESP_DEVICES,
        JSON.stringify(updatedDevices),
      );
      return true;
    } catch (error) {
      console.error('Failed to remove ESP device:', error);
      return false;
    }
  },

  // Clear all storage (for debugging or reset)
  clearAllStorage: async (): Promise<boolean> => {
    try {
      await AsyncStorage.clear();
      return true;
    } catch (error) {
      console.error('Failed to clear storage:', error);
      return false;
    }
  },
};

export default StorageService;
