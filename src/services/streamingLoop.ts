// src/services/streamingLoop.ts
// Streaming audio service for large file loop playback using react-native-video
// Designed for files that would exceed memory limits when fully decoded

import RNFS from 'react-native-fs';

export interface StreamingLoopFile {
  id: string;
  url: string;
  title: string;
}

/**
 * Streaming Loop Audio Service - Memory-efficient playback for large files
 *
 * Uses react-native-video for true streaming playback without loading
 * entire decoded buffer into memory. Ideal for files >50MB decoded.
 *
 * Features:
 * - Zero memory overhead: Streams directly from disk
 * - Seamless looping: Native repeat support
 * - Volume control: Independent volume adjustment
 * - Background playback: Continues when app backgrounded
 */
export const StreamingLoopService = {
  // Video player reference (rendered in UI layer)
  playerRef: null as any,

  // Current playback state
  currentTrackId: null as string | null,
  currentUrl: null as string | null,
  isCurrentlyPlaying: false,
  currentVolume: 1.0,

  // Callbacks for UI updates
  onPlaybackStatusChange: null as ((isPlaying: boolean) => void) | null,
  onError: null as ((error: any) => void) | null,

  /**
   * Register the Video component reference
   * This must be called from the UI layer where Video is rendered
   */
  registerPlayer: (ref: any): void => {
    StreamingLoopService.playerRef = ref;
    console.log('[StreamingLoop] Player registered');
  },

  /**
   * Unregister the Video component reference
   */
  unregisterPlayer: (): void => {
    StreamingLoopService.playerRef = null;
    console.log('[StreamingLoop] Player unregistered');
  },

  /**
   * Start streaming loop playback for a large file
   */
  startLoopPlayback: async (file: StreamingLoopFile): Promise<boolean> => {
    const startTime = performance.now();
    console.log(`\n[StreamingLoop] ========== START STREAMING LOOP ==========`);
    console.log(`[StreamingLoop] File: "${file.title}"`);
    console.log(`[StreamingLoop] File ID: ${file.id}`);
    console.log(`[StreamingLoop] URL: ${file.url}`);

    try {
      // Verify file exists
      const filePath = file.url.replace('file://', '');
      const fileExists = await RNFS.exists(filePath);

      if (!fileExists) {
        console.error(`[StreamingLoop] ❌ File does not exist: ${filePath}`);
        return false;
      }

      const fileStats = await RNFS.stat(filePath);
      const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
      console.log(`[StreamingLoop] File size: ${fileSizeMB}MB (streaming from disk)`);

      // Stop any existing playback
      if (StreamingLoopService.isCurrentlyPlaying) {
        console.log('[StreamingLoop] Stopping existing playback...');
        await StreamingLoopService.stopLoopPlayback();
      }

      // Store current track info
      StreamingLoopService.currentTrackId = file.id;
      StreamingLoopService.currentUrl = file.url;
      StreamingLoopService.isCurrentlyPlaying = true;

      const totalTime = performance.now() - startTime;
      console.log(`[StreamingLoop] ========== STREAMING STARTED (${totalTime.toFixed(0)}ms) ==========`);
      console.log(`[StreamingLoop] 🎵 Streaming ${fileSizeMB}MB file with ZERO memory overhead\n`);

      // Notify UI layer to start playback
      if (StreamingLoopService.onPlaybackStatusChange) {
        StreamingLoopService.onPlaybackStatusChange(true);
      }

      return true;

    } catch (error) {
      const totalTime = performance.now() - startTime;
      console.error(`[StreamingLoop] ❌ FAILED after ${totalTime.toFixed(0)}ms:`, error);

      // Clean up on error
      StreamingLoopService.currentTrackId = null;
      StreamingLoopService.currentUrl = null;
      StreamingLoopService.isCurrentlyPlaying = false;

      if (StreamingLoopService.onError) {
        StreamingLoopService.onError(error);
      }

      return false;
    }
  },

  /**
   * Stop streaming loop playback
   */
  stopLoopPlayback: async (): Promise<boolean> => {
    console.log(`\n[StreamingLoop] ========== STOP STREAMING LOOP ==========`);

    try {
      if (!StreamingLoopService.isCurrentlyPlaying) {
        console.log('[StreamingLoop] No streaming playback active');
        return true;
      }

      // Clear state
      StreamingLoopService.currentTrackId = null;
      StreamingLoopService.currentUrl = null;
      StreamingLoopService.isCurrentlyPlaying = false;

      // Notify UI layer to stop playback
      if (StreamingLoopService.onPlaybackStatusChange) {
        StreamingLoopService.onPlaybackStatusChange(false);
      }

      console.log('[StreamingLoop] ✓ Streaming stopped');
      console.log(`[StreamingLoop] ========== STREAMING STOPPED ==========\n`);

      return true;

    } catch (error) {
      console.error('[StreamingLoop] ❌ Failed to stop:', error);

      // Force cleanup
      StreamingLoopService.currentTrackId = null;
      StreamingLoopService.currentUrl = null;
      StreamingLoopService.isCurrentlyPlaying = false;

      return false;
    }
  },

  /**
   * Check if streaming playback is active
   */
  isPlaying: async (): Promise<boolean> => {
    return StreamingLoopService.isCurrentlyPlaying;
  },

  /**
   * Get the ID of the currently streaming track
   */
  getCurrentTrackId: (): string | null => {
    return StreamingLoopService.currentTrackId;
  },

  /**
   * Get the URL of the currently streaming track
   */
  getCurrentUrl: (): string | null => {
    return StreamingLoopService.currentUrl;
  },

  /**
   * Set volume for streaming playback (0.0 to 1.0)
   */
  setVolume: (volume: number): void => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    StreamingLoopService.currentVolume = clampedVolume;

    // Note: Volume is applied via the Video component's volume prop
    // The UI layer will read this value and update the Video component
    console.log(`[StreamingLoop] Volume set to ${(clampedVolume * 100).toFixed(0)}%`);
  },

  /**
   * Get current volume (0.0 to 1.0)
   */
  getVolume: (): number => {
    return StreamingLoopService.currentVolume;
  },

  /**
   * Register callback for playback status changes
   */
  setPlaybackStatusCallback: (callback: (isPlaying: boolean) => void): void => {
    StreamingLoopService.onPlaybackStatusChange = callback;
  },

  /**
   * Register callback for errors
   */
  setErrorCallback: (callback: (error: any) => void): void => {
    StreamingLoopService.onError = callback;
  },

  /**
   * Handle playback error from Video component
   */
  handleError: (error: any): void => {
    console.error('[StreamingLoop] ❌ Playback error:', error);

    StreamingLoopService.isCurrentlyPlaying = false;

    if (StreamingLoopService.onError) {
      StreamingLoopService.onError(error);
    }
  },

  /**
   * Handle playback end (shouldn't happen with repeat=true)
   */
  handleEnd: (): void => {
    console.log('[StreamingLoop] Playback ended (unexpected with repeat=true)');
  },

  /**
   * Handle playback load
   */
  handleLoad: (data: any): void => {
    console.log('[StreamingLoop] ✓ File loaded, duration:', data.duration, 'seconds');
  },

  /**
   * Clean up resources
   */
  cleanup: async (): Promise<void> => {
    try {
      await StreamingLoopService.stopLoopPlayback();
      StreamingLoopService.onPlaybackStatusChange = null;
      StreamingLoopService.onError = null;
      StreamingLoopService.playerRef = null;
      console.log('[StreamingLoop] Cleanup complete');
    } catch (error) {
      console.error('[StreamingLoop] Cleanup failed:', error);
    }
  },
};

export default StreamingLoopService;
