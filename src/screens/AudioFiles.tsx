import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useAppDispatch, useAppSelector} from '../store/hooks';
import {
  addFiles,
  removeFile,
  setFiles,
  updateFile,
} from '../store/slices/audioFiles';
import AudioService, {AudioFile} from '../services/audio';
import LoopAudioService from '../services/loopAudio';
import StreamingLoopService from '../services/streamingLoop';
import {RootStackParamList} from '../types/types';
// Simplified import with no unused types
import {pick, types} from '@react-native-documents/picker';

type AudioFilesScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'AudioFiles'
>;

const AudioFilesScreen: React.FC = () => {
  const navigation = useNavigation<AudioFilesScreenNavigationProp>();
  const dispatch = useAppDispatch();

  // Get audio files from the Redux state
  const {files, loading} = useAppSelector(state => state.audioFiles);
  const {devices} = useAppSelector(state => state.espDevices);

  // Local state for UI
  const [isAdding, setIsAdding] = useState(false);
  const [playingLoops, setPlayingLoops] = useState<Record<string, boolean>>({});

  // Load audio files when the component mounts
  useEffect(() => {
    const loadFiles = async () => {
      const audioFiles = await AudioService.loadAudioFiles();
      dispatch(setFiles(audioFiles));

      // Check which files are currently playing in loop (check both services)
      const loopStatus: Record<string, boolean> = {};

      // Check in-memory loop service
      const isInMemoryPlaying = await LoopAudioService.isPlaying();
      const inMemoryTrackId = LoopAudioService.getCurrentTrackId();

      // Check streaming loop service
      const isStreamingPlaying = await StreamingLoopService.isPlaying();
      const streamingTrackId = StreamingLoopService.getCurrentTrackId();

      audioFiles.forEach(file => {
        // File is looping if it's active in either service
        loopStatus[file.id] =
          (isInMemoryPlaying && inMemoryTrackId === file.id) ||
          (isStreamingPlaying && streamingTrackId === file.id);
      });
      setPlayingLoops(loopStatus);
    };

    loadFiles();

    // Set up a timer to check loop playback status (both services)
    const intervalId = setInterval(async () => {
      // Check both in-memory and streaming services
      const isInMemoryPlaying = await LoopAudioService.isPlaying();
      const inMemoryTrackId = LoopAudioService.getCurrentTrackId();

      const isStreamingPlaying = await StreamingLoopService.isPlaying();
      const streamingTrackId = StreamingLoopService.getCurrentTrackId();

      files.forEach(file => {
        // File is looping if active in either service
        const isLooping =
          (isInMemoryPlaying && inMemoryTrackId === file.id) ||
          (isStreamingPlaying && streamingTrackId === file.id);

        setPlayingLoops(prev => {
          if (prev[file.id] !== isLooping) {
            return {...prev, [file.id]: isLooping};
          }
          return prev;
        });
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [dispatch, files]);

  // Pick audio file(s) using the document picker - supports multiple selection
  const pickAudioFile = async () => {
    try {
      setIsAdding(true);
      console.log('Opening document picker...');

      // Use the document picker API with multi-selection enabled
      const results = await pick({
        type: [types.audio],
        allowMultiSelection: true, // Enable selecting multiple files at once
      });

      if (!results || results.length === 0) {
        console.log('No file was picked');
        return;
      }

      console.log(`User selected ${results.length} file(s)`);

      // Process all selected files in parallel
      const addResults = await Promise.all(
        results.map(async (pickedFile, index) => {
          try {
            console.log(`Processing file ${index + 1}/${results.length}:`, pickedFile.name);

            // Get a title for the file
            const fileTitle =
              pickedFile.name?.split('.').slice(0, -1).join('.') || 'Untitled Audio';

            // Make sure we have a valid URI
            if (!pickedFile.uri) {
              console.error('Picked file has no URI:', pickedFile.name);
              return {
                success: false,
                fileName: pickedFile.name || 'Unknown',
                error: 'Invalid file URI',
              };
            }

            // Add the file
            console.log('Adding audio file:', pickedFile.uri);
            const newFile = await AudioService.addAudioFile(
              pickedFile.uri,
              fileTitle,
            );

            if (newFile) {
              return {
                success: true,
                fileName: fileTitle,
                file: newFile,
              };
            } else {
              return {
                success: false,
                fileName: fileTitle,
                error: 'Failed to add file',
              };
            }
          } catch (fileErr) {
            console.error('Error processing file:', pickedFile.name, fileErr);
            return {
              success: false,
              fileName: pickedFile.name || 'Unknown',
              error: fileErr instanceof Error ? fileErr.message : 'Unknown error',
            };
          }
        }),
      );

      // Count successes and failures
      const successCount = addResults.filter(r => r.success).length;
      const failureCount = addResults.filter(r => !r.success).length;

      // Batch dispatch all successfully added files to Redux store
      const successfulFiles = addResults
        .filter(r => r.success && r.file)
        .map(r => r.file!);

      if (successfulFiles.length > 0) {
        console.log(`Dispatching ${successfulFiles.length} files to Redux store`);
        dispatch(addFiles(successfulFiles));
      }

      // Show appropriate feedback
      if (failureCount === 0) {
        // All files added successfully
        const message = results.length === 1
          ? 'Audio file added successfully'
          : `Successfully added ${successCount} audio file${successCount > 1 ? 's' : ''}`;
        Alert.alert('Success', message, [{text: 'OK'}]);
      } else if (successCount === 0) {
        // All files failed
        const failedFiles = addResults
          .filter(r => !r.success)
          .map(r => `• ${r.fileName}: ${r.error}`)
          .join('\n');
        Alert.alert(
          'Error',
          `Failed to add ${failureCount} file${failureCount > 1 ? 's' : ''}:\n\n${failedFiles}`,
          [{text: 'OK'}],
        );
      } else {
        // Partial success
        const failedFiles = addResults
          .filter(r => !r.success)
          .map(r => `• ${r.fileName}`)
          .join('\n');
        Alert.alert(
          'Partial Success',
          `Added ${successCount} file${successCount > 1 ? 's' : ''} successfully.\n\n` +
          `Failed to add ${failureCount} file${failureCount > 1 ? 's' : ''}:\n${failedFiles}`,
          [{text: 'OK'}],
        );
      }
    } catch (err) {
      console.error('Error picking document:', err);

      // Error handling
      if (err instanceof Error) {
        if (err.message === 'User canceled document picker') {
          console.log('Document picker cancelled by user');
        } else {
          Alert.alert('Error', `Failed to pick audio file: ${err.message}`, [
            {text: 'OK'},
          ]);
        }
      } else {
        Alert.alert('Error', 'Failed to pick audio file', [{text: 'OK'}]);
      }
    } finally {
      setIsAdding(false);
    }
  };

  // Delete an audio file
  const handleDeleteFile = async (fileId: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this audio file?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await AudioService.deleteAudioFile(fileId);
            if (success) {
              dispatch(removeFile(fileId));
            } else {
              Alert.alert('Error', 'Failed to delete the audio file', [
                {text: 'OK'},
              ]);
            }
          },
        },
      ],
    );
  };

  // Toggle loop playback for a file
  const toggleLoopPlayback = async (file: AudioFile) => {
    const fileId = file.id;
    const isCurrentlyPlaying = playingLoops[fileId] || false;

    console.log(`\n[UI] ========== TOGGLE LOOP BUTTON PRESSED ==========`);
    console.log(`[UI] File: "${file.title}"`);
    console.log(`[UI] File ID: ${fileId}`);
    console.log(`[UI] Current state: ${isCurrentlyPlaying ? 'PLAYING' : 'STOPPED'}`);
    console.log(`[UI] Action: ${isCurrentlyPlaying ? 'STOP' : 'START'}`);

    if (isCurrentlyPlaying) {
      // Stop the loop
      console.log(`[UI] Calling AudioService.stopLoopPlayback...`);
      const success = await AudioService.stopLoopPlayback(fileId);
      console.log(`[UI] stopLoopPlayback returned: ${success}`);

      if (success) {
        setPlayingLoops(prev => ({...prev, [fileId]: false}));
        dispatch(updateFile({id: fileId, loopMode: false}));
        console.log(`[UI] ✓ UI state updated to STOPPED`);
      } else {
        console.error(`[UI] ❌ Failed to stop loop`);
      }
    } else {
      // Start the loop
      console.log(`[UI] Calling AudioService.startLoopPlayback...`);
      const success = await AudioService.startLoopPlayback(fileId);
      console.log(`[UI] startLoopPlayback returned: ${success}`);

      if (success) {
        // startLoopPlayback sets activeSounds synchronously before returning
        // Trust the service layer - it will be picked up by the polling interval
        setPlayingLoops(prev => ({...prev, [fileId]: true}));
        dispatch(updateFile({id: fileId, loopMode: true}));
        console.log(`[UI] ✓ UI state updated to PLAYING`);
      } else {
        console.error(`[UI] ❌ startLoopPlayback FAILED - keeping UI state as STOPPED`);
        setPlayingLoops(prev => ({...prev, [fileId]: false}));
        dispatch(updateFile({id: fileId, loopMode: false}));
      }
    }
    console.log(`[UI] ========== TOGGLE COMPLETE ==========\n`);
  };

  // Play an audio file to preview it (non-looping)
  const handlePlayFile = async (file: AudioFile) => {
    // If file is in loop mode, don't allow regular playback
    if (playingLoops[file.id]) {
      return;
    }

    // Stop any currently playing audio
    await AudioService.stopPlayback();

    // Play this specific file as preview (not looping)
    const success = await AudioService.playAudioFile(file.id);

    if (!success) {
      console.error('Failed to play audio file:', file.title);
    }
  };

  // Get device name for a file
  const getDeviceName = (fileDeviceId?: string) => {
    if (!fileDeviceId) return 'None';
    const device = devices.find(d => d.id === fileDeviceId);
    return device ? device.name : 'Unknown Device';
  };

  // Render each audio file item
  const renderFileItem = ({item}: {item: AudioFile}) => (
    <View
      className={`mb-3 p-4 rounded-lg shadow ${
        playingLoops[item.id]
          ? 'bg-green-50 border-2 border-green-500'
          : 'bg-white'
      }`}>
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-base font-bold flex-1 text-gray-800">
          {item.title}
        </Text>

        <View className="flex-row">
          {/* Loop toggle switch */}
          <View className="flex-row items-center mr-2">
            <Text className="text-sm mr-2 text-gray-600">Loop</Text>
            <Switch
              value={playingLoops[item.id] || false}
              onValueChange={() => toggleLoopPlayback(item)}
              trackColor={{false: '#767577', true: '#4CAF50'}}
              thumbColor={playingLoops[item.id] ? '#fff' : '#f4f3f4'}
            />
          </View>

          {/* Only show Play button if not in loop mode */}
          {!playingLoops[item.id] && (
            <TouchableOpacity
              className="bg-blue-600 px-3 py-1 mr-2 rounded"
              onPress={() => handlePlayFile(item)}>
              <Text className="text-white font-medium">Play</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            className="bg-red-600 px-3 py-1 rounded"
            onPress={() => handleDeleteFile(item.id)}>
            <Text className="text-white font-medium">Delete</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text className="text-sm text-gray-500">
        Assigned to: {getDeviceName(item.deviceId)}
      </Text>

      {/* Loop status indicator */}
      {playingLoops[item.id] && (
        <View className="bg-green-100 p-2 mt-2 rounded border border-green-400">
          <Text className="text-sm text-green-700 font-bold text-center">
            ♫ PLAYING AS BACKGROUND LOOP ♫
          </Text>
          <Text className="text-xs text-green-600 text-center mt-1">
            Will continue until manually stopped
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="bg-white p-4 border-b border-gray-200 flex-row items-center justify-between">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="p-2 -ml-2">
          <Text className="text-blue-600 text-base">Back</Text>
        </TouchableOpacity>
        <Text className="text-lg font-bold text-center flex-1">
          Audio Files
        </Text>
        <View style={{width: 50}} />
      </View>

      {/* Content */}
      <View className="flex-1 p-4">
        {loading ? (
          <ActivityIndicator size="large" color="#3498db" />
        ) : (
          <>
            {files.length === 0 ? (
              <View className="flex-1 items-center justify-center">
                <Text className="text-gray-500 text-lg mb-4">
                  No audio files added yet
                </Text>
                <TouchableOpacity
                  className="bg-blue-600 px-4 py-3 rounded-lg"
                  onPress={pickAudioFile}
                  disabled={isAdding}>
                  <Text className="text-white font-bold">
                    {isAdding ? 'Adding...' : 'Add Audio File'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={files}
                renderItem={renderFileItem}
                keyExtractor={item => item.id}
                contentContainerStyle={{paddingBottom: 80}}
              />
            )}
          </>
        )}
      </View>

      {/* Bottom Add Button */}
      {files.length > 0 && (
        <View className="absolute bottom-6 right-6">
          <TouchableOpacity
            className="bg-blue-600 w-14 h-14 rounded-full items-center justify-center shadow-lg"
            onPress={pickAudioFile}
            disabled={isAdding}>
            {isAdding ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-white text-3xl font-bold">+</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

export default AudioFilesScreen;
