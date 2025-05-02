import {
  AudioContext,
  AudioBufferSourceNode,
  AudioBuffer,
} from 'react-native-audio-api';
import RNFS from 'react-native-fs';

// Define types for audio files
export interface AudioFile {
  id: string;
  url: string;
  title: string;
  deviceId?: string; // ESP device ID this audio is mapped to
}

// Interface for active sounds
interface ActiveSound {
  id: string;
  deviceId: string;
  source: AudioBufferSourceNode;
}

// Default directory for audio files
const AUDIO_DIRECTORY = `${RNFS.DocumentDirectoryPath}/audio_files`;

// Audio service for managing files and playback
export const AudioService = {
  // Store the AudioContext instance
  audioContext: null as AudioContext | null,

  // Map of loaded audio buffers by file ID
  audioBuffers: new Map<string, AudioBuffer>(),

  // Store for active sounds - allows multiple sounds to play simultaneously
  activeSounds: new Map<string, ActiveSound>(),

  // Initialize the audio service
  initialize: async () => {
    try {
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
      return true;
    } catch (error) {
      console.error('Failed to initialize audio service:', error);
      return false;
    }
  },

  // Load and return all saved audio files
  loadAudioFiles: async (): Promise<AudioFile[]> => {
    try {
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

      console.log('Loaded audio files:', validFiles);
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
      // Create directory if it doesn't exist
      const dirExists = await RNFS.exists(AUDIO_DIRECTORY);
      if (!dirExists) {
        await RNFS.mkdir(AUDIO_DIRECTORY);
      }

      // Generate unique ID for the file
      const fileId = Date.now().toString();
      const fileName = `${fileId}.${sourceUri.split('.').pop()}`;
      const destinationPath = `${AUDIO_DIRECTORY}/${fileName}`;

      // Copy file to app storage
      await RNFS.copyFile(sourceUri, destinationPath);

      // Create audio file metadata
      const newFile: AudioFile = {
        id: fileId,
        url: `file://${destinationPath}`,
        title,
        deviceId,
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
      AudioService.audioBuffers.delete(fileId);

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

  // Load and decode an audio file
  loadAudioBuffer: async (fileUrl: string): Promise<AudioBuffer | null> => {
    try {
      if (!AudioService.audioContext) {
        await AudioService.initialize();
      }

      const ctx = AudioService.audioContext!;

      // Convert file:// URL to a usable format
      const filePath = fileUrl.replace('file://', '');

      // Read the file as binary data
      const fileData = await RNFS.readFile(filePath, 'base64');

      // Convert base64 to ArrayBuffer
      const binaryString = atob(fileData);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const arrayBuffer = bytes.buffer;

      // Decode the audio data
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      return audioBuffer;
    } catch (error) {
      console.error('Failed to load audio buffer:', error);
      return null;
    }
  },

  // Find and play audio for an ESP device - true multichannel support
  playAudioForDevice: async (deviceId: string): Promise<boolean> => {
    try {
      if (!AudioService.audioContext) {
        await AudioService.initialize();
      }

      const ctx = AudioService.audioContext!;
      console.log('Playing audio for device:', deviceId);

      // Load audio files
      const audioFiles = await AudioService.loadAudioFiles();

      // Find audio mapped to this device
      const audioFile = audioFiles.find(file => file.deviceId === deviceId);
      if (!audioFile) {
        console.log(`No audio file mapped to device ${deviceId}`);
        return false;
      }

      console.log(
        'Found audio file for device:',
        audioFile.title,
        audioFile.url,
      );

      // Get or load the audio buffer
      let buffer = AudioService.audioBuffers.get(audioFile.id);
      if (!buffer) {
        const loadedBuffer = await AudioService.loadAudioBuffer(audioFile.url);
        buffer = loadedBuffer ?? undefined;
        if (buffer) {
          AudioService.audioBuffers.set(audioFile.id, buffer);
        } else {
          console.error('Failed to load audio buffer');
          return false;
        }
      }

      // Stop any existing sound for this device
      AudioService.stopDeviceAudio(deviceId);

      // Create a source node
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      // Start playing
      source.start(0);

      // Store the sound source
      AudioService.activeSounds.set(audioFile.id, {
        id: audioFile.id,
        deviceId,
        source,
      });

      // Setup automatic cleanup when sound ends
      source.onended = () => {
        if (AudioService.activeSounds.has(audioFile.id)) {
          AudioService.activeSounds.delete(audioFile.id);
        }
      };

      return true;
    } catch (error) {
      console.error('Failed to play audio for device:', error);
      return false;
    }
  },

  // Stop a specific sound
  stopSound: (fileId: string): void => {
    try {
      const activeSound = AudioService.activeSounds.get(fileId);
      if (activeSound) {
        activeSound.source.stop(0);
        AudioService.activeSounds.delete(fileId);
      }
    } catch (error) {
      console.error(`Failed to stop sound ${fileId}:`, error);
    }
  },

  // Stop all sounds for a specific device
  stopDeviceAudio: (deviceId: string): void => {
    try {
      // Find all sounds playing for this device
      for (const [fileId, sound] of AudioService.activeSounds.entries()) {
        if (sound.deviceId === deviceId) {
          try {
            sound.source.stop(0);
          } catch (err) {
            console.error('Failed to stop sound source:', err);
          }
          AudioService.activeSounds.delete(fileId);
        }
      }
    } catch (error) {
      console.error(`Failed to stop device audio for ${deviceId}:`, error);
    }
  },

  // Stop all playback - Fixed to properly handle all active sounds
  stopPlayback: async (): Promise<void> => {
    try {
      console.log(
        `Stopping all audio playback, active sounds: ${AudioService.activeSounds.size}`,
      );

      // Create a new array from the entries to avoid modification during iteration
      const activeSoundsEntries = Array.from(
        AudioService.activeSounds.entries(),
      );

      // Stop all active sounds
      for (const [fileId, sound] of activeSoundsEntries) {
        try {
          console.log(
            `Stopping sound with ID: ${fileId} for device: ${sound.deviceId}`,
          );
          sound.source.stop(0);
          AudioService.activeSounds.delete(fileId);
        } catch (err) {
          console.error(`Error stopping sound ${fileId}:`, err);
          // Still remove from active sounds even if there was an error
          AudioService.activeSounds.delete(fileId);
        }
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

  // Get all currently playing device IDs
  getPlayingDevices: (): string[] => {
    const devices = new Set<string>();
    for (const [_, sound] of AudioService.activeSounds.entries()) {
      devices.add(sound.deviceId);
    }
    return Array.from(devices);
  },

  // Cleanup resources
  cleanup: () => {
    try {
      // Stop all sounds
      AudioService.stopPlayback();

      // Clear buffers
      AudioService.audioBuffers.clear();

      // Close audio context
      if (AudioService.audioContext) {
        AudioService.audioContext.close();
        AudioService.audioContext = null;
      }
    } catch (error) {
      console.error('Failed to clean up audio service:', error);
    }
  },
};

export default AudioService;
