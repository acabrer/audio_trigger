// src/services/audio.ts

import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  RepeatMode,
  State,
} from 'react-native-track-player';
import RNFS from 'react-native-fs';

// Define types for audio files
export interface AudioFile {
  id: string;
  url: string;
  title: string;
  deviceId?: string; // ESP device ID this audio is mapped to
}

// Setup track player with necessary capabilities
export const setupPlayer = async () => {
  let isSetup = false;
  try {
    // Check if the player is already initialized
    await TrackPlayer.getState();
    isSetup = true;
  } catch {
    // Initialize the player if it isn't setup yet
    await TrackPlayer.setupPlayer();
    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior:
          AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.Stop,
        Capability.JumpForward,
        Capability.JumpBackward,
      ],
      compactCapabilities: [Capability.Play, Capability.Pause, Capability.Stop],
      notificationCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.Stop,
      ],
      progressUpdateEventInterval: 2,
    });

    // Set repeat mode to off by default
    await TrackPlayer.setRepeatMode(RepeatMode.Off);

    isSetup = true;
  }

  return isSetup;
};

// Default directory for audio files
const AUDIO_DIRECTORY = `${RNFS.DocumentDirectoryPath}/audio_files`;

// Audio service for managing files and playback
export const AudioService = {
  // Initialize the audio service
  initialize: async () => {
    try {
      // Setup the player
      await setupPlayer();

      // Create audio directory if it doesn't exist
      const dirExists = await RNFS.exists(AUDIO_DIRECTORY);
      if (!dirExists) {
        await RNFS.mkdir(AUDIO_DIRECTORY);
      }

      console.log('Audio service initialized');
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
        const exists = await RNFS.exists(file.url);
        if (exists) {
          validFiles.push(file);
        }
      }

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

      // Remove file from filesystem
      const filePath = fileToDelete.url.replace('file://', '');
      if (await RNFS.exists(filePath)) {
        await RNFS.unlink(filePath);
      }

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

      // Find and update the file
      const updatedFiles = existingFiles.map(file => {
        if (file.id === fileId) {
          return {...file, deviceId};
        }
        return file;
      });

      // Save updated metadata
      const metadataPath = `${AUDIO_DIRECTORY}/metadata.json`;
      await RNFS.writeFile(metadataPath, JSON.stringify(updatedFiles), 'utf8');

      return true;
    } catch (error) {
      console.error('Failed to map file to device:', error);
      return false;
    }
  },

  // Find and play audio for an ESP device
  playAudioForDevice: async (deviceId: string): Promise<boolean> => {
    try {
      // Load audio files
      const audioFiles = await AudioService.loadAudioFiles();

      // Find audio mapped to this device
      const audioFile = audioFiles.find(file => file.deviceId === deviceId);
      if (!audioFile) {
        console.log(`No audio file mapped to device ${deviceId}`);
        return false;
      }

      // Get player state
      const playerState = await TrackPlayer.getState();

      // Stop current track if playing
      if (playerState === State.Playing || playerState === State.Paused) {
        await TrackPlayer.reset();
      }

      // Add and play the track
      await TrackPlayer.add({
        id: audioFile.id,
        url: audioFile.url,
        title: audioFile.title,
        artist: 'ESP Audio Trigger',
      });

      await TrackPlayer.play();
      return true;
    } catch (error) {
      console.error('Failed to play audio for device:', error);
      return false;
    }
  },

  // Stop playback
  stopPlayback: async (): Promise<void> => {
    try {
      await TrackPlayer.stop();
    } catch (error) {
      console.error('Failed to stop playback:', error);
    }
  },
};

// Register playback service
export const PlaybackService = async function () {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
};

export default AudioService;
