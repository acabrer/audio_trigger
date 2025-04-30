// Audio service for managing audio files and playback

import SoundPlayer from 'react-native-sound-player';
import RNFS from 'react-native-fs';

// Define types for audio files
export interface AudioFile {
  id: string;
  url: string;
  title: string;
  deviceId?: string; // ESP device ID this audio is mapped to
}

// Default directory for audio files
const AUDIO_DIRECTORY = `${RNFS.DocumentDirectoryPath}/audio_files`;

// Audio service for managing files and playback
export const AudioService = {
  // Initialize the audio service
  initialize: async () => {
    try {
      // Create audio directory if it doesn't exist
      const dirExists = await RNFS.exists(AUDIO_DIRECTORY);
      if (!dirExists) {
        await RNFS.mkdir(AUDIO_DIRECTORY);
      }

      // Setup event listeners
      SoundPlayer.addEventListener('FinishedPlaying', ({success}) => {
        console.log('Finished playing audio:', success);
      });

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
        const filePath = file.url.replace('file://', '');
        const exists = await RNFS.exists(filePath);
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

      // Stop playback if this is the current file
      try {
        SoundPlayer.stop();
      } catch (e) {
        // Ignore errors when stopping - might not be playing
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

      // Stop current playback if any
      try {
        SoundPlayer.stop();
      } catch (e) {
        // Ignore errors when stopping - might not be playing
      }

      // Play the audio file
      try {
        SoundPlayer.playUrl(audioFile.url);
        return true;
      } catch (e) {
        console.error('Error playing audio:', e);
        return false;
      }
    } catch (error) {
      console.error('Failed to play audio for device:', error);
      return false;
    }
  },

  // Stop playback
  stopPlayback: async (): Promise<void> => {
    try {
      SoundPlayer.stop();
    } catch (error) {
      console.error('Failed to stop playback:', error);
    }
  },

  // Cleanup resources
  cleanup: () => {
    try {
      // Remove event listeners
      SoundPlayer.unmount();
      // Stop any playing audio
      SoundPlayer.stop();
    } catch (error) {
      console.error('Failed to clean up audio service:', error);
    }
  },
};

export default AudioService;
