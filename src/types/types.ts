// This file contains TypeScript types and interfaces for the application.
// It includes types for navigation, ESP devices, audio files, and settings.

// Navigation types
export type RootStackParamList = {
  Home: undefined;
  DeviceDetails: {deviceId: string};
  AudioFiles: undefined;
  Settings: undefined;
};

// ESP Device types
export interface ESPDevice {
  id: string;
  name: string;
  lastSeen?: number; // timestamp
  batteryLevel?: number;
}

// Audio File types
export interface AudioFile {
  id: string;
  title: string;
  uri: string;
  deviceId?: string; // Associated ESP device
}

// Settings types
export interface AppSettings {
  autoStartListener: boolean;
  udpPort: number;
}
