import {useState, useEffect, useRef} from 'react';
import RNBluetoothClassic, {
  BluetoothDevice,
  BluetoothEventSubscription,
} from 'react-native-bluetooth-classic';
import {PermissionsAndroid, Platform} from 'react-native';
import StorageService from './storage';

// Use same message format as UDP service for compatibility
export interface ESPMessage {
  deviceId: string;
  buttonId?: string; // Optional button ID for multi-button devices (ESP32)
  buttonPressed: boolean;
  timestamp: number;
  batteryLevel?: number;
  deviceType?: 'ESP8266' | 'ESP32'; // Auto-detected based on message format
}

// Global service state
let globalIsConnected = false;
let globalDevice: BluetoothDevice | null = null;
const globalMessageHandlers: ((message: ESPMessage) => void)[] = [];
let dataSubscription: BluetoothEventSubscription | null = null;

// Buffer for incomplete messages
let messageBuffer = '';

// Cleanup tracking
const activeTimeouts = new Set<ReturnType<typeof setTimeout>>();

const trackedSetTimeout = (callback: () => void, delay: number) => {
  const timeout = setTimeout(() => {
    activeTimeouts.delete(timeout);
    callback();
  }, delay);
  activeTimeouts.add(timeout);
  return timeout;
};

const clearAllTimers = () => {
  activeTimeouts.forEach(timeout => clearTimeout(timeout));
  activeTimeouts.clear();
};

// Parse incoming Bluetooth messages from ESP devices
// Same format as UDP: "BUTTON:ID:STATE" or "BUTTON:DEVICE_BUTTON:STATE"
const parseESPMessage = (messageString: string): ESPMessage | null => {
  try {
    console.log('Received BT message:', messageString);

    // Check if the message follows the ESP format
    if (messageString.startsWith('BUTTON:')) {
      const parts = messageString.split(':');

      if (parts.length >= 3) {
        const idPart = parts[1];
        const buttonState = parts[2].trim() === '1'; // 1 = pressed, 0 = released

        // Check if this is a composite ID (DEVICE_BUTTON format for ESP32)
        let deviceId: string;
        let buttonId: string | undefined;
        let deviceType: 'ESP8266' | 'ESP32' = 'ESP8266';

        if (idPart.includes('_')) {
          // Composite ID format (ESP32 with multiple buttons)
          const idComponents = idPart.split('_');
          deviceId = idComponents[0];
          buttonId = idComponents[1];
          deviceType = 'ESP32';
          console.log(`Detected ESP32 device ${deviceId}, button ${buttonId}`);
        } else {
          // Simple ID format (ESP8266 single button)
          deviceId = idPart;
          buttonId = undefined;
          console.log(`Detected ESP8266 device ${deviceId}`);
        }

        // Optional: Extract battery level if included
        let batteryLevel: number | undefined;
        if (parts.length >= 4 && parts[3]) {
          const batteryPart = parts[3].trim();
          if (batteryPart) {
            const battery = parseInt(batteryPart, 10);
            if (!isNaN(battery) && battery >= 0 && battery <= 100) {
              batteryLevel = battery;
            }
          }
        }

        return {
          deviceId,
          buttonId,
          buttonPressed: buttonState,
          timestamp: Date.now(),
          batteryLevel,
          deviceType,
        };
      }
    }

    // Try parsing as JSON fallback
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
      // Not valid JSON, continue
    }

    console.warn('Message does not match ESP format:', messageString);
    return null;
  } catch (error) {
    console.error('Error parsing ESP message:', error);
    return null;
  }
};

// Process received data (handle partial messages)
const processReceivedData = (data: string) => {
  // Add to buffer
  messageBuffer += data;

  // Process all complete messages (separated by newline)
  const messages = messageBuffer.split('\n');

  // Keep the last incomplete message in buffer
  messageBuffer = messages.pop() || '';

  // Process complete messages
  messages.forEach(message => {
    const trimmedMessage = message.trim();
    if (trimmedMessage) {
      const parsedMessage = parseESPMessage(trimmedMessage);
      if (parsedMessage) {
        console.log('Parsed BT ESP message:', parsedMessage);

        // Notify all handlers
        globalMessageHandlers.forEach(handler => {
          try {
            handler(parsedMessage);
          } catch (handlerError) {
            console.error('Error in BT message handler:', handlerError);
          }
        });
      }
    }
  });
};

// Bluetooth Service
const BluetoothSerialService = {
  // Request Bluetooth permissions (Android)
  requestPermissions: async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const apiLevel = Platform.Version;

        if (apiLevel >= 31) {
          // Android 12+ requires new permissions
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
          // Android 11 and below - just request location for BT Classic
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          );

          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
      } catch (err) {
        console.error('Error requesting Bluetooth permissions:', err);
        return false;
      }
    }
    return true; // iOS doesn't need explicit permissions for Bluetooth Classic
  },

  // Check if Bluetooth is enabled
  isEnabled: async (): Promise<boolean> => {
    try {
      return await RNBluetoothClassic.isBluetoothEnabled();
    } catch (error) {
      console.error('Error checking Bluetooth status:', error);
      return false;
    }
  },

  // Scan for ESP32 devices
  scanForDevices: async (): Promise<BluetoothDevice[]> => {
    try {
      // Get paired devices first
      const pairedDevices = await RNBluetoothClassic.getBondedDevices();

      // Filter for ESP32 devices (by name prefix)
      const espDevices = pairedDevices.filter(device =>
        device.name?.toUpperCase().includes('ESP32'),
      );

      console.log(`Found ${espDevices.length} paired ESP32 devices`);
      return espDevices;
    } catch (error) {
      console.error('Error scanning for Bluetooth devices:', error);
      return [];
    }
  },

  // Connect to a specific device
  connect: async (deviceAddress: string): Promise<boolean> => {
    try {
      console.log(`Attempting to connect to device: ${deviceAddress}`);

      // Disconnect from any existing device first
      await BluetoothSerialService.disconnect();

      // Get the device
      const devices = await RNBluetoothClassic.getBondedDevices();
      const device = devices.find(d => d.address === deviceAddress);

      if (!device) {
        console.error('Device not found:', deviceAddress);
        return false;
      }

      // Connect to the device
      const connected = await device.connect({
        delimiter: '\n',
        deviceCharacterEncoding: 'utf-8',
      });

      if (connected) {
        globalDevice = device;
        globalIsConnected = true;
        messageBuffer = ''; // Clear buffer

        // Subscribe to incoming data
        dataSubscription = device.onDataReceived(data => {
          processReceivedData(data.data);
        });

        console.log(`Successfully connected to ${device.name}`);
        return true;
      } else {
        console.error('Failed to connect to device');
        return false;
      }
    } catch (error) {
      console.error('Error connecting to Bluetooth device:', error);
      return false;
    }
  },

  // Disconnect from current device
  disconnect: async (): Promise<void> => {
    try {
      // Unsubscribe from data
      if (dataSubscription) {
        dataSubscription.remove();
        dataSubscription = null;
      }

      // Disconnect device
      if (globalDevice) {
        await globalDevice.disconnect();
        console.log('Disconnected from Bluetooth device');
      }

      globalDevice = null;
      globalIsConnected = false;
      messageBuffer = '';
    } catch (error) {
      console.error('Error disconnecting from Bluetooth device:', error);
      globalDevice = null;
      globalIsConnected = false;
    }
  },

  // Get connection status
  isConnected: (): boolean => {
    return globalIsConnected;
  },

  // Get current device
  getDevice: (): BluetoothDevice | null => {
    return globalDevice;
  },

  // Subscribe to messages
  subscribe: (handler: (message: ESPMessage) => void) => {
    if (!globalMessageHandlers.includes(handler)) {
      globalMessageHandlers.push(handler);
      console.log(
        `BT message handler subscribed. Total handlers: ${globalMessageHandlers.length}`,
      );
    }

    // Return unsubscribe function
    return () => {
      const index = globalMessageHandlers.indexOf(handler);
      if (index > -1) {
        globalMessageHandlers.splice(index, 1);
        console.log(
          `BT message handler unsubscribed. Total handlers: ${globalMessageHandlers.length}`,
        );
      }
    };
  },

  // Initialize service
  initialize: async (): Promise<void> => {
    console.log('Initializing Bluetooth Serial service...');

    // Check if Bluetooth is available
    const available = await RNBluetoothClassic.isBluetoothAvailable();
    if (!available) {
      console.warn('Bluetooth is not available on this device');
      return;
    }

    // Request permissions
    const hasPermissions = await BluetoothSerialService.requestPermissions();
    if (!hasPermissions) {
      console.warn('Bluetooth permissions not granted');
      return;
    }

    // Check if enabled
    const enabled = await BluetoothSerialService.isEnabled();
    if (!enabled) {
      console.warn('Bluetooth is not enabled');
      // Optionally prompt user to enable
      try {
        await RNBluetoothClassic.requestBluetoothEnabled();
      } catch (error) {
        console.error('User declined to enable Bluetooth');
      }
    }

    console.log('Bluetooth Serial service initialized');
  },

  // Stop service and cleanup
  stop: async (): Promise<void> => {
    console.log('Stopping Bluetooth Serial service...');
    await BluetoothSerialService.disconnect();
    clearAllTimers();
    globalMessageHandlers.length = 0; // Clear all handlers
    console.log('Bluetooth Serial service stopped');
  },
};

// React hook for Bluetooth Serial
export const useBluetoothSerial = () => {
  const [isConnected, setIsConnected] = useState(globalIsConnected);
  const [device, setDevice] = useState<BluetoothDevice | null>(globalDevice);
  const [messages, setMessages] = useState<ESPMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setErrorWithTimeout = (errorMessage: string) => {
    setError(errorMessage);
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
    errorTimeoutRef.current = trackedSetTimeout(() => {
      setError(null);
    }, 5000);
  };

  // Subscribe to messages
  useEffect(() => {
    const unsubscribe = BluetoothSerialService.subscribe(message => {
      setMessages(prev => [message, ...prev].slice(0, 50)); // Keep last 50 messages
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
  const scanDevices = async (): Promise<BluetoothDevice[]> => {
    try {
      setError(null);
      const hasPermissions = await BluetoothSerialService.requestPermissions();
      if (!hasPermissions) {
        setErrorWithTimeout('Bluetooth permissions not granted');
        return [];
      }

      const enabled = await BluetoothSerialService.isEnabled();
      if (!enabled) {
        setErrorWithTimeout('Bluetooth is not enabled');
        return [];
      }

      return await BluetoothSerialService.scanForDevices();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setErrorWithTimeout(`Scan error: ${errorMessage}`);
      return [];
    }
  };

  // Connect to device
  const connect = async (deviceAddress: string): Promise<boolean> => {
    try {
      setError(null);
      const success = await BluetoothSerialService.connect(deviceAddress);

      if (success) {
        setIsConnected(true);
        setDevice(globalDevice);

        // Save to settings
        await StorageService.saveSettings({
          pairedBluetoothDevice: deviceAddress,
        });
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
      await BluetoothSerialService.disconnect();
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
    scanDevices,
    connect,
    disconnect,
  };
};

export default BluetoothSerialService;
