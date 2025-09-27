import {useState, useEffect, useRef} from 'react';
import UDPSocket from 'react-native-udp';
import {Buffer} from 'buffer';
import StorageService from './storage';
import UDPMessageValidator from './udpValidator';
import Mutex from './udpMutex';

// Define types for ESP messages
export interface ESPMessage {
  deviceId: string;
  buttonId?: string; // Optional button ID for multi-button devices (ESP32)
  buttonPressed: boolean;
  timestamp: number;
  batteryLevel?: number;
  deviceType?: 'ESP8266' | 'ESP32'; // Auto-detected based on message format
}

// Global service state to prevent UI flickering
let globalIsListening = false;
let globalSocket: any = null;
let globalPort: number = 4210;
const globalMessageHandlers: ((message: ESPMessage) => void)[] = [];
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let isBindingOrClosing = false;

// Mutex for atomic operations
const udpMutex = new Mutex();

// Exponential backoff for reconnection
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_DELAY = 1000; // 1 second

const calculateBackoffDelay = (attempt: number): number => {
  return Math.min(BASE_DELAY * Math.pow(2, attempt), 30000); // Max 30 seconds
};

const resetReconnectAttempts = () => {
  reconnectAttempts = 0;
};

// Cleanup tracking for proper resource management
const activeTimeouts = new Set<ReturnType<typeof setTimeout>>();
const activeIntervals = new Set<ReturnType<typeof setInterval>>();

// Helper to track timeouts
const trackedSetTimeout = (callback: () => void, delay: number) => {
  const timeout = setTimeout(() => {
    activeTimeouts.delete(timeout);
    callback();
  }, delay);
  activeTimeouts.add(timeout);
  return timeout;
};

// Helper to track intervals
const trackedSetInterval = (callback: () => void, delay: number) => {
  const interval = setInterval(callback, delay);
  activeIntervals.add(interval);
  return interval;
};

// Clear all tracked timers
const clearAllTimers = () => {
  activeTimeouts.forEach(timeout => clearTimeout(timeout));
  activeIntervals.forEach(interval => clearInterval(interval));
  activeTimeouts.clear();
  activeIntervals.clear();
};

// Function to parse incoming UDP messages from ESP devices
const parseESPMessage = (message: Buffer): ESPMessage | null => {
  try {
    // Convert buffer to string
    const messageString = message.toString('utf8');
    console.log('Received UDP message:', messageString);

    // Check if the message follows the ESP format: "BUTTON:ID:STATE" or "BUTTON:DEVICE_BUTTON:STATE"
    if (messageString.startsWith('BUTTON:')) {
      const parts = messageString.split(':');

      if (parts.length >= 3) {
        const idPart = parts[1];
        const buttonState = parts[2] === '1'; // 1 = pressed, 0 = released

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
          console.log(`Detected ESP8266 device ${deviceId}`);
        }

        return {
          deviceId,
          buttonId,
          buttonPressed: buttonState,
          timestamp: Date.now(),
          batteryLevel: 1.0, // Default to 100% for now
          deviceType,
        };
      }
    }
    // Try JSON format as a fallback
    else {
      try {
        const data = JSON.parse(messageString);

        // Validate the required fields
        if (!data.deviceId || typeof data.buttonPressed !== 'boolean') {
          console.warn('Invalid message format:', messageString);
          return null;
        }

        return {
          deviceId: data.deviceId,
          buttonPressed: data.buttonPressed,
          timestamp: data.timestamp || Date.now(),
          batteryLevel: data.batteryLevel,
        };
      } catch (jsonError) {
        console.warn('Message is not in JSON format:', messageString);
        return null;
      }
    }

    console.warn('Unrecognized message format:', messageString);
    return null;
  } catch (error) {
    console.error('Failed to parse ESP message:', error);
    return null;
  }
};

// Helper function to safely close socket
const safelyCloseSocket = () => {
  if (globalSocket) {
    try {
      // Remove all listeners first to prevent callback errors
      globalSocket.removeAllListeners('error');
      globalSocket.removeAllListeners('message');
      globalSocket.close();
    } catch (err) {
      console.warn('Error while closing socket:', err);
    }
    globalSocket = null;
  }

  // Clear any pending reconnect timeout
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  // Clear all tracked timers
  clearAllTimers();
};

// Create a stable version of UDP listener hook that uses global state
export function useUDPListener() {
  const [messages, setMessages] = useState<ESPMessage[]>([]);
  const [isListening, setIsListening] = useState(globalIsListening);
  const [error, setError] = useState<string | null>(null);
  const [port, setPort] = useState<number>(globalPort);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load port from settings
  useEffect(() => {
    const loadPort = async () => {
      try {
        const settings = await StorageService.loadSettings();
        setPort(settings.udpPort);
        globalPort = settings.udpPort;
      } catch (err) {
        console.error('Failed to load UDP port setting:', err);
      }
    };

    loadPort();
  }, []);

  // Set error with automatic clearing after 5 seconds
  const setErrorWithTimeout = (errorMsg: string) => {
    setError(errorMsg);

    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }

    errorTimeoutRef.current = trackedSetTimeout(() => {
      setError(null);
    }, 5000);
  };

  // Sync with global state to reduce renders
  useEffect(() => {
    const syncIsListening = () => {
      if (globalIsListening !== isListening) {
        setIsListening(globalIsListening);
      }
    };

    const intervalId = trackedSetInterval(syncIsListening, 1000);

    return () => {
      clearInterval(intervalId);
      activeIntervals.delete(intervalId);
    };
  }, [isListening]);

  // Start the UDP listener
  const startListener = async () => {
    return udpMutex.runExclusive(async () => {
      // Don't allow multiple start operations
      if (globalIsListening) {
        console.log('Already listening');
        return;
      }

      try {
      // Clean up any existing socket first
      safelyCloseSocket();

      // Make sure we have the latest port setting
      const settings = await StorageService.loadSettings();
      globalPort = settings.udpPort;
      setPort(globalPort);

      const newSocket = UDPSocket.createSocket({type: 'udp4'});
      globalSocket = newSocket;

      newSocket.on('error', (err: Error) => {
        console.error('UDP Socket Error:', err);
        setErrorWithTimeout(`UDP Socket Error: ${err.message}`);
      });

      newSocket.on(
        'message',
        (msg: Buffer, rinfo: {address: string; port: number}) => {
          console.log(`Received message from ${rinfo.address}:${rinfo.port}`);
          const parsedMessage = parseESPMessage(msg);
          if (parsedMessage) {
            console.log('Parsed ESP message:', parsedMessage);
            setMessages(prev => [parsedMessage, ...prev].slice(0, 50)); // Keep last 50 messages

            // Notify all handlers
            globalMessageHandlers.forEach(handler => {
              try {
                handler(parsedMessage);
              } catch (handlerError) {
                console.error('Error in message handler:', handlerError);
              }
            });
          } else {
            console.warn('Failed to parse message');
          }
        },
      );

      newSocket.bind(globalPort, (err?: Error) => {
        if (err) {
          console.error(
            `Failed to bind UDP socket on port ${globalPort}:`,
            err,
          );
          setErrorWithTimeout(`Failed to bind UDP socket: ${err.message}`);
          safelyCloseSocket();
          globalIsListening = false;
          setIsListening(false);
        } else {
          console.log(`UDP server listening on port ${globalPort}`);
          globalIsListening = true;
          setIsListening(true);
          setError(null);
          resetReconnectAttempts();
        }
      });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('Failed to start UDP listener:', errorMessage);
        setErrorWithTimeout(`Failed to start UDP listener: ${errorMessage}`);
        safelyCloseSocket();
        globalIsListening = false;
        setIsListening(false);

        // Attempt exponential backoff reconnection
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const delay = calculateBackoffDelay(reconnectAttempts);
          reconnectAttempts++;
          console.log(`Attempting reconnection ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);

          trackedSetTimeout(async () => {
            await startListener();
          }, delay);
        }
      }
    });
  };

  // Function to stop the listener
  const stopListener = () => {
    udpMutex.runExclusive(async () => {
      if (!globalIsListening) {
        console.log('Not listening');
        return;
      }

      safelyCloseSocket();
      globalIsListening = false;
      setIsListening(false);
      resetReconnectAttempts();
    });
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  return {
    messages,
    isListening,
    error,
    port,
    startListener,
    stopListener,
  };
}

// Simplified UDP service singleton that uses the global state
export const UDPService = {
  initialize: async () => {
    if (isBindingOrClosing) {
      console.log('UDP operation already in progress');
      return;
    }

    isBindingOrClosing = true;

    try {
      // Clean up any existing socket first
      safelyCloseSocket();

      // Load the current port from settings
      const settings = await StorageService.loadSettings();
      globalPort = settings.udpPort;
      console.log(`Initializing UDP service on port ${globalPort}`);

      // Only start if not already listening
      if (!globalIsListening) {
        const newSocket = UDPSocket.createSocket({type: 'udp4'});
        globalSocket = newSocket;

        newSocket.on('error', (err: Error) => {
          console.error('UDP Service Error:', err);
        });

        newSocket.on(
          'message',
          (msg: Buffer, rinfo: {address: string; port: number}) => {
            console.log(
              `Service received message from ${rinfo.address}:${rinfo.port}`,
            );
            const parsedMessage = parseESPMessage(msg);
            if (parsedMessage) {
              console.log('Service parsed ESP message:', parsedMessage);
              // Notify all handlers
              globalMessageHandlers.forEach(handler => {
                try {
                  handler(parsedMessage);
                } catch (handlerError) {
                  console.error('Error in message handler:', handlerError);
                }
              });
            } else {
              console.warn('Service failed to parse message');
            }
          },
        );

        newSocket.bind(globalPort, (err?: Error) => {
          if (err) {
            console.error(
              `Failed to bind UDP service socket on port ${globalPort}:`,
              err,
            );
            safelyCloseSocket();
            globalIsListening = false;
          } else {
            console.log(`UDP service listening on port ${globalPort}`);
            globalIsListening = true;
          }

          isBindingOrClosing = false;
        });
      } else {
        console.log('UDP service already listening');
        isBindingOrClosing = false;
      }
    } catch (error) {
      console.error('Failed to initialize UDP service:', error);
      isBindingOrClosing = false;
    }
  },

  // Update UDP port and restart service
  updatePort: async (newPort: number) => {
    if (newPort === globalPort) {
      return; // No change needed
    }

    globalPort = newPort;

    // Restart service with new port
    await UDPService.stop();
    await UDPService.initialize();
  },

  subscribe: (handler: (message: ESPMessage) => void) => {
    globalMessageHandlers.push(handler);
    return () => {
      const index = globalMessageHandlers.indexOf(handler);
      if (index !== -1) {
        globalMessageHandlers.splice(index, 1);
      }
    };
  },

  stop: async () => {
    if (isBindingOrClosing) {
      console.log('UDP operation already in progress');
      return;
    }

    isBindingOrClosing = true;

    safelyCloseSocket();
    globalIsListening = false;

    trackedSetTimeout(() => {
      isBindingOrClosing = false;
    }, 300);
  },

  getCurrentPort: () => globalPort,
};

export default UDPService;
