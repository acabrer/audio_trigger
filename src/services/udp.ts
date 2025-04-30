// src/services/udp.ts

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

// Function to parse incoming UDP messages from ESP devices
const parseESPMessage = (message: Buffer): ESPMessage | null => {
  try {
    // Parse the incoming message - adjust based on your ESP data format
    const messageString = message.toString('utf8');
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
  } catch (error) {
    console.error('Failed to parse ESP message:', error);
    return null;
  }
};

// UDP service hook for components to use
export function useUDPListener() {
  const [messages, setMessages] = useState<ESPMessage[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<any>(null);
  const [port, setPort] = useState<number>(8888); // Default port
  const isStartingRef = useRef<boolean>(false);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load port from settings
  useEffect(() => {
    const loadPort = async () => {
      try {
        const settings = await StorageService.loadSettings();
        setPort(settings.udpPort);
      } catch (err) {
        console.error('Failed to load UDP port setting:', err);
        // Keep using default port
      }
    };

    loadPort();
  }, []);

  // Helper function to safely close socket
  const safelyCloseSocket = () => {
    if (socketRef.current) {
      try {
        // Remove all listeners first to prevent callback errors
        socketRef.current.removeAllListeners('error');
        socketRef.current.removeAllListeners('message');
        socketRef.current.close();
      } catch (err) {
        console.warn('Error while closing socket:', err);
      }
      socketRef.current = null;
    }
  };

  // Set error with automatic clearing after 5 seconds
  const setErrorWithTimeout = (errorMsg: string) => {
    setError(errorMsg);

    // Clear any existing timeout
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }

    // Set new timeout to clear error after 5 seconds
    errorTimeoutRef.current = setTimeout(() => {
      setError(null);
    }, 5000);
  };

  // Start the UDP listener
  const startListener = async () => {
    // Prevent multiple simultaneous start attempts
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    try {
      // Clean up any existing socket first
      safelyCloseSocket();

      // Make sure we have the latest port setting
      const settings = await StorageService.loadSettings();
      const udpPort = settings.udpPort;
      setPort(udpPort);

      const newSocket = UDPSocket.createSocket({type: 'udp4'});
      socketRef.current = newSocket;

      newSocket.on('error', (err: Error) => {
        console.error('UDP Socket Error:', err);
        setErrorWithTimeout(`UDP Socket Error: ${err.message}`);

        // Don't close socket on every error, let's be more resilient
        // Only stop if we keep getting errors
        if (isListening) {
          // If we're already listening, this is a runtime error
          // Let's not close the socket immediately
        } else {
          // If we're not listening yet, this is a startup error
          safelyCloseSocket();
          setIsListening(false);
        }
      });

      newSocket.on(
        'message',
        (msg: Buffer, _rinfo: {address: string; port: number}) => {
          const parsedMessage = parseESPMessage(msg);
          if (parsedMessage) {
            console.log(
              `Message from ${_rinfo.address}:${_rinfo.port}`,
              parsedMessage,
            );
            setMessages(prev => [parsedMessage, ...prev].slice(0, 50)); // Keep last 50 messages
          }
        },
      );

      newSocket.bind(udpPort, (err?: Error) => {
        isStartingRef.current = false;

        if (err) {
          console.error(`Failed to bind UDP socket on port ${udpPort}:`, err);
          setErrorWithTimeout(`Failed to bind UDP socket: ${err.message}`);
          safelyCloseSocket();
          return;
        }

        console.log(`UDP server listening on port ${udpPort}`);
        setIsListening(true);
        setError(null);
      });

      return;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Failed to start UDP listener:', errorMessage);
      setErrorWithTimeout(`Failed to start UDP listener: ${errorMessage}`);
      safelyCloseSocket();
      isStartingRef.current = false;
    }
  };

  // Function to manually stop the listener
  const stopListener = () => {
    safelyCloseSocket();
    setIsListening(false);
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      safelyCloseSocket();
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

// Singleton UDP service for background listening
let udpSocket: any = null;
let currentPort: number = 8888; // Default port
const messageHandlers: ((message: ESPMessage) => void)[] = [];
let reconnectTimeout: NodeJS.Timeout | null = null;
let errorCount = 0;
const MAX_ERROR_COUNT = 5;
const ERROR_RESET_INTERVAL = 60000; // 1 minute
let errorResetInterval: NodeJS.Timeout | null = null;

// Helper function to safely close the UDP socket
const safelyCloseUDPSocket = () => {
  if (udpSocket) {
    try {
      // Remove all listeners first to prevent callback errors
      udpSocket.removeAllListeners('error');
      udpSocket.removeAllListeners('message');
      udpSocket.close();
    } catch (err) {
      console.warn('Error while closing UDP service socket:', err);
    }
    udpSocket = null;
  }

  // Clear any pending reconnect timeout
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
};

export const UDPService = {
  initialize: async () => {
    // Clean up any existing socket first
    safelyCloseUDPSocket();

    // Reset error count
    errorCount = 0;

    // Set up error reset interval
    if (errorResetInterval) {
      clearInterval(errorResetInterval);
    }

    errorResetInterval = setInterval(() => {
      errorCount = 0;
    }, ERROR_RESET_INTERVAL);

    try {
      // Load the current port from settings
      const settings = await StorageService.loadSettings();
      currentPort = settings.udpPort;

      udpSocket = UDPSocket.createSocket({type: 'udp4'});

      udpSocket.on('error', (err: Error) => {
        console.error('UDP Service Error:', err);

        // Increment error count
        errorCount++;

        // If we've hit too many errors, stop trying for a while
        if (errorCount >= MAX_ERROR_COUNT) {
          console.warn(
            `Too many UDP errors (${errorCount}), pausing for 30 seconds`,
          );
          UDPService.stop();

          // Try again after 30 seconds
          reconnectTimeout = setTimeout(() => {
            UDPService.initialize();
          }, 30000);

          return;
        }

        // For less severe error situations, don't necessarily stop
      });

      udpSocket.on(
        'message',
        (msg: Buffer, _rinfo: {address: string; port: number}) => {
          const parsedMessage = parseESPMessage(msg);
          if (parsedMessage) {
            // Notify all handlers
            messageHandlers.forEach(handler => handler(parsedMessage));
          }
        },
      );

      udpSocket.bind(currentPort, (err?: Error) => {
        if (err) {
          console.error(
            `Failed to bind UDP service socket on port ${currentPort}:`,
            err,
          );

          // Increment error count
          errorCount++;

          // If we've hit too many errors, stop trying for a while
          if (errorCount >= MAX_ERROR_COUNT) {
            console.warn(
              `Too many UDP binding errors (${errorCount}), pausing for 30 seconds`,
            );
            UDPService.stop();

            // Try again after 30 seconds
            reconnectTimeout = setTimeout(() => {
              UDPService.initialize();
            }, 30000);
          }

          return;
        }

        console.log(`UDP service listening on port ${currentPort}`);
        // Reset error count on successful bind
        errorCount = 0;
      });
    } catch (error) {
      console.error('Failed to initialize UDP service:', error);
    }
  },

  // Update UDP port and restart service
  updatePort: async (newPort: number) => {
    if (newPort === currentPort) {
      return; // No change needed
    }

    currentPort = newPort;

    // Restart service with new port
    await UDPService.stop();
    await UDPService.initialize();
  },

  subscribe: (handler: (message: ESPMessage) => void) => {
    messageHandlers.push(handler);
    return () => {
      const index = messageHandlers.indexOf(handler);
      if (index !== -1) {
        messageHandlers.splice(index, 1);
      }
    };
  },

  stop: async () => {
    safelyCloseUDPSocket();

    // Clear error reset interval
    if (errorResetInterval) {
      clearInterval(errorResetInterval);
      errorResetInterval = null;
    }
  },

  getCurrentPort: () => currentPort,
};

export default UDPService;
