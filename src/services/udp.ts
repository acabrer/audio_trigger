// src/services/udp.ts

import {useState} from 'react';
import UDPSocket from 'react-native-udp';
import {Buffer} from 'buffer';

// Define types for ESP messages
export interface ESPMessage {
  deviceId: string;
  buttonPressed: boolean;
  timestamp: number;
  batteryLevel?: number;
}

// Define the port we'll listen on
const UDP_PORT = 8888;

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

  // Start the UDP listener
  const startListener = () => {
    try {
      const socket = UDPSocket.createSocket({type: 'udp4'});

      socket.on('error', (err: Error) => {
        console.error('UDP Socket Error:', err);
        setError(`UDP Socket Error: ${err.message}`);
        socket.close();
        setIsListening(false);
      });

      socket.on(
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

      socket.bind(UDP_PORT, (err?: Error) => {
        if (err) {
          console.error('Failed to bind UDP socket:', err);
          setError(`Failed to bind UDP socket: ${err.message}`);
          return;
        }

        console.log(`UDP server listening on port ${UDP_PORT}`);
        setIsListening(true);
        setError(null);
      });

      // Return cleanup function
      return () => {
        socket.close();
        setIsListening(false);
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Failed to start UDP listener:', errorMessage);
      setError(`Failed to start UDP listener: ${errorMessage}`);
      return () => {}; // Return empty cleanup on error
    }
  };

  // Function to manually stop the listener
  const stopListener = () => {
    // This is handled by the cleanup function returned by startListener
    // This function is mostly for UI control
    setIsListening(false);
  };

  return {
    messages,
    isListening,
    error,
    startListener,
    stopListener,
  };
}

// Singleton UDP service for background listening
let udpSocket: any = null;
const messageHandlers: ((message: ESPMessage) => void)[] = [];

export const UDPService = {
  initialize: () => {
    if (udpSocket) {
      return;
    }

    try {
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

      udpSocket.bind(UDP_PORT, (err?: Error) => {
        if (err) {
          console.error('Failed to bind UDP service socket:', err);
          return;
        }

        console.log(`UDP service listening on port ${UDP_PORT}`);
      });
    } catch (error) {
      console.error('Failed to initialize UDP service:', error);
    }
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

  stop: () => {
    if (udpSocket) {
      udpSocket.close();
      udpSocket = null;
    }
    messageHandlers.length = 0;
  },
};

export default UDPService;
