import {useState, useEffect, useRef} from 'react';
import {BleManager, Device, Subscription, State} from 'react-native-ble-plx';
import {PermissionsAndroid, Platform} from 'react-native';
import {Buffer} from 'buffer';
import StorageService from './storage';

// BLE Service and Characteristic UUIDs (must match ESP32 firmware)
const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

// Use same message format as UDP service for compatibility
export interface ESPMessage {
  deviceId: string;
  buttonId?: string;
  buttonPressed: boolean;
  timestamp: number; // When message was received by app
  espTimestamp?: number; // When touch occurred on ESP32 (milliseconds since boot)
  batteryLevel?: number;
  deviceType?: 'ESP8266' | 'ESP32';
}

// Global service state
let bleManager: BleManager | null = null;
let globalIsConnected = false;
let globalDevice: Device | null = null;
const globalMessageHandlers: ((message: ESPMessage) => void)[] = [];
let characteristicSubscription: Subscription | null = null;

// Parse incoming BLE messages
const parseESPMessage = (messageString: string): ESPMessage | null => {
  try {
    console.log('[BLE] Received message:', messageString);

    if (messageString.startsWith('BUTTON:')) {
      const parts = messageString.split(':');

      if (parts.length >= 3) {
        const idPart = parts[1];
        const buttonState = parts[2].trim() === '1';

        let deviceId: string;
        let buttonId: string | undefined;
        let deviceType: 'ESP8266' | 'ESP32' = 'ESP8266';

        if (idPart.includes('_')) {
          // ESP32 format: DEVICE_BUTTON
          const idComponents = idPart.split('_');
          deviceId = idComponents[0];
          buttonId = idComponents[1];
          deviceType = 'ESP32';
          console.log(`[BLE] ESP32 device ${deviceId}, button ${buttonId}`);
        } else {
          // ESP8266 format: DEVICE
          deviceId = idPart;
          buttonId = undefined;
          console.log(`[BLE] ESP8266 device ${deviceId}`);
        }

        // Extract ESP timestamp (part 3) and battery level (part 4)
        let espTimestamp: number | undefined;
        let batteryLevel: number | undefined;

        // Part 3 could be either ESP timestamp or battery level
        if (parts.length >= 4 && parts[3]) {
          const value = parseInt(parts[3].trim(), 10);
          if (!isNaN(value)) {
            // If it's a large number (> 10000), it's likely a timestamp in ms
            // If it's 0-100, it's likely a battery level
            if (value > 10000) {
              espTimestamp = value;
            } else if (value >= 0 && value <= 100) {
              batteryLevel = value;
            }
          }
        }

        // Part 4 is battery level (if part 3 was timestamp)
        if (parts.length >= 5 && parts[4]) {
          const battery = parseInt(parts[4].trim(), 10);
          if (!isNaN(battery) && battery >= 0 && battery <= 100) {
            batteryLevel = battery;
          }
        }

        return {
          deviceId,
          buttonId,
          buttonPressed: buttonState,
          timestamp: Date.now(),
          espTimestamp,
          batteryLevel,
          deviceType,
        };
      }
    }

    // Try JSON fallback
    try {
      const jsonMessage = JSON.parse(messageString);
      if (jsonMessage.deviceId !== undefined) {
        return {
          deviceId: String(jsonMessage.deviceId),
          buttonId: jsonMessage.buttonId
            ? String(jsonMessage.buttonId)
            : undefined,
          buttonPressed: !!jsonMessage.buttonPressed,
          timestamp: Date.now(),
          batteryLevel: jsonMessage.batteryLevel,
          deviceType: jsonMessage.deviceType || 'ESP8266',
        };
      }
    } catch {
      // Not JSON
    }

    console.warn('[BLE] Message does not match ESP format:', messageString);
    return null;
  } catch (error) {
    console.error('[BLE] Error parsing ESP message:', error);
    return null;
  }
};

// Process received characteristic data
const processCharacteristicValue = (value: string) => {
  console.log('[BLE] Processing characteristic value:', value);

  const parsedMessage = parseESPMessage(value);
  if (parsedMessage) {
    // Notify all handlers
    globalMessageHandlers.forEach(handler => {
      try {
        handler(parsedMessage);
      } catch (handlerError) {
        console.error('[BLE] Error in message handler:', handlerError);
      }
    });
  }
};

// Bluetooth LE Service
const BluetoothLEService = {
  // Request Bluetooth permissions
  requestPermissions: async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const apiLevel = Platform.Version;

        if (apiLevel >= 31) {
          // Android 12+
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ]);

          return (
            granted['android.permission.BLUETOOTH_SCAN'] ===
              PermissionsAndroid.RESULTS.GRANTED &&
            granted['android.permission.BLUETOOTH_CONNECT'] ===
              PermissionsAndroid.RESULTS.GRANTED
          );
        } else {
          // Android 11 and below
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          );

          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
      } catch (err) {
        console.error('[BLE] Error requesting permissions:', err);
        return false;
      }
    }
    return true; // iOS handles permissions automatically
  },

  // Initialize BLE Manager
  initialize: async (): Promise<void> => {
    console.log('[BLE] Initializing BLE service...');

    if (!bleManager) {
      bleManager = new BleManager();
    }

    // Request permissions
    const hasPermissions = await BluetoothLEService.requestPermissions();
    if (!hasPermissions) {
      console.warn('[BLE] Bluetooth permissions not granted');
      return;
    }

    // Check if Bluetooth is powered on
    const state = await bleManager.state();
    if (state !== State.PoweredOn) {
      console.warn('[BLE] Bluetooth is not powered on, state:', state);
    }

    console.log('[BLE] BLE service initialized');
  },

  // Scan for ESP32 devices
  scanForDevices: async (
    timeoutMs: number = 10000,
  ): Promise<Device[]> => {
    if (!bleManager) {
      console.error('[BLE] BLE Manager not initialized');
      return [];
    }

    console.log('[BLE] Starting scan for ESP32 devices...');

    const foundDevices: Map<string, Device> = new Map();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        bleManager?.stopDeviceScan();
        console.log(`[BLE] Scan completed, found ${foundDevices.size} devices`);
        resolve(Array.from(foundDevices.values()));
      }, timeoutMs);

      bleManager.startDeviceScan(
        null, // Scan for all devices
        {allowDuplicates: false},
        (error, device) => {
          if (error) {
            clearTimeout(timeout);
            console.error('[BLE] Scan error:', error);
            bleManager?.stopDeviceScan();
            reject(error);
            return;
          }

          if (device) {
            // Filter for ESP32 devices by name
            const deviceName = device.name || device.localName || '';
            if (
              deviceName.toUpperCase().includes('ESP32') ||
              deviceName.toUpperCase().includes('TOUCH')
            ) {
              if (!foundDevices.has(device.id)) {
                foundDevices.set(device.id, device);
                console.log('[BLE] Found ESP32:', deviceName, device.id);
              }
            }
          }
        },
      );
    });
  },

  // Connect to a specific device
  connect: async (deviceId: string): Promise<boolean> => {
    if (!bleManager) {
      console.error('[BLE] BLE Manager not initialized');
      return false;
    }

    try {
      console.log('[BLE] Connecting to device:', deviceId);

      // Disconnect from any existing device
      await BluetoothLEService.disconnect();

      // Connect to device with timeout
      const device = await bleManager.connectToDevice(deviceId, {
        timeout: 10000,
      });

      console.log('[BLE] Connected to:', device.name);

      // Discover services and characteristics
      await device.discoverAllServicesAndCharacteristics();

      // Subscribe to characteristic notifications
      characteristicSubscription = device.monitorCharacteristicForService(
        SERVICE_UUID,
        CHARACTERISTIC_UUID,
        (error, characteristic) => {
          if (error) {
            console.error('[BLE] Characteristic monitoring error:', error);
            return;
          }

          if (characteristic?.value) {
            // Decode base64 value
            const decodedValue = Buffer.from(
              characteristic.value,
              'base64',
            ).toString('utf-8');
            processCharacteristicValue(decodedValue);
          }
        },
      );

      globalDevice = device;
      globalIsConnected = true;

      console.log('[BLE] Successfully connected and subscribed');

      // Save device ID
      await StorageService.saveSettings({
        pairedBluetoothDevice: deviceId,
      });

      return true;
    } catch (error) {
      console.error('[BLE] Connection error:', error);
      globalDevice = null;
      globalIsConnected = false;
      return false;
    }
  },

  // Disconnect from current device
  disconnect: async (): Promise<void> => {
    try {
      // Remove subscription
      if (characteristicSubscription) {
        characteristicSubscription.remove();
        characteristicSubscription = null;
      }

      // Disconnect device
      if (globalDevice) {
        await globalDevice.cancelConnection();
        console.log('[BLE] Disconnected from device');
      }

      globalDevice = null;
      globalIsConnected = false;
    } catch (error) {
      console.error('[BLE] Disconnect error:', error);
      globalDevice = null;
      globalIsConnected = false;
    }
  },

  // Get connection status
  isConnected: (): boolean => {
    return globalIsConnected;
  },

  // Get current device
  getDevice: (): Device | null => {
    return globalDevice;
  },

  // Subscribe to messages
  subscribe: (handler: (message: ESPMessage) => void) => {
    if (!globalMessageHandlers.includes(handler)) {
      globalMessageHandlers.push(handler);
      console.log(
        `[BLE] Handler subscribed. Total: ${globalMessageHandlers.length}`,
      );
    }

    // Return unsubscribe function
    return () => {
      const index = globalMessageHandlers.indexOf(handler);
      if (index > -1) {
        globalMessageHandlers.splice(index, 1);
        console.log(
          `[BLE] Handler unsubscribed. Total: ${globalMessageHandlers.length}`,
        );
      }
    };
  },

  // Stop service and cleanup
  stop: async (): Promise<void> => {
    console.log('[BLE] Stopping BLE service...');
    await BluetoothLEService.disconnect();
    globalMessageHandlers.length = 0;

    if (bleManager) {
      bleManager.destroy();
      bleManager = null;
    }

    console.log('[BLE] BLE service stopped');
  },
};

// React hook for Bluetooth LE
export const useBluetoothLE = () => {
  const [isConnected, setIsConnected] = useState(globalIsConnected);
  const [device, setDevice] = useState<Device | null>(globalDevice);
  const [messages, setMessages] = useState<ESPMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setErrorWithTimeout = (errorMessage: string) => {
    setError(errorMessage);
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
    errorTimeoutRef.current = setTimeout(() => {
      setError(null);
    }, 5000);
  };

  // Subscribe to messages
  useEffect(() => {
    const unsubscribe = BluetoothLEService.subscribe(message => {
      setMessages(prev => [message, ...prev].slice(0, 50));
    });

    return unsubscribe;
  }, []);

  // Sync connection state
  useEffect(() => {
    const interval = setInterval(() => {
      if (globalIsConnected !== isConnected) {
        setIsConnected(globalIsConnected);
      }
      if (globalDevice !== device) {
        setDevice(globalDevice);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isConnected, device]);

  // Scan for devices
  const scanDevices = async (): Promise<Device[]> => {
    try {
      setIsScanning(true);
      setError(null);

      const hasPermissions = await BluetoothLEService.requestPermissions();
      if (!hasPermissions) {
        setErrorWithTimeout('Bluetooth permissions not granted');
        return [];
      }

      const devices = await BluetoothLEService.scanForDevices(10000);
      return devices;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setErrorWithTimeout(`Scan error: ${errorMessage}`);
      return [];
    } finally {
      setIsScanning(false);
    }
  };

  // Connect to device
  const connect = async (deviceId: string): Promise<boolean> => {
    try {
      setError(null);
      const success = await BluetoothLEService.connect(deviceId);

      if (success) {
        setIsConnected(true);
        setDevice(globalDevice);
      } else {
        setErrorWithTimeout('Failed to connect to device');
      }

      return success;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setErrorWithTimeout(`Connection error: ${errorMessage}`);
      return false;
    }
  };

  // Disconnect
  const disconnect = async () => {
    try {
      await BluetoothLEService.disconnect();
      setIsConnected(false);
      setDevice(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setErrorWithTimeout(`Disconnect error: ${errorMessage}`);
    }
  };

  return {
    isConnected,
    device,
    messages,
    error,
    isScanning,
    scanDevices,
    connect,
    disconnect,
  };
};

export default BluetoothLEService;
