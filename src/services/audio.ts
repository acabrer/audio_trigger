// src/services/audio.ts (optimized but compatible)
import {
  AudioContext,
  AudioBufferSourceNode,
  AudioBuffer,
} from 'react-native-audio-api';
import RNFS from 'react-native-fs';
import AudioBufferCache from './audioBufferCache';
import LoopAudioService from './loopAudio';
import StreamingLoopService from './streamingLoop';
import {globalCircuitBreaker, globalHealthMonitor} from '../utils/errorRecovery';

// Memory threshold for routing decision (50MB decoded = ~12.5MB compressed MP3)
const MEMORY_THRESHOLD_MB = 50;

// ============== PERFORMANCE TRACKING ==============
// Professional performance analysis system for detecting bottlenecks
class PerformanceTracker {
  private metrics: Map<string, number[]> = new Map();

  track(key: string, value: number): void {
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    this.metrics.get(key)!.push(value);
  }

  getStats(key: string) {
    const values = this.metrics.get(key) || [];
    if (values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: values.reduce((a, b) => a + b) / values.length,
      p50: sorted[Math.floor(values.length * 0.5)],
      p95: sorted[Math.floor(values.length * 0.95)],
      p99: sorted[Math.floor(values.length * 0.99)],
    };
  }

  printReport(): void {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║       PERFORMANCE ANALYSIS REPORT              ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    const categories = {
      'Preload Metrics': ['preload_total_time', 'preload_io_time', 'preload_cache_insert', 'preload_total_per_file'],
      'Playback Metrics': ['playback_total', 'playback_file_lookup', 'playback_cache_lookup', 'playback_create_source', 'playback_start'],
      'Latency Metrics': ['latency_total'],
    };

    for (const [category, metricKeys] of Object.entries(categories)) {
      console.log(`\n📊 ${category}:`);
      console.log('─'.repeat(50));

      for (const key of metricKeys) {
        const stats = this.getStats(key);
        if (stats && stats.count > 0) {
          console.log(`\n  ${key}:`);
          console.log(`    Samples: ${stats.count}`);
          console.log(`    Min:     ${stats.min.toFixed(2)}ms`);
          console.log(`    Avg:     ${stats.avg.toFixed(2)}ms`);
          console.log(`    P50:     ${stats.p50.toFixed(2)}ms`);
          console.log(`    P95:     ${stats.p95.toFixed(2)}ms`);
          console.log(`    Max:     ${stats.max.toFixed(2)}ms`);
        }
      }
    }

    console.log('\n' + '═'.repeat(50) + '\n');
  }

  clear(): void {
    this.metrics.clear();
    console.log('🧹 Performance metrics cleared');
  }

  getSummary(): string {
    const latencyStats = this.getStats('latency_total');
    const lookupStats = this.getStats('playback_file_lookup');
    const preloadStats = this.getStats('preload_total_time');

    let summary = '📊 Performance Summary:\n';

    if (latencyStats) {
      summary += `  • Total Latency: ${latencyStats.avg.toFixed(1)}ms avg (${latencyStats.min.toFixed(1)}-${latencyStats.max.toFixed(1)}ms)\n`;
    }

    if (lookupStats) {
      summary += `  • File Lookup: ${lookupStats.avg.toFixed(2)}ms avg ${lookupStats.avg > 1 ? '⚠️ SLOW' : '✓'}\n`;
    }

    if (preloadStats) {
      summary += `  • Preload Time: ${preloadStats.avg.toFixed(0)}ms\n`;
    }

    return summary;
  }
}

const perfTracker = new PerformanceTracker();

// Define types for audio files
export interface AudioFile {
  id: string;
  url: string;
  title: string;
  deviceId?: string; // ESP device ID this audio is mapped to
  buttonId?: string; // Optional button ID for multi-button devices (ESP32)
  loopMode?: boolean; // New flag to indicate if this file should loop
}

// Interface for active sounds
interface ActiveSound {
  id: string;
  deviceId: string;
  source: AudioBufferSourceNode;
  isLooping?: boolean; // Flag to track if this sound is in loop mode
}

// Default directory for audio files
const AUDIO_DIRECTORY = `${RNFS.DocumentDirectoryPath}/audio_files`;

// Audio service for managing files and playback
export const AudioService = {
  // Store the AudioContext instance
  audioContext: null as AudioContext | null,

  // Audio buffer cache with LRU eviction and memory management
  audioBufferCache: new AudioBufferCache(200), // 200MB cache for trigger sounds

  // Store for active sounds - allows multiple sounds to play simultaneously
  activeSounds: new Map<string, ActiveSound>(),

  // Flag to track initialization state
  isInitialized: false,

  // Flag to track if system has been pre-warmed
  isPrewarmed: false,

  // Pre-warm the audio system for minimal latency
  // Eliminates cold-start penalty (5-8ms)
  prewarmAudioSystem: async (): Promise<boolean> => {
    try {
      if (AudioService.isPrewarmed) {
        console.log('[Prewarm] Audio system already pre-warmed');
        return true;
      }

      console.log('[Prewarm] Pre-warming audio system...');
      const startTime = Date.now();

      // Ensure audio service is initialized
      if (!AudioService.isInitialized) {
        await AudioService.initialize();
      }

      if (!AudioService.audioContext) {
        console.error('[Prewarm] Audio context not available');
        return false;
      }

      // Create and play a silent buffer to wake up audio hardware
      const ctx = AudioService.audioContext;
      const silentBuffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = silentBuffer;
      source.connect(ctx.destination);
      source.start(0);

      AudioService.isPrewarmed = true;
      const duration = Date.now() - startTime;
      console.log(`[Prewarm] ✅ Audio system pre-warmed in ${duration}ms`);

      return true;
    } catch (error) {
      console.error('[Prewarm] Failed to pre-warm audio system:', error);
      return false;
    }
  },

  // Preload and decode ALL audio files for instant playback
  // Moves 8-15ms decode time to app startup instead of button press
  // NOW WITH DETAILED PERFORMANCE INSTRUMENTATION
  preloadAllAudioFiles: async (): Promise<boolean> => {
    try {
      console.log('[Preload] Starting to preload all audio files...');
      const startTime = performance.now();

      // Ensure audio service is initialized
      if (!AudioService.isInitialized) {
        await AudioService.initialize();
      }

      // Load all audio file metadata
      const audioFiles = await AudioService.loadAudioFiles();

      if (audioFiles.length === 0) {
        console.log('[Preload] No audio files to preload');
        return true;
      }

      console.log(`[Preload] Found ${audioFiles.length} audio files to preload`);

      // Track individual file metrics for analysis
      const fileMetrics: any[] = [];

      // Preload all files in parallel with detailed timing
      const preloadPromises = audioFiles.map(async (file, index) => {
        try {
          const fileStart = performance.now();

          // Check if already cached
          if (AudioService.audioBufferCache.get(file.id)) {
            const cacheHitTime = performance.now() - fileStart;
            perfTracker.track('preload_cache_hit', cacheHitTime);
            console.log(`[Preload] ✓ ${file.title} (cached - ${cacheHitTime.toFixed(2)}ms)`);
            return true;
          }

          // Measure I/O + decode time
          const ioStart = performance.now();
          const buffer = await AudioService.loadAudioBuffer(file.url);
          const ioTime = performance.now() - ioStart;

          if (buffer) {
            // Measure cache insertion time
            const cacheStart = performance.now();
            AudioService.audioBufferCache.set(file.id, buffer);
            const cacheTime = performance.now() - cacheStart;

            const totalTime = performance.now() - fileStart;
            const bufferSize = (buffer.numberOfChannels * buffer.length * 4) / 1024; // KB

            // Track metrics
            perfTracker.track('preload_io_time', ioTime);
            perfTracker.track('preload_cache_insert', cacheTime);
            perfTracker.track('preload_total_per_file', totalTime);

            fileMetrics.push({
              '#': index + 1,
              File: file.title.substring(0, 20),
              'I/O (ms)': ioTime.toFixed(1),
              'Cache (ms)': cacheTime.toFixed(1),
              'Total (ms)': totalTime.toFixed(1),
              'Duration (ms)': (buffer.duration * 1000).toFixed(0),
              'Size (KB)': bufferSize.toFixed(0),
            });

            console.log(
              `[Preload] ✓ ${index + 1}/${audioFiles.length} ${file.title} | ` +
              `I/O: ${ioTime.toFixed(1)}ms | Cache: ${cacheTime.toFixed(1)}ms | ` +
              `Total: ${totalTime.toFixed(1)}ms`
            );
            return true;
          } else {
            console.warn(`[Preload] ✗ Failed to load ${file.title}`);
            return false;
          }
        } catch (error) {
          console.error(`[Preload] ✗ Error loading ${file.title}:`, error);
          return false;
        }
      });

      // Wait for all files to preload
      const results = await Promise.all(preloadPromises);
      const successCount = results.filter(r => r).length;
      const duration = performance.now() - startTime;

      // Track total preload time
      perfTracker.track('preload_total_time', duration);

      // Print detailed summary table
      console.log('\n╔════════════════════════════════════════════════╗');
      console.log('║           PRELOAD PERFORMANCE SUMMARY          ║');
      console.log('╚════════════════════════════════════════════════╝');
      console.table(fileMetrics);
      console.log(`\n✅ Preloaded ${successCount}/${audioFiles.length} files in ${duration.toFixed(0)}ms`);
      console.log('═'.repeat(50) + '\n');

      return successCount === audioFiles.length;
    } catch (error) {
      console.error('[Preload] Failed to preload audio files:', error);
      return false;
    }
  },

  // Initialize the audio service
  initialize: async () => {
    try {
      // Don't re-initialize if already initialized
      if (AudioService.isInitialized) {
        console.log('Audio service already initialized');
        return true;
      }

      // Create audio directory if it doesn't exist
      const dirExists = await RNFS.exists(AUDIO_DIRECTORY);
      if (!dirExists) {
        await RNFS.mkdir(AUDIO_DIRECTORY);
      }

      // Initialize the AudioContext
      if (!AudioService.audioContext) {
        AudioService.audioContext = new AudioContext();
      }

      console.log('Audio service initialized with react-native-audio-api');
      AudioService.isInitialized = true;

      // Register health check
      globalHealthMonitor.registerHealthCheck('audio', async () => {
        return AudioService.audioContext !== null && AudioService.isInitialized;
      });

      return true;
    } catch (error) {
      console.error('Failed to initialize audio service:', error);
      AudioService.isInitialized = false;
      return false;
    }
  },

  // Load and return all saved audio files
  loadAudioFiles: async (): Promise<AudioFile[]> => {
    try {
      // Ensure service is initialized
      if (!AudioService.isInitialized) {
        await AudioService.initialize();
      }

      // Check if directory exists
      const dirExists = await RNFS.exists(AUDIO_DIRECTORY);
      if (!dirExists) {
        await RNFS.mkdir(AUDIO_DIRECTORY);
        return [];
      }

      // Read audio files metadata from storage
      const metadataPath = `${AUDIO_DIRECTORY}/metadata.json`;
      const metadataExists = await RNFS.exists(metadataPath);

      if (!metadataExists) {
        // No metadata file, return empty array
        return [];
      }

      // Read and parse metadata
      const metadataContent = await RNFS.readFile(metadataPath, 'utf8');
      const audioFiles: AudioFile[] = JSON.parse(metadataContent);

      // Verify all files exist
      const validFiles = [];
      for (const file of audioFiles) {
        const filePath = file.url.replace('file://', '');
        const exists = await RNFS.exists(filePath);
        if (exists) {
          validFiles.push(file);
        }
      }

      // Only log when files are actually loaded (not on every poll)
      // Removed excessive logging that was causing 1000s of log entries
      return validFiles;
    } catch (error) {
      console.error('Failed to load audio files:', error);
      return [];
    }
  },

  // Add a new audio file
  addAudioFile: async (
    sourceUri: string,
    title: string,
    deviceId?: string,
  ): Promise<AudioFile | null> => {
    try {
      // Ensure service is initialized
      if (!AudioService.isInitialized) {
        await AudioService.initialize();
      }

      // Create directory if it doesn't exist
      const dirExists = await RNFS.exists(AUDIO_DIRECTORY);
      if (!dirExists) {
        await RNFS.mkdir(AUDIO_DIRECTORY);
      }

      // Handle different URI types (content://, file://, or direct paths)
      let cleanSourceUri = sourceUri;
      let isContentUri = false;

      console.log('Original source URI:', sourceUri);

      // Check if it's a content URI
      if (cleanSourceUri.startsWith('content://')) {
        isContentUri = true;
        console.log('Handling content URI');
      } else {
        // Handle URI encoding issues for file URIs
        if (cleanSourceUri.includes('%')) {
          try {
            cleanSourceUri = decodeURIComponent(cleanSourceUri);
          } catch (e) {
            console.warn('Could not decode URI, using as-is:', e);
          }
        }

        // Remove file:// prefix if present for source
        if (cleanSourceUri.startsWith('file://')) {
          cleanSourceUri = cleanSourceUri.substring(7);
        }
      }

      // Generate unique ID for the file (timestamp + random to prevent collisions in parallel processing)
      const fileId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Extract extension from title (preferred) or default to wav
      let extension = 'wav'; // default for audio files
      if (title && title.includes('.')) {
        const titleParts = title.split('.');
        extension = titleParts[titleParts.length - 1].toLowerCase();
        console.log('Extension from title:', extension);
      }

      // Validate extension - only allow audio formats
      const validExtensions = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'];
      if (!validExtensions.includes(extension)) {
        extension = 'wav'; // fallback to wav
      }

      const fileName = `${fileId}.${extension}`;
      const destinationPath = `${AUDIO_DIRECTORY}/${fileName}`;

      console.log('Destination path:', destinationPath);

      // For content URIs, we can directly copy without existence check
      // For file URIs, verify source file exists
      if (!isContentUri) {
        const sourceExists = await RNFS.exists(cleanSourceUri);
        if (!sourceExists) {
          throw new Error(`Source file does not exist: ${cleanSourceUri}`);
        }
      }

      // Copy file to app storage
      // RNFS can handle both content:// and file:// URIs
      await RNFS.copyFile(sourceUri, destinationPath); // Use original URI for copy

      // Create audio file metadata
      const newFile: AudioFile = {
        id: fileId,
        url: `file://${destinationPath}`,
        title,
        deviceId,
        loopMode: false, // Default to not looping
      };

      // Load existing metadata
      const existingFiles = await AudioService.loadAudioFiles();

      // Add new file to metadata
      const updatedFiles = [...existingFiles, newFile];

      // Save updated metadata
      const metadataPath = `${AUDIO_DIRECTORY}/metadata.json`;
      await RNFS.writeFile(metadataPath, JSON.stringify(updatedFiles), 'utf8');
      console.log('Added new audio file:', newFile);

      return newFile;
    } catch (error) {
      console.error('Failed to add audio file:', error);
      return null;
    }
  },

  // Delete an audio file
  deleteAudioFile: async (fileId: string): Promise<boolean> => {
    try {
      // Load existing metadata
      const existingFiles = await AudioService.loadAudioFiles();

      // Find file to delete
      const fileToDelete = existingFiles.find(file => file.id === fileId);
      if (!fileToDelete) {
        return false;
      }

      // Stop playback if this file is currently playing
      AudioService.stopSound(fileId);

      // Remove file from filesystem
      const filePath = fileToDelete.url.replace('file://', '');
      if (await RNFS.exists(filePath)) {
        await RNFS.unlink(filePath);
      }

      // Remove buffer from cache
      AudioService.audioBufferCache.delete(fileId);

      // Update metadata
      const updatedFiles = existingFiles.filter(file => file.id !== fileId);
      const metadataPath = `${AUDIO_DIRECTORY}/metadata.json`;
      await RNFS.writeFile(metadataPath, JSON.stringify(updatedFiles), 'utf8');

      return true;
    } catch (error) {
      console.error('Failed to delete audio file:', error);
      return false;
    }
  },

  // Associate an audio file with an ESP device
  mapFileToDevice: async (
    fileId: string,
    deviceId: string,
  ): Promise<boolean> => {
    try {
      // Load existing metadata
      const existingFiles = await AudioService.loadAudioFiles();

      // Check if any other file is already mapped to this device
      const previouslyMappedIndex = existingFiles.findIndex(
        file => file.deviceId === deviceId && file.id !== fileId,
      );

      // Find and update the file we want to map
      const fileToMapIndex = existingFiles.findIndex(
        file => file.id === fileId,
      );

      if (fileToMapIndex === -1) {
        console.error('File not found for mapping:', fileId);
        return false;
      }

      // Create a new array with the updates
      const updatedFiles = [...existingFiles];

      // If another file was mapped to this device, clear its mapping
      if (previouslyMappedIndex !== -1) {
        console.log(
          'Removing previous device mapping from file:',
          updatedFiles[previouslyMappedIndex].title,
        );
        updatedFiles[previouslyMappedIndex] = {
          ...updatedFiles[previouslyMappedIndex],
          deviceId: undefined,
        };
      }

      // Update the target file with the new device ID
      updatedFiles[fileToMapIndex] = {
        ...updatedFiles[fileToMapIndex],
        deviceId,
      };

      console.log(
        'Mapped file to device:',
        updatedFiles[fileToMapIndex].title,
        'to device:',
        deviceId,
      );

      // Save updated metadata
      const metadataPath = `${AUDIO_DIRECTORY}/metadata.json`;
      await RNFS.writeFile(metadataPath, JSON.stringify(updatedFiles), 'utf8');

      return true;
    } catch (error) {
      console.error('Failed to map file to device:', error);
      return false;
    }
  },

  // Map a file to a specific device button (ESP32 support)
  mapFileToDeviceButton: async (
    fileId: string,
    deviceId: string,
    buttonId: string
  ): Promise<boolean> => {
    try {
      // Ensure service is initialized
      if (!AudioService.isInitialized) {
        await AudioService.initialize();
      }

      // Load existing files
      const existingFiles = await AudioService.loadAudioFiles();

      // Check if any other file is already mapped to this device+button combination
      const previouslyMappedIndex = existingFiles.findIndex(
        file => file.deviceId === deviceId && file.buttonId === buttonId && file.id !== fileId
      );

      // Find and update the file we want to map
      const fileToMapIndex = existingFiles.findIndex(file => file.id === fileId);

      if (fileToMapIndex === -1) {
        console.error('File not found for mapping:', fileId);
        return false;
      }

      // Create a new array with the updates
      const updatedFiles = [...existingFiles];

      // If another file was mapped to this device+button, clear its mapping
      if (previouslyMappedIndex !== -1) {
        console.log(
          'Removing previous device+button mapping from file:',
          updatedFiles[previouslyMappedIndex].title
        );
        updatedFiles[previouslyMappedIndex] = {
          ...updatedFiles[previouslyMappedIndex],
          deviceId: undefined,
          buttonId: undefined,
        };
      }

      // Update the target file with the new device ID and button ID
      updatedFiles[fileToMapIndex] = {
        ...updatedFiles[fileToMapIndex],
        deviceId,
        buttonId,
      };

      console.log(
        'Mapped file to device+button:',
        updatedFiles[fileToMapIndex].title,
        'to device:',
        deviceId,
        'button:',
        buttonId
      );

      // Save updated metadata
      const metadataPath = `${AUDIO_DIRECTORY}/metadata.json`;
      await RNFS.writeFile(metadataPath, JSON.stringify(updatedFiles), 'utf8');

      return true;
    } catch (error) {
      console.error('Failed to map file to device button:', error);
      return false;
    }
  },

  // Load and decode an audio file with better error handling
  // Uses native decodeAudioDataSource for optimal performance on both small and large files
  loadAudioBuffer: async (fileUrl: string): Promise<AudioBuffer | null> => {
    const startTime = performance.now();
    console.log(`[LOAD] Starting audio load for: ${fileUrl}`);

    try {
      return await globalCircuitBreaker.execute(async () => {
        // Ensure service is initialized
        if (!AudioService.isInitialized) {
          console.log('[LOAD] Audio service not initialized, initializing...');
          await AudioService.initialize();
        }

        if (!AudioService.audioContext) {
          console.error('[LOAD] ❌ Audio context is not initialized');
          return null;
        }

        const ctx = AudioService.audioContext;

        // Convert file:// URL to a usable format
        const filePath = fileUrl.replace('file://', '');
        console.log(`[LOAD] File path: ${filePath}`);

        // Check if file exists
        const fileExists = await RNFS.exists(filePath);
        if (!fileExists) {
          console.error(`[LOAD] ❌ File does not exist: ${filePath}`);
          return null;
        }

        // Get file stats
        const fileStats = await RNFS.stat(filePath);
        const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
        console.log(`[LOAD] File size: ${fileSizeMB}MB`);

        // Use decodeAudioDataSource for efficient native decoding
        try {
          console.log(`[LOAD] Calling decodeAudioDataSource for ${fileSizeMB}MB file...`);
          const decodeStart = performance.now();
          const audioBuffer = await ctx.decodeAudioDataSource(filePath);
          const decodeTime = performance.now() - decodeStart;

          const durationMin = (audioBuffer.duration / 60).toFixed(1);
          const channels = audioBuffer.numberOfChannels;
          const sampleRate = audioBuffer.sampleRate;
          const decodedSizeMB = ((channels * audioBuffer.length * 4) / (1024 * 1024)).toFixed(1);

          console.log(`[LOAD] ✅ Decode SUCCESS in ${decodeTime.toFixed(0)}ms`);
          console.log(`[LOAD]    Duration: ${durationMin} min, Channels: ${channels}, Rate: ${sampleRate}Hz`);
          console.log(`[LOAD]    Decoded buffer size: ${decodedSizeMB}MB`);

          return audioBuffer;
        } catch (decodeError) {
          const totalTime = performance.now() - startTime;
          console.error(`[LOAD] ❌ DECODE FAILED after ${totalTime.toFixed(0)}ms:`, decodeError);
          console.error(`[LOAD] Error details:`, JSON.stringify(decodeError, null, 2));
          return null;
        }
      });
    } catch (error) {
      const totalTime = performance.now() - startTime;
      console.error(`[LOAD] ❌ LOAD FAILED after ${totalTime.toFixed(0)}ms:`, error);
      console.error(`[LOAD] Error details:`, JSON.stringify(error, null, 2));
      return null;
    }
  },

  // Find and play audio for an ESP device - OPTIMIZED & INSTRUMENTED
  playAudioForDevice: async (
    deviceId: string,
    audioFiles?: AudioFile[],
    buttonId?: string,
    messageReceivedTime?: number,
    espTimestamp?: number
  ): Promise<boolean> => {
    const perfStart = performance.now();
    try {
      // ===== CHECKPOINT 1: Initialization Check =====
      const checkpoint1 = performance.now();
      if (!AudioService.isInitialized || !AudioService.audioContext) {
        console.error('Audio context is not initialized');
        perfTracker.track('playback_error', performance.now() - perfStart);
        return false;
      }
      const ctx = AudioService.audioContext;
      const initCheckTime = performance.now() - checkpoint1;
      perfTracker.track('playback_init_check', initCheckTime);

      // ===== CHECKPOINT 2: File Array Access =====
      const checkpoint2 = performance.now();
      const files = audioFiles || await AudioService.loadAudioFiles();
      const fileAccessTime = performance.now() - checkpoint2;
      perfTracker.track('playback_file_access', fileAccessTime);

      // ===== CHECKPOINT 3: File Lookup (LINEAR SEARCH - POTENTIAL BOTTLENECK) =====
      const checkpoint3 = performance.now();
      const audioFile = files.find(file => {
        if (buttonId) {
          // ESP32: must match both device and button
          return file.deviceId === deviceId && file.buttonId === buttonId;
        } else {
          // ESP8266: match device only (and ensure no buttonId is set for backward compatibility)
          return file.deviceId === deviceId && !file.buttonId;
        }
      });
      const fileLookupTime = performance.now() - checkpoint3;
      perfTracker.track('playback_file_lookup', fileLookupTime);

      if (!audioFile) {
        perfTracker.track('playback_file_not_found', performance.now() - perfStart);
        if (buttonId) {
          console.log(`No audio file mapped to device ${deviceId}, button ${buttonId}`);
        } else {
          console.log(`No audio file mapped to device ${deviceId}`);
        }
        return false;
      }

      // Check if this file is currently looping - don't interrupt it!
      const activeSound = AudioService.activeSounds.get(audioFile.id);
      if (activeSound?.isLooping) {
        console.log(`⚠️ Skipping device trigger for ${audioFile.title} - currently looping as background track`);
        return false;  // Don't interrupt the loop
      }

      // ===== CHECKPOINT 4: Cache Lookup =====
      const checkpoint4 = performance.now();
      const buffer = AudioService.audioBufferCache.get(audioFile.id);
      const cacheLookupTime = performance.now() - checkpoint4;
      perfTracker.track('playback_cache_lookup', cacheLookupTime);

      if (!buffer) {
        // SLOW PATH: Cache miss
        perfTracker.track('playback_cache_miss', performance.now() - perfStart);
        console.warn(`[SLOW PATH] Cache miss for ${audioFile.title} - loading from disk`);
        const loadedBuffer = await AudioService.loadAudioBuffer(audioFile.url);
        if (loadedBuffer) {
          AudioService.audioBufferCache.set(audioFile.id, loadedBuffer);
          return AudioService.playAudioForDevice(deviceId, audioFiles, buttonId, messageReceivedTime, espTimestamp);
        } else {
          console.error('Failed to load audio buffer');
          return false;
        }
      }

      // ===== CHECKPOINT 5: Stop Existing Sound =====
      const checkpoint5 = performance.now();
      const soundKey = buttonId ? `${deviceId}_${buttonId}` : deviceId;
      const existingSound = AudioService.activeSounds.get(soundKey);
      if (existingSound) {
        try {
          existingSound.source.stop(0);
          existingSound.source.disconnect(); // PHASE 1: Explicit disconnect
        } catch (e) {
          // Ignore if already stopped
        }
        AudioService.activeSounds.delete(soundKey);
      }
      const stopExistingTime = performance.now() - checkpoint5;
      perfTracker.track('playback_stop_existing', stopExistingTime);

      // ===== CHECKPOINT 6: Create Audio Source =====
      // PHASE 1: Wrap in try-catch for release build robustness
      let source: AudioBufferSourceNode;
      let createSourceTime: number;
      let startPlaybackTime: number;
      let audioStartTime: number;

      try {
        const checkpoint6 = performance.now();
        source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        createSourceTime = performance.now() - checkpoint6;
        perfTracker.track('playback_create_source', createSourceTime);

        // ===== CHECKPOINT 7: Start Playback =====
        const checkpoint7 = performance.now();
        audioStartTime = Date.now();
        source.start(0);
        startPlaybackTime = performance.now() - checkpoint7;
        perfTracker.track('playback_start', startPlaybackTime);
      } catch (audioError) {
        console.error('❌ Audio playback error (source creation/start failed):', audioError);
        // PHASE 1: Cleanup on error
        if (source!) {
          try {
            source.disconnect();
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        perfTracker.track('playback_error', performance.now() - perfStart);
        return false;
      }

      // Calculate total processing time
      const perfEnd = performance.now();
      const processingTime = perfEnd - perfStart;
      perfTracker.track('playback_total', processingTime);

      // Log detailed latency breakdown
      if (messageReceivedTime) {
        const totalLatency = audioStartTime - messageReceivedTime;
        perfTracker.track('latency_total', totalLatency);

        console.log(
          `🎵 LATENCY BREAKDOWN:\n` +
          `   Total: ${totalLatency}ms | Processing: ${processingTime.toFixed(2)}ms\n` +
          `   ├─ Init check:     ${initCheckTime.toFixed(3)}ms\n` +
          `   ├─ File access:    ${fileAccessTime.toFixed(3)}ms\n` +
          `   ├─ File lookup:    ${fileLookupTime.toFixed(3)}ms ${fileLookupTime > 1 ? '⚠️' : '✓'}\n` +
          `   ├─ Cache lookup:   ${cacheLookupTime.toFixed(3)}ms\n` +
          `   ├─ Stop existing:  ${stopExistingTime.toFixed(3)}ms\n` +
          `   ├─ Create source:  ${createSourceTime.toFixed(3)}ms\n` +
          `   └─ Start playback: ${startPlaybackTime.toFixed(3)}ms` +
          (espTimestamp ? `\n   ESP timestamp: ${espTimestamp}ms` : '')
        );
      } else {
        console.log(`🎵 Processing: ${processingTime.toFixed(2)}ms (cache hit)`);
      }

      // Store the sound source with unique key
      AudioService.activeSounds.set(soundKey, {
        id: soundKey,
        deviceId,
        source,
      });

      // PHASE 1: Enhanced automatic cleanup when sound ends
      source.onended = () => {
        try {
          // Disconnect from audio graph to free resources
          source.disconnect();
        } catch (e) {
          // Ignore if already disconnected
        }
        // Remove from active sounds tracking
        if (AudioService.activeSounds.has(soundKey)) {
          AudioService.activeSounds.delete(soundKey);
        }
      };

      return true;
    } catch (error) {
      console.error('Failed to play audio for device:', error);
      perfTracker.track('playback_error', performance.now() - perfStart);
      return false;
    }
  },

  // Play a specific audio file by ID (for preview/testing)
  playAudioFile: async (fileId: string): Promise<boolean> => {
    try {
      if (!AudioService.isInitialized || !AudioService.audioContext) {
        console.error('Audio context is not initialized');
        return false;
      }

      const ctx = AudioService.audioContext;

      // Load audio files
      const audioFiles = await AudioService.loadAudioFiles();
      const file = audioFiles.find(f => f.id === fileId);

      if (!file) {
        console.error('Audio file not found:', fileId);
        return false;
      }

      console.log(`Playing preview of: ${file.title}`);

      // Get or load buffer
      let buffer = AudioService.audioBufferCache.get(fileId);
      if (!buffer) {
        console.log(`Loading buffer for ${file.title} (large files may take time)...`);
        const loadStart = performance.now();
        const loadedBuffer = await AudioService.loadAudioBuffer(file.url);
        const loadTime = performance.now() - loadStart;
        console.log(`Buffer loaded in ${loadTime.toFixed(0)}ms`);

        buffer = loadedBuffer ?? undefined;
        if (buffer) {
          const durationMinutes = (buffer.duration / 60).toFixed(1);
          console.log(`Duration: ${durationMinutes} minutes`);
          AudioService.audioBufferCache.set(fileId, buffer);
        } else {
          console.error('Failed to load audio buffer');
          return false;
        }
      } else {
        console.log(`Using cached buffer for ${file.title}`);
      }

      // Stop any existing playback of this file
      AudioService.stopSound(fileId);

      // Create source node for ONE-TIME playback (no loop)
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.loop = false;  // Explicitly no looping
      source.start(0);

      // Store the sound source
      AudioService.activeSounds.set(fileId, {
        id: fileId,
        deviceId: 'preview',  // Special marker for preview playback
        source,
        isLooping: false,
      });

      // Auto-cleanup when done
      source.onended = () => {
        try {
          source.disconnect();
        } catch (e) {
          // Ignore
        }
        AudioService.activeSounds.delete(fileId);
      };

      console.log(`✓ Preview playback started for: ${file.title}`);
      return true;
    } catch (error) {
      console.error('Failed to play audio file:', error);
      return false;
    }
  },

  // Start loop playback with intelligent routing based on file size
  startLoopPlayback: async (fileId: string): Promise<boolean> => {
    try {
      console.log(`\n[AudioService] ========== START LOOP PLAYBACK ==========`);
      console.log(`[AudioService] File ID: ${fileId}`);

      // Load audio files metadata
      const audioFiles = await AudioService.loadAudioFiles();
      const file = audioFiles.find(f => f.id === fileId);

      if (!file) {
        console.error(`[AudioService] Audio file not found: ${fileId}`);
        return false;
      }

      // Get file size to determine routing
      const filePath = file.url.replace('file://', '');
      const fileStats = await RNFS.stat(filePath);
      const fileSizeMB = fileStats.size / (1024 * 1024);

      // Estimate decoded size (PCM is ~10x compressed MP3/WAV size)
      const estimatedDecodedMB = fileSizeMB * 10;

      console.log(`[AudioService] File size: ${fileSizeMB.toFixed(2)}MB`);
      console.log(`[AudioService] Estimated decoded: ${estimatedDecodedMB.toFixed(1)}MB`);

      let success = false;

      // Route to appropriate playback engine
      if (estimatedDecodedMB > MEMORY_THRESHOLD_MB) {
        // LARGE FILE: Use streaming (react-native-video)
        console.log(`[AudioService] 📡 Routing to STREAMING (file exceeds ${MEMORY_THRESHOLD_MB}MB threshold)`);

        success = await StreamingLoopService.startLoopPlayback({
          id: file.id,
          url: file.url,
          title: file.title,
        });

      } else {
        // SMALL FILE: Use in-memory buffering (react-native-audio-api)
        console.log(`[AudioService] 🎵 Routing to IN-MEMORY (file under ${MEMORY_THRESHOLD_MB}MB threshold)`);

        success = await LoopAudioService.startLoopPlayback(
          {
            id: file.id,
            url: file.url,
            title: file.title,
          },
          AudioService.audioContext || undefined
        );
      }

      if (success) {
        // Update the file's loop mode status in metadata
        const updatedFiles = audioFiles.map(f =>
          f.id === fileId ? {...f, loopMode: true} : f,
        );

        const metadataPath = `${AUDIO_DIRECTORY}/metadata.json`;
        await RNFS.writeFile(metadataPath, JSON.stringify(updatedFiles), 'utf8');

        console.log(`[AudioService] ✅ Loop playback started successfully`);
      } else {
        console.error(`[AudioService] ❌ Loop playback failed to start`);
      }

      console.log(`[AudioService] ========== LOOP PLAYBACK COMPLETE ==========\n`);
      return success;

    } catch (error) {
      console.error('[AudioService] Failed to start loop playback:', error);
      return false;
    }
  },

  // Stop loop playback (stops both streaming and in-memory)
  stopLoopPlayback: async (fileId: string): Promise<boolean> => {
    try {
      console.log(`\n[AudioService] ========== STOP LOOP PLAYBACK ==========`);
      console.log(`[AudioService] File ID: ${fileId}`);

      // Stop both services (only active one will actually stop)
      await Promise.all([
        LoopAudioService.stopLoopPlayback(),
        StreamingLoopService.stopLoopPlayback(),
      ]);

      // Load audio files
      const audioFiles = await AudioService.loadAudioFiles();

      // Update the file's loop mode status
      const updatedFiles = audioFiles.map(f =>
        f.id === fileId ? {...f, loopMode: false} : f,
      );

      // Save updated metadata
      const metadataPath = `${AUDIO_DIRECTORY}/metadata.json`;
      await RNFS.writeFile(metadataPath, JSON.stringify(updatedFiles), 'utf8');

      console.log(`[AudioService] ✅ Loop playback stopped`);
      console.log(`[AudioService] ========== STOP COMPLETE ==========\n`);

      return true;
    } catch (error) {
      console.error('[AudioService] Failed to stop loop playback:', error);
      return false;
    }
  },

  // Get all files currently playing in loop mode
  getLoopingFiles: async (): Promise<AudioFile[]> => {
    try {
      const audioFiles = await AudioService.loadAudioFiles();
      const loopingFiles: AudioFile[] = [];

      for (const file of audioFiles) {
        const isPlaying = AudioService.isDevicePlaying(file.id);
        const activeSound = AudioService.activeSounds.get(file.id);

        if (isPlaying && activeSound?.isLooping) {
          loopingFiles.push(file);
        }
      }

      return loopingFiles;
    } catch (error) {
      console.error('Failed to get looping files:', error);
      return [];
    }
  },

  // Stop a specific sound with better error handling
  // PHASE 1: Enhanced with explicit disconnect()
  stopSound: (fileId: string): void => {
    try {
      const activeSound = AudioService.activeSounds.get(fileId);
      if (activeSound) {
        try {
          activeSound.source.stop(0);
          activeSound.source.disconnect(); // PHASE 1: Explicit disconnect
        } catch (stopError) {
          console.warn(`Error stopping sound ${fileId}:`, stopError);
        } finally {
          AudioService.activeSounds.delete(fileId);
        }
      }
    } catch (error) {
      console.error(`Failed to stop sound ${fileId}:`, error);
      // Still remove from active sounds even if there was an error
      AudioService.activeSounds.delete(fileId);
    }
  },

  // Stop all sounds for a specific device with better error handling
  stopDeviceAudio: (deviceId: string): void => {
    try {
      // Get all active sounds first to avoid modification during iteration
      const soundsToStop = [];

      for (const [fileId, sound] of AudioService.activeSounds.entries()) {
        if (sound.deviceId === deviceId) {
          soundsToStop.push(fileId);
        }
      }

      // Now stop each sound
      for (const fileId of soundsToStop) {
        AudioService.stopSound(fileId);
      }
    } catch (error) {
      console.error(`Failed to stop device audio for ${deviceId}:`, error);
    }
  },

  // Stop all playback with improved error handling
  stopPlayback: async (): Promise<void> => {
    try {
      console.log(
        `Stopping all audio playback, active sounds: ${AudioService.activeSounds.size}`,
      );

      // Create a new array from the entries to avoid modification during iteration
      const activeSoundsEntries = Array.from(AudioService.activeSounds.keys());

      // Stop all active sounds
      for (const fileId of activeSoundsEntries) {
        AudioService.stopSound(fileId);
      }

      // Double check that all sounds were stopped
      if (AudioService.activeSounds.size > 0) {
        console.warn(
          `There are still ${AudioService.activeSounds.size} sounds in the active sounds map after stopping all. Clearing anyway.`,
        );
        AudioService.activeSounds.clear();
      }

      console.log('All audio playback stopped');
    } catch (error) {
      console.error('Failed to stop playback:', error);
      // Force clear all active sounds as a last resort
      AudioService.activeSounds.clear();
    }
  },

  // Stop all looping audio files
  stopAllLoops: async (): Promise<void> => {
    try {
      // Get all files playing in loop mode
      const loopingFiles = await AudioService.getLoopingFiles();

      // Stop each one
      for (const file of loopingFiles) {
        await AudioService.stopLoopPlayback(file.id);
      }

      console.log('All loop playback stopped');
    } catch (error) {
      console.error('Failed to stop all loops:', error);
    }
  },

  // Check if any audio is playing
  isPlaying: (): boolean => {
    return AudioService.activeSounds.size > 0;
  },

  // Check if a specific device's audio is playing
  isDevicePlaying: (deviceId: string): boolean => {
    for (const [_, sound] of AudioService.activeSounds.entries()) {
      if (sound.deviceId === deviceId) {
        return true;
      }
    }
    return false;
  },

  // Check if a specific file is playing
  isFilePlaying: (fileId: string): boolean => {
    return AudioService.activeSounds.has(fileId);
  },

  // Get all currently playing device IDs
  getPlayingDevices: (): string[] => {
    const devices = new Set<string>();
    for (const [_, sound] of AudioService.activeSounds.entries()) {
      devices.add(sound.deviceId);
    }
    return Array.from(devices);
  },

  // Handle low memory warning
  onLowMemory: () => {
    try {
      console.warn('Low memory warning - clearing audio cache');
      AudioService.audioBufferCache.onLowMemory();
    } catch (error) {
      console.error('Failed to handle low memory warning:', error);
    }
  },

  // Get cache statistics
  getCacheStats: () => {
    return AudioService.audioBufferCache.getStats();
  },

  // Cleanup resources
  cleanup: async () => {
    try {
      // Stop all sounds
      AudioService.stopPlayback();

      // Cleanup loop audio service
      await LoopAudioService.cleanup();

      // Destroy buffer cache (clears timers)
      AudioService.audioBufferCache.destroy();

      // Close audio context
      if (AudioService.audioContext) {
        AudioService.audioContext.close();
        AudioService.audioContext = null;
      }

      AudioService.isInitialized = false;
    } catch (error) {
      console.error('Failed to clean up audio service:', error);
    }
  },

  // ============== PERFORMANCE ANALYSIS METHODS ==============
  // Professional performance monitoring and reporting

  // Get comprehensive performance report
  getPerformanceReport: () => {
    perfTracker.printReport();
  },

  // Clear all performance metrics
  clearPerformanceMetrics: () => {
    perfTracker.clear();
  },

  // Get quick performance summary
  getPerformanceSummary: (): string => {
    return perfTracker.getSummary();
  },

  // Get memory and cache statistics
  getMemoryStats: () => {
    const cacheStats = AudioService.audioBufferCache.getStats();

    return {
      cacheEntries: cacheStats.entries,
      cacheSizeMB: cacheStats.sizeMB,
      maxCacheSizeMB: cacheStats.maxSizeMB,
      cacheUtilization: ((cacheStats.sizeMB / cacheStats.maxSizeMB) * 100).toFixed(1) + '%',
      activeSounds: AudioService.activeSounds.size,
      isPrewarmed: AudioService.isPrewarmed,
    };
  },

  // Print quick diagnostics
  printDiagnostics: () => {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║         AUDIO SERVICE DIAGNOSTICS              ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    const memStats = AudioService.getMemoryStats();
    console.log('📊 Memory & Cache:');
    console.log(`   • Cache entries: ${memStats.cacheEntries}`);
    console.log(`   • Cache size: ${memStats.cacheSizeMB.toFixed(2)}MB / ${memStats.maxCacheSizeMB}MB (${memStats.cacheUtilization})`);
    console.log(`   • Active sounds: ${memStats.activeSounds}`);
    console.log(`   • Prewarmed: ${memStats.isPrewarmed ? 'Yes ✓' : 'No'}`);

    console.log('\n' + perfTracker.getSummary());
    console.log('═'.repeat(50) + '\n');
  },
};

export default AudioService;
