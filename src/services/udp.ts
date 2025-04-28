// src/services/udp.ts

import {useState, useEffect} from 'react';
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
  const [socket, setSocket] = useState<any>(null);
  const [port, setPort] = useState<number>(8888); // Default port

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

  // Start the UDP listener
  const startListener = async () => {
    try {
      // Make sure we have the latest port setting
      const settings = await StorageService.loadSettings();
      const udpPort = settings.udpPort;
      setPort(udpPort);

      // Clean up any existing socket
      if (socket) {
        socket.close();
      }

      const newSocket = UDPSocket.createSocket({type: 'udp4'});
      setSocket(newSocket);

      newSocket.on('error', (err: Error) => {
        console.error('UDP Socket Error:', err);
        setError(`UDP Socket Error: ${err.message}`);
        newSocket.close();
        setIsListening(false);
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
        if (err) {
          console.error(`Failed to bind UDP socket on port ${udpPort}:`, err);
          setError(`Failed to bind UDP socket: ${err.message}`);
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
      setError(`Failed to start UDP listener: ${errorMessage}`);
    }
  };

  // Function to manually stop the listener
  const stopListener = () => {
    if (socket) {
      socket.close();
      setSocket(null);
    }
    setIsListening(false);
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [socket]);

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

export const UDPService = {
  initialize: async () => {
    // Clean up any existing socket first
    if (udpSocket) {
      udpSocket.close();
      udpSocket = null;
    }

    try {
      // Load the current port from settings
      const settings = await StorageService.loadSettings();
      currentPort = settings.udpPort;

      udpSocket = UDPSocket.createSocket({type: 'udp4'});

      udpSocket.on('error', (err: Error) => {
        console.error('UDP Service Error:', err);
        UDPService.stop();
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
          return;
        }

        console.log(`UDP service listening on port ${currentPort}`);
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
    if (udpSocket) {
      udpSocket.close();
      udpSocket = null;
    }
  },

  getCurrentPort: () => currentPort,
};

export default UDPService;
