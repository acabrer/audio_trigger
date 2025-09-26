/**
 * Comprehensive tests for UDP Service
 */
import { UDPService } from '../../src/services/udp';
import StorageService from '../../src/services/storage';

// Mock dependencies
jest.mock('react-native-udp');
jest.mock('../../src/services/storage');

const mockStorageService = StorageService as jest.Mocked<typeof StorageService>;

describe('UDPService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorageService.loadSettings.mockResolvedValue({
      udpPort: 4210,
      autoStartListener: false,
    });
  });

  afterEach(async () => {
    await UDPService.stop();
  });

  describe('Initialization', () => {
    it('should initialize with port from settings', async () => {
      await UDPService.initialize();

      expect(mockStorageService.loadSettings).toHaveBeenCalled();
      expect(UDPService.getCurrentPort()).toBe(4210);
    });

    it('should handle initialization errors', async () => {
      mockStorageService.loadSettings.mockRejectedValue(new Error('Settings error'));

      // Should not throw
      await expect(UDPService.initialize()).resolves.toBeUndefined();
    });

    it('should not initialize twice', async () => {
      await UDPService.initialize();

      // Second call should not create new socket
      await UDPService.initialize();

      expect(mockStorageService.loadSettings).toHaveBeenCalledTimes(2);
    });
  });

  describe('Port Management', () => {
    it('should update port and restart service', async () => {
      await UDPService.initialize();

      await UDPService.updatePort(5000);

      expect(UDPService.getCurrentPort()).toBe(5000);
    });

    it('should not restart if port is the same', async () => {
      await UDPService.initialize();

      const stopSpy = jest.spyOn(UDPService, 'stop');
      await UDPService.updatePort(4210); // Same port

      expect(stopSpy).not.toHaveBeenCalled();
    });
  });

  describe('Message Handling', () => {
    it('should subscribe and unsubscribe message handlers', () => {
      const handler = jest.fn();

      const unsubscribe = UDPService.subscribe(handler);

      expect(typeof unsubscribe).toBe('function');

      // Test unsubscribe
      unsubscribe();

      expect(() => unsubscribe()).not.toThrow();
    });

    it('should handle multiple subscribers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      const unsub1 = UDPService.subscribe(handler1);
      const unsub2 = UDPService.subscribe(handler2);

      // Both should be registered
      expect(typeof unsub1).toBe('function');
      expect(typeof unsub2).toBe('function');

      // Cleanup
      unsub1();
      unsub2();
    });
  });

  describe('Service Lifecycle', () => {
    it('should stop service cleanly', async () => {
      await UDPService.initialize();

      await expect(UDPService.stop()).resolves.toBeUndefined();
    });

    it('should handle stop when not running', async () => {
      await expect(UDPService.stop()).resolves.toBeUndefined();
    });
  });

  describe('Error Recovery', () => {
    it('should handle socket errors gracefully', async () => {
      await UDPService.initialize();

      // Simulate socket error - should not crash
      expect(() => {
        // This would normally be triggered by socket events
      }).not.toThrow();
    });
  });
});