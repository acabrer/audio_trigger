import {Platform, PermissionsAndroid} from 'react-native';
import {BleManager, Device} from 'react-native-ble-plx';
import {EventEmitter} from 'events';

// Define interfaces for Bluetooth devices and connection
export interface BluetoothDevice {
  id: string;
  name: string;
  connected: boolean;
  type: 'speaker' | 'other';
}

// Events for Bluetooth state changes
export enum BluetoothEvents {
  DEVICE_FOUND = 'deviceFound',
  DEVICE_CONNECTED = 'deviceConnected',
  DEVICE_DISCONNECTED = 'deviceDisconnected',
  SCAN_STARTED = 'scanStarted',
  SCAN_STOPPED = 'scanStopped',
  ERROR = 'error',
}

// Bluetooth service for speaker connectivity
class BluetoothService {
  private manager: BleManager | null = null;
  private devices: Map<string, BluetoothDevice> = new Map();
  private scanning: boolean = false;
  private connectedDeviceId: string | null = null;
  private events: EventEmitter = new EventEmitter();

  // Initialize the Bluetooth service
  initialize = async (): Promise<boolean> => {
    try {
      // Check platform and request permissions if needed
      if (Platform.OS === 'android') {
        const granted = await this.requestPermissions();
        if (!granted) {
          console.error('Bluetooth permissions not granted');
          return false;
        }
      }

      // Initialize BLE manager
      this.manager = new BleManager();

      // Setup state change monitoring
      this.manager.onStateChange((state: string) => {
        if (state === 'PoweredOn') {
          console.log('Bluetooth is powered on');
        } else {
          console.log(`Bluetooth state: ${state}`);
          // Disconnect if Bluetooth is turned off
          if (state === 'PoweredOff' && this.connectedDeviceId) {
            this.disconnect();
          }
        }
      }, true);

      return true;
    } catch (error) {
      console.error('Failed to initialize Bluetooth service:', error);
      return false;
    }
  };

  // Request required permissions on Android
  private requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      const permissions = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

      // Add Bluetooth scanning/connecting permissions for Android 12+
      // Platform.Version returns a number on Android and a string on iOS
      if (Platform.OS === 'android') {
        const androidVersion = parseInt(Platform.Version.toString(), 10);
        if (androidVersion >= 31) {
          permissions.push(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          );
        }
      }

      const results = await PermissionsAndroid.requestMultiple(permissions);

      return Object.values(results).every(
        result => result === PermissionsAndroid.RESULTS.GRANTED,
      );
    } catch (error) {
      console.error('Error requesting Bluetooth permissions:', error);
      return false;
    }
  };

  // Start scanning for Bluetooth devices
  startScan = async (): Promise<boolean> => {
    if (!this.manager) {
      await this.initialize();
    }

    if (!this.manager || this.scanning) {
      return false;
    }

    try {
      this.devices.clear();
      this.scanning = true;
      this.events.emit(BluetoothEvents.SCAN_STARTED);

      // Looking specifically for audio devices
      this.manager.startDeviceScan(
        null,
        null,
        (error: Error | null, device: Device | null) => {
          if (error) {
            console.error('Error scanning for devices:', error);
            this.events.emit(BluetoothEvents.ERROR, error);
            this.stopScan();
            return;
          }

          if (device && device.name) {
            // Check if it's likely an audio device based on name or services
            const isAudioDevice = this.isPotentialAudioDevice(device);

            if (isAudioDevice) {
              const bluetoothDevice: BluetoothDevice = {
                id: device.id,
                name: device.name || 'Unknown Device',
                connected: false,
                type: 'speaker',
              };

              this.devices.set(device.id, bluetoothDevice);
              this.events.emit(BluetoothEvents.DEVICE_FOUND, bluetoothDevice);
            }
          }
        },
      );

      // Stop scanning after 10 seconds
      setTimeout(() => {
        this.stopScan();
      }, 10000);

      return true;
    } catch (error) {
      console.error('Failed to start Bluetooth scan:', error);
      this.scanning = false;
      this.events.emit(BluetoothEvents.ERROR, error);
      return false;
    }
  };

  // Stop scanning for devices
  stopScan = (): void => {
    if (this.manager && this.scanning) {
      this.manager.stopDeviceScan();
      this.scanning = false;
      this.events.emit(BluetoothEvents.SCAN_STOPPED);
    }
  };

  // Connect to a Bluetooth speaker
  connect = async (deviceId: string): Promise<boolean> => {
    if (!this.manager) {
      await this.initialize();
    }

    if (!this.manager) {
      return false;
    }

    try {
      // Stop scanning if it's active
      if (this.scanning) {
        this.stopScan();
      }

      // Get the device
      const device = await this.manager.connectToDevice(deviceId);
      await device.discoverAllServicesAndCharacteristics();

      // Update the device in our map
      const bluetoothDevice = this.devices.get(deviceId);
      if (bluetoothDevice) {
        bluetoothDevice.connected = true;
        this.devices.set(deviceId, bluetoothDevice);
      }

      this.connectedDeviceId = deviceId;
      this.events.emit(BluetoothEvents.DEVICE_CONNECTED, deviceId);

      // Setup disconnect listener
      device.onDisconnected(
        (error: Error | null, disconnectedDevice: Device) => {
          if (this.devices.has(disconnectedDevice.id)) {
            const foundDevice = this.devices.get(disconnectedDevice.id);
            if (foundDevice) {
              foundDevice.connected = false;
              this.devices.set(disconnectedDevice.id, foundDevice);
            }

            if (this.connectedDeviceId === disconnectedDevice.id) {
              this.connectedDeviceId = null;
            }

            this.events.emit(
              BluetoothEvents.DEVICE_DISCONNECTED,
              disconnectedDevice.id,
            );
          }
        },
      );

      return true;
    } catch (error) {
      console.error('Failed to connect to Bluetooth device:', error);
      this.events.emit(BluetoothEvents.ERROR, error);
      return false;
    }
  };

  // Disconnect from the current device
  disconnect = async (): Promise<boolean> => {
    if (!this.manager || !this.connectedDeviceId) {
      return false;
    }

    try {
      // Attempt to properly disconnect
      await this.manager.cancelDeviceConnection(this.connectedDeviceId);

      // Update device status
      if (this.devices.has(this.connectedDeviceId)) {
        const bluetoothDevice = this.devices.get(this.connectedDeviceId);
        if (bluetoothDevice) {
          bluetoothDevice.connected = false;
          this.devices.set(this.connectedDeviceId, bluetoothDevice);
        }
      }

      const disconnectedId = this.connectedDeviceId;
      this.connectedDeviceId = null;
      this.events.emit(BluetoothEvents.DEVICE_DISCONNECTED, disconnectedId);

      return true;
    } catch (error) {
      console.error('Failed to disconnect from Bluetooth device:', error);
      this.events.emit(BluetoothEvents.ERROR, error);
      return false;
    }
  };

  // Get all discovered devices
  getDevices = (): BluetoothDevice[] => {
    return Array.from(this.devices.values());
  };

  // Get currently connected device
  getConnectedDevice = (): BluetoothDevice | null => {
    if (!this.connectedDeviceId) {
      return null;
    }
    return this.devices.get(this.connectedDeviceId) || null;
  };

  // Check if a device is likely an audio device based on name or services
  private isPotentialAudioDevice = (device: Device): boolean => {
    // Common name patterns for audio devices
    const audioKeywords = [
      'speaker',
      'audio',
      'sound',
      'music',
      'headphone',
      'headset',
      'earbud',
      'bose',
      'sony',
      'jbl',
      'beats',
      'soundbar',
    ];

    if (device.name) {
      const nameLower = device.name.toLowerCase();
      return audioKeywords.some(keyword => nameLower.includes(keyword));
    }

    return false;
  };

  // Subscribe to events
  subscribe = (
    event: BluetoothEvents,
    callback: (...args: any[]) => void,
  ): (() => void) => {
    this.events.on(event, callback);
    return () => {
      this.events.off(event, callback);
    };
  };

  // Clean up resources
  cleanup = async (): Promise<void> => {
    if (this.connectedDeviceId) {
      await this.disconnect();
    }

    if (this.scanning) {
      this.stopScan();
    }

    if (this.manager) {
      this.manager.destroy();
      this.manager = null;
    }
  };
}

// Create singleton instance
export const bluetoothService = new BluetoothService();
export default bluetoothService;
