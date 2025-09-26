/**
 * Comprehensive tests for AudioService
 */
import AudioService from '../../src/services/audio';
import RNFS from 'react-native-fs';

// Mock dependencies
jest.mock('react-native-fs');
jest.mock('react-native-audio-api', () => ({
  AudioContext: jest.fn().mockImplementation(() => ({
    createBufferSource: jest.fn().mockReturnValue({
      buffer: null,
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      onended: null,
    }),
    destination: {},
    decodeAudioData: jest.fn().mockResolvedValue({
      numberOfChannels: 2,
      length: 1000,
      duration: 1.0,
    }),
    close: jest.fn(),
  })),
  AudioBuffer: jest.fn(),
  AudioBufferSourceNode: jest.fn(),
}));

jest.mock('../../src/services/audioBufferCache');

const mockRNFS = RNFS as jest.Mocked<typeof RNFS>;

describe('AudioService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AudioService.cleanup();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      mockRNFS.exists.mockResolvedValue(true);

      const result = await AudioService.initialize();

      expect(result).toBe(true);
      expect(AudioService.isInitialized).toBe(true);
    });

    it('should create audio directory if it does not exist', async () => {
      mockRNFS.exists.mockResolvedValue(false);
      mockRNFS.mkdir.mockResolvedValue();

      await AudioService.initialize();

      expect(mockRNFS.mkdir).toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      mockRNFS.exists.mockRejectedValue(new Error('File system error'));

      const result = await AudioService.initialize();

      expect(result).toBe(false);
      expect(AudioService.isInitialized).toBe(false);
    });

    it('should not re-initialize if already initialized', async () => {
      AudioService.isInitialized = true;

      const result = await AudioService.initialize();

      expect(result).toBe(true);
      // Should not create new AudioContext
    });
  });

  describe('Audio File Management', () => {
    beforeEach(async () => {
      await AudioService.initialize();
    });

    it('should load audio files from metadata', async () => {
      const mockMetadata = [
        { id: '1', url: 'file://test1.mp3', title: 'Test 1' },
        { id: '2', url: 'file://test2.mp3', title: 'Test 2' },
      ];

      mockRNFS.exists.mockResolvedValue(true);
      mockRNFS.readFile.mockResolvedValue(JSON.stringify(mockMetadata));

      const files = await AudioService.loadAudioFiles();

      expect(files).toHaveLength(2);
      expect(files[0].title).toBe('Test 1');
    });

    it('should return empty array when no metadata file exists', async () => {
      mockRNFS.exists.mockResolvedValue(false);

      const files = await AudioService.loadAudioFiles();

      expect(files).toEqual([]);
    });

    it('should filter out non-existent files', async () => {
      const mockMetadata = [
        { id: '1', url: 'file://test1.mp3', title: 'Test 1' },
        { id: '2', url: 'file://test2.mp3', title: 'Test 2' },
      ];

      mockRNFS.exists
        .mockResolvedValueOnce(true) // metadata exists
        .mockResolvedValueOnce(true) // file 1 exists
        .mockResolvedValueOnce(false); // file 2 doesn't exist

      mockRNFS.readFile.mockResolvedValue(JSON.stringify(mockMetadata));

      const files = await AudioService.loadAudioFiles();

      expect(files).toHaveLength(1);
      expect(files[0].title).toBe('Test 1');
    });
  });

  describe('Audio Buffer Management', () => {
    beforeEach(async () => {
      await AudioService.initialize();
    });

    it('should load and cache audio buffers', async () => {
      const mockBuffer = { numberOfChannels: 2, length: 1000, duration: 1.0 };
      mockRNFS.readFile.mockResolvedValue('base64data');

      const buffer = await AudioService.loadAudioBuffer('file://test.mp3');

      expect(buffer).toBeDefined();
      expect(AudioService.audioBufferCache.set).toHaveBeenCalled();
    });

    it('should return cached buffer when available', async () => {
      const mockBuffer = { numberOfChannels: 2, length: 1000, duration: 1.0 };
      (AudioService.audioBufferCache.get as jest.Mock).mockReturnValue(mockBuffer);

      const buffer = await AudioService.loadAudioBuffer('file://test.mp3');

      expect(buffer).toBe(mockBuffer);
      expect(mockRNFS.readFile).not.toHaveBeenCalled();
    });

    it('should handle decode errors gracefully', async () => {
      mockRNFS.readFile.mockResolvedValue('base64data');
      (AudioService.audioContext as any).decodeAudioData.mockRejectedValue(new Error('Decode error'));

      const buffer = await AudioService.loadAudioBuffer('file://test.mp3');

      expect(buffer).toBeNull();
    });
  });

  describe('Audio Playback', () => {
    beforeEach(async () => {
      await AudioService.initialize();
    });

    it('should play audio for device when file is mapped', async () => {
      const mockFiles = [
        { id: '1', url: 'file://test.mp3', title: 'Test', deviceId: 'device1' }
      ];
      const mockBuffer = { numberOfChannels: 2, length: 1000 };

      jest.spyOn(AudioService, 'loadAudioFiles').mockResolvedValue(mockFiles);
      (AudioService.audioBufferCache.get as jest.Mock).mockReturnValue(mockBuffer);

      const result = await AudioService.playAudioForDevice('device1');

      expect(result).toBe(true);
      expect(AudioService.activeSounds.size).toBe(1);
    });

    it('should return false when no file is mapped to device', async () => {
      jest.spyOn(AudioService, 'loadAudioFiles').mockResolvedValue([]);

      const result = await AudioService.playAudioForDevice('device1');

      expect(result).toBe(false);
    });

    it('should stop existing device audio before playing new', async () => {
      const mockFiles = [
        { id: '1', url: 'file://test.mp3', title: 'Test', deviceId: 'device1' },
      ];
      const mockBuffer = { numberOfChannels: 2, length: 1000 };

      jest.spyOn(AudioService, 'loadAudioFiles').mockResolvedValue(mockFiles);
      (AudioService.audioBufferCache.get as jest.Mock).mockReturnValue(mockBuffer);
      const stopSpy = jest.spyOn(AudioService, 'stopDeviceAudio');

      await AudioService.playAudioForDevice('device1');

      expect(stopSpy).toHaveBeenCalledWith('device1');
    });
  });

  describe('Memory Management', () => {
    beforeEach(async () => {
      await AudioService.initialize();
    });

    it('should handle low memory warnings', () => {
      expect(() => AudioService.onLowMemory()).not.toThrow();
      expect(AudioService.audioBufferCache.onLowMemory).toHaveBeenCalled();
    });

    it('should provide cache statistics', () => {
      const mockStats = { entries: 5, sizeMB: 10, maxSizeMB: 50 };
      (AudioService.audioBufferCache.getStats as jest.Mock).mockReturnValue(mockStats);

      const stats = AudioService.getCacheStats();

      expect(stats).toEqual(mockStats);
    });

    it('should cleanup resources properly', () => {
      AudioService.cleanup();

      expect(AudioService.audioBufferCache.destroy).toHaveBeenCalled();
      expect(AudioService.isInitialized).toBe(false);
    });
  });

  describe('Error Recovery', () => {
    beforeEach(async () => {
      await AudioService.initialize();
    });

    it('should handle buffer loading failures gracefully', async () => {
      mockRNFS.readFile.mockRejectedValue(new Error('File read error'));

      const buffer = await AudioService.loadAudioBuffer('file://test.mp3');

      expect(buffer).toBeNull();
    });

    it('should continue working after audio context errors', async () => {
      // Simulate audio context error
      (AudioService.audioContext as any).decodeAudioData.mockRejectedValue(new Error('Context error'));

      // Should not crash and return null
      const buffer = await AudioService.loadAudioBuffer('file://test.mp3');
      expect(buffer).toBeNull();

      // Service should still be initialized
      expect(AudioService.isInitialized).toBe(true);
    });
  });

  describe('Device Status Tracking', () => {
    it('should track playing devices correctly', () => {
      // Mock active sounds
      AudioService.activeSounds.set('1', {
        id: '1',
        deviceId: 'device1',
        source: {} as any
      });
      AudioService.activeSounds.set('2', {
        id: '2',
        deviceId: 'device2',
        source: {} as any
      });

      const playingDevices = AudioService.getPlayingDevices();

      expect(playingDevices).toContain('device1');
      expect(playingDevices).toContain('device2');
    });

    it('should detect if specific device is playing', () => {
      AudioService.activeSounds.set('1', {
        id: '1',
        deviceId: 'device1',
        source: {} as any
      });

      expect(AudioService.isDevicePlaying('device1')).toBe(true);
      expect(AudioService.isDevicePlaying('device2')).toBe(false);
    });
  });
});