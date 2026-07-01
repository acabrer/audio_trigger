// src/services/loopAudio.ts
// Loop audio playback service using react-native-audio-api
// Handles large audio files efficiently with AudioBufferSourceNode looping

import {AudioContext, AudioBuffer} from 'react-native-audio-api';
import RNFS from 'react-native-fs';

export interface LoopAudioFile {
  id: string;
  url: string;
  title: string;
}

/**
 * Loop Audio Service - Professional implementation using react-native-audio-api
 *
 * Features:
 * - Efficient memory usage: Loads buffer once, loops infinitely
 * - No cache pollution: Loop buffers stored separately
 * - Clean error handling and logging
 * - Seamless looping with AudioBufferSourceNode
 */
export const LoopAudioService = {
  // Audio context (shared with trigger sounds for efficiency)
  audioContext: null as AudioContext | null,

  // Current loop state
  currentBuffer: null as AudioBuffer | null,
  currentSource: null as any | null, // AudioBufferSourceNode
  currentGain: null as any | null, // GainNode
  currentTrackId: null as string | null,
  isCurrentlyPlaying: false,

  /**
   * Initialize audio context (shared with AudioService)
   */
  initializeAudioContext: (sharedContext?: AudioContext): void => {
    if (!LoopAudioService.audioContext) {
      LoopAudioService.audioContext = sharedContext || new AudioContext();
      console.log('[LoopAudio] Audio context initialized');
    }
  },

  /**
   * Start loop playback for a file
   */
  startLoopPlayback: async (file: LoopAudioFile, sharedContext?: AudioContext): Promise<boolean> => {
    const startTime = performance.now();
    console.log(`\n[LoopAudio] ========== START LOOP PLAYBACK ==========`);
    console.log(`[LoopAudio] File: "${file.title}"`);
    console.log(`[LoopAudio] File ID: ${file.id}`);
    console.log(`[LoopAudio] URL: ${file.url}`);

    try {
      // Initialize audio context if needed
      LoopAudioService.initializeAudioContext(sharedContext);

      if (!LoopAudioService.audioContext) {
        console.error('[LoopAudio] ❌ Audio context not available');
        return false;
      }

      // Verify file exists
      const filePath = file.url.replace('file://', '');
      const fileExists = await RNFS.exists(filePath);

      if (!fileExists) {
        console.error(`[LoopAudio] ❌ File does not exist: ${filePath}`);
        return false;
      }

      const fileStats = await RNFS.stat(filePath);
      const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
      console.log(`[LoopAudio] File size: ${fileSizeMB}MB`);

      // Stop any existing loop playback
      if (LoopAudioService.isCurrentlyPlaying) {
        console.log('[LoopAudio] Stopping existing loop...');
        await LoopAudioService.stopLoopPlayback();
      }

      // Load audio buffer
      console.log('[LoopAudio] Loading audio buffer...');
      const loadStartTime = performance.now();

      const buffer = await LoopAudioService.audioContext.decodeAudioDataSource(file.url);

      const loadTime = performance.now() - loadStartTime;
      const durationMin = (buffer.duration / 60).toFixed(1);
      const bufferSizeMB = ((buffer.numberOfChannels * buffer.length * 4) / (1024 * 1024)).toFixed(1);

      console.log(`[LoopAudio] ✓ Buffer loaded in ${loadTime.toFixed(0)}ms`);
      console.log(`[LoopAudio]    Duration: ${durationMin} minutes`);
      console.log(`[LoopAudio]    Channels: ${buffer.numberOfChannels}`);
      console.log(`[LoopAudio]    Sample Rate: ${buffer.sampleRate}Hz`);
      console.log(`[LoopAudio]    Buffer Size: ${bufferSizeMB}MB`);

      // Create audio nodes
      const source = LoopAudioService.audioContext.createBufferSource();
      const gain = LoopAudioService.audioContext.createGain();

      // Configure source for looping
      source.buffer = buffer;
      source.loop = true; // Enable seamless looping
      source.loopStart = 0;
      source.loopEnd = buffer.duration;

      // Set initial volume
      gain.gain.value = 1.0;

      // Connect audio graph: source -> gain -> destination
      source.connect(gain);
      gain.connect(LoopAudioService.audioContext.destination);

      // Start playback
      source.start();
      console.log('[LoopAudio] ✓ Looping playback started');

      // Store references
      LoopAudioService.currentBuffer = buffer;
      LoopAudioService.currentSource = source;
      LoopAudioService.currentGain = gain;
      LoopAudioService.currentTrackId = file.id;
      LoopAudioService.isCurrentlyPlaying = true;

      const totalTime = performance.now() - startTime;
      console.log(`[LoopAudio] ========== LOOP STARTED SUCCESSFULLY (${totalTime.toFixed(0)}ms) ==========`);
      console.log(`[LoopAudio] 🎵 Infinite loop active - ${bufferSizeMB}MB buffer in memory\n`);

      return true;

    } catch (error) {
      const totalTime = performance.now() - startTime;
      console.error(`[LoopAudio] ❌ FAILED after ${totalTime.toFixed(0)}ms:`, error);

      // Clean up on error
      LoopAudioService.currentBuffer = null;
      LoopAudioService.currentSource = null;
      LoopAudioService.currentGain = null;
      LoopAudioService.currentTrackId = null;
      LoopAudioService.isCurrentlyPlaying = false;

      return false;
    }
  },

  /**
   * Stop loop playback and clean up resources
   */
  stopLoopPlayback: async (): Promise<boolean> => {
    console.log(`\n[LoopAudio] ========== STOP LOOP PLAYBACK ==========`);

    try {
      if (!LoopAudioService.isCurrentlyPlaying) {
        console.log('[LoopAudio] No loop playing, nothing to stop');
        return true;
      }

      // Stop the source
      if (LoopAudioService.currentSource) {
        try {
          LoopAudioService.currentSource.stop();
          console.log('[LoopAudio] ✓ Source stopped');
        } catch (err) {
          // Source may already be stopped
          console.log('[LoopAudio] Source already stopped');
        }
      }

      // Disconnect audio nodes
      if (LoopAudioService.currentSource) {
        LoopAudioService.currentSource.disconnect();
      }
      if (LoopAudioService.currentGain) {
        LoopAudioService.currentGain.disconnect();
      }

      // Clear references (buffer will be garbage collected)
      LoopAudioService.currentBuffer = null;
      LoopAudioService.currentSource = null;
      LoopAudioService.currentGain = null;
      LoopAudioService.currentTrackId = null;
      LoopAudioService.isCurrentlyPlaying = false;

      console.log('[LoopAudio] ✓ Resources released');
      console.log(`[LoopAudio] ========== LOOP STOPPED SUCCESSFULLY ==========\n`);

      return true;

    } catch (error) {
      console.error('[LoopAudio] ❌ Failed to stop:', error);

      // Force cleanup even on error
      LoopAudioService.currentBuffer = null;
      LoopAudioService.currentSource = null;
      LoopAudioService.currentGain = null;
      LoopAudioService.currentTrackId = null;
      LoopAudioService.isCurrentlyPlaying = false;

      return false;
    }
  },

  /**
   * Check if loop audio is currently playing
   */
  isPlaying: async (): Promise<boolean> => {
    return LoopAudioService.isCurrentlyPlaying;
  },

  /**
   * Get the ID of the currently playing track (if any)
   */
  getCurrentTrackId: (): string | null => {
    return LoopAudioService.currentTrackId;
  },

  /**
   * Set volume for loop playback (0.0 to 1.0)
   */
  setVolume: (volume: number): void => {
    if (LoopAudioService.currentGain) {
      const clampedVolume = Math.max(0, Math.min(1, volume));
      LoopAudioService.currentGain.gain.value = clampedVolume;
      console.log(`[LoopAudio] Volume set to ${(clampedVolume * 100).toFixed(0)}%`);
    }
  },

  /**
   * Get current volume (0.0 to 1.0)
   */
  getVolume: (): number => {
    return LoopAudioService.currentGain?.gain.value ?? 1.0;
  },

  /**
   * Clean up all resources
   */
  cleanup: async (): Promise<void> => {
    try {
      await LoopAudioService.stopLoopPlayback();
      console.log('[LoopAudio] Cleanup complete');
    } catch (error) {
      console.error('[LoopAudio] Cleanup failed:', error);
    }
  },
};

export default LoopAudioService;
