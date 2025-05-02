import {useState, useEffect, useRef} from 'react';
import UDPSocket from 'react-native-udp';
import {Buffer} from 'buffer';
import StorageService from './storage';

// Define types for ESP messages
export interface ESPMessage {
  deviceId: string;
  buttonPressed: boolean;
  timestamp: number;
  batteryLevel?: number;
}

// Global service state to prevent UI flickering
let globalIsListening = false;
let globalSocket: any = null;
let globalPort: number = 4210;
const globalMessageHandlers: ((message: ESPMessage) => void)[] = [];
let reconnectTimeout: NodeJS.Timeout | null = null;
let isBindingOrClosing = false;

// Function to parse incoming UDP messages from ESP devices
const parseESPMessage = (message: Buffer): ESPMessage | null => {
  try {
    // Convert buffer to string
    const messageString = message.toString('utf8');
    console.log('Received UDP message:', messageString);

    // Check if the message follows the ESP8266 format: "BUTTON:ID:STATE"
    if (messageString.startsWith('BUTTON:')) {
      const parts = messageString.split(':');

      if (parts.length >= 3) {
        const deviceId = parts[1];
        const buttonState = parts[2] === '1'; // 1 = pressed, 0 = released

        return {
          deviceId,
          buttonPressed: buttonState,
          timestamp: Date.now(),
          // We don't have battery level in this format, could be added later
          batteryLevel: 1.0, // Default to 100% for now
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
};

// Create a stable version of UDP listener hook that uses global state
export function useUDPListener() {
  const [messages, setMessages] = useState<ESPMessage[]>([]);
  const [isListening, setIsListening] = useState(globalIsListening);
  const [error, setError] = useState<string | null>(null);
  const [port, setPort] = useState<number>(globalPort);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    errorTimeoutRef.current = setTimeout(() => {
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

    const intervalId = setInterval(syncIsListening, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isListening]);

  // Start the UDP listener
  const startListener = async () => {
    // Don't allow multiple start operations
    if (isBindingOrClosing || globalIsListening) {
      console.log('Already listening or operation in progress');
      return;
    }

    isBindingOrClosing = true;

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
        }

        isBindingOrClosing = false;
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Failed to start UDP listener:', errorMessage);
      setErrorWithTimeout(`Failed to start UDP listener: ${errorMessage}`);
      safelyCloseSocket();
      globalIsListening = false;
      setIsListening(false);
      isBindingOrClosing = false;
    }
  };

  // Function to stop the listener
  const stopListener = () => {
    // Don't allow multiple stop operations
    if (isBindingOrClosing || !globalIsListening) {
      console.log('Not listening or operation in progress');
      return;
    }

    isBindingOrClosing = true;

    safelyCloseSocket();
    globalIsListening = false;
    setIsListening(false);

    // Reset the binding flag after a small delay
    setTimeout(() => {
      isBindingOrClosing = false;
    }, 300);
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

    setTimeout(() => {
      isBindingOrClosing = false;
    }, 300);
  },

  getCurrentPort: () => globalPort,
};

export default UDPService;
