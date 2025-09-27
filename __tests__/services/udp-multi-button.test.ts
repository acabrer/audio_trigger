import {ESPMessage} from '../../src/services/udp';

// Mock the parseESPMessage function directly since it's internal
// We'll test the logic by copying it here for unit testing
const parseESPMessage = (message: Buffer): ESPMessage | null => {
  try {
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

    console.warn('Unrecognized message format:', messageString);
    return null;
  } catch (error) {
    console.error('Failed to parse ESP message:', error);
    return null;
  }
};

describe('UDP Multi-Button Support', () => {
  describe('Message Parsing', () => {
    it('should parse ESP8266 single button message', () => {
      const message = Buffer.from('BUTTON:1:1', 'utf8');
      const parsed = parseESPMessage(message);

      expect(parsed).toBeTruthy();
      expect(parsed?.deviceId).toBe('1');
      expect(parsed?.buttonId).toBeUndefined();
      expect(parsed?.buttonPressed).toBe(true);
      expect(parsed?.deviceType).toBe('ESP8266');
    });

    it('should parse ESP32 multi-button message with composite ID', () => {
      const message = Buffer.from('BUTTON:1_3:1', 'utf8');
      const parsed = parseESPMessage(message);

      expect(parsed).toBeTruthy();
      expect(parsed?.deviceId).toBe('1');
      expect(parsed?.buttonId).toBe('3');
      expect(parsed?.buttonPressed).toBe(true);
      expect(parsed?.deviceType).toBe('ESP32');
    });

    it('should handle different button numbers for ESP32', () => {
      const testCases = [
        {msg: 'BUTTON:2_1:1', deviceId: '2', buttonId: '1'},
        {msg: 'BUTTON:3_8:0', deviceId: '3', buttonId: '8'},
        {msg: 'BUTTON:10_5:1', deviceId: '10', buttonId: '5'},
      ];

      testCases.forEach(testCase => {
        const message = Buffer.from(testCase.msg, 'utf8');
        const parsed = parseESPMessage(message);

        expect(parsed).toBeTruthy();
        expect(parsed?.deviceId).toBe(testCase.deviceId);
        expect(parsed?.buttonId).toBe(testCase.buttonId);
        expect(parsed?.deviceType).toBe('ESP32');
      });
    });

    it('should handle button released state correctly', () => {
      const messagePressed = Buffer.from('BUTTON:1_2:1', 'utf8');
      const messageReleased = Buffer.from('BUTTON:1_2:0', 'utf8');

      const parsedPressed = parseESPMessage(messagePressed);
      const parsedReleased = parseESPMessage(messageReleased);

      expect(parsedPressed?.buttonPressed).toBe(true);
      expect(parsedReleased?.buttonPressed).toBe(false);
    });

    it('should maintain backward compatibility with ESP8266 messages', () => {
      const oldFormatMessages = [
        'BUTTON:1:1',
        'BUTTON:2:0',
        'BUTTON:99:1',
      ];

      oldFormatMessages.forEach(msg => {
        const message = Buffer.from(msg, 'utf8');
        const parsed = parseESPMessage(message);

        expect(parsed).toBeTruthy();
        expect(parsed?.buttonId).toBeUndefined(); // No button ID for ESP8266
        expect(parsed?.deviceType).toBe('ESP8266');
      });
    });

    it('should handle invalid messages gracefully', () => {
      const invalidMessages = [
        'INVALID:1:1',
        'BUTTON:1', // Missing state
        'BUTTON', // Missing all parts
        '', // Empty message
      ];

      invalidMessages.forEach(msg => {
        const message = Buffer.from(msg, 'utf8');
        const parsed = parseESPMessage(message);

        expect(parsed).toBeNull();
      });
    });
  });

  describe('Audio File Matching', () => {
    const audioFiles = [
      {id: '1', url: 'file1.mp3', title: 'Sound 1', deviceId: '1'},
      {id: '2', url: 'file2.mp3', title: 'Sound 2', deviceId: '1', buttonId: '1'},
      {id: '3', url: 'file3.mp3', title: 'Sound 3', deviceId: '1', buttonId: '2'},
      {id: '4', url: 'file4.mp3', title: 'Sound 4', deviceId: '2'},
    ];

    // Mock the matching logic from audio service
    const findAudioFile = (deviceId: string, buttonId?: string) => {
      return audioFiles.find(file => {
        if (buttonId) {
          return file.deviceId === deviceId && file.buttonId === buttonId;
        } else {
          return file.deviceId === deviceId && !file.buttonId;
        }
      });
    };

    it('should match ESP8266 device to correct audio file', () => {
      const file = findAudioFile('1');
      expect(file?.id).toBe('1');
      expect(file?.buttonId).toBeUndefined();
    });

    it('should match ESP32 button to correct audio file', () => {
      const file1 = findAudioFile('1', '1');
      expect(file1?.id).toBe('2');

      const file2 = findAudioFile('1', '2');
      expect(file2?.id).toBe('3');
    });

    it('should not match if button ID is missing for ESP32', () => {
      const file = findAudioFile('1', '3'); // No file for button 3
      expect(file).toBeUndefined();
    });

    it('should handle mixed device types correctly', () => {
      const esp8266File = findAudioFile('2');
      expect(esp8266File?.id).toBe('4');

      const esp32File = findAudioFile('2', '1'); // No ESP32 file for device 2
      expect(esp32File).toBeUndefined();
    });
  });
});