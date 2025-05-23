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
  addFile,
  removeFile,
  setFiles,
  updateFile,
} from '../store/slices/audioFiles';
import AudioService, {AudioFile} from '../services/audio';
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

      // Check which files are currently playing in loop
      const loopStatus: Record<string, boolean> = {};
      audioFiles.forEach(file => {
        loopStatus[file.id] =
          AudioService.isDevicePlaying(file.id) && !!file.loopMode;
      });
      setPlayingLoops(loopStatus);
    };

    loadFiles();

    // Set up a timer to check loop playback status
    const intervalId = setInterval(() => {
      files.forEach(file => {
        const isPlaying = AudioService.isDevicePlaying(file.id);
        setPlayingLoops(prev => {
          if (prev[file.id] !== isPlaying && file.loopMode) {
            return {...prev, [file.id]: isPlaying};
          }
          return prev;
        });
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [dispatch, files]);

  // Pick an audio file using the document picker
  const pickAudioFile = async () => {
    try {
      setIsAdding(true);
      console.log('Opening document picker...');

      // Use the document picker API
      const results = await pick({
        type: [types.audio],
      });

      if (!results || results.length === 0) {
        console.log('No file was picked');
        return;
      }

      const pickedFile = results[0];
      console.log('Document picker result:', pickedFile);

      // Get a title for the file
      let fileTitle =
        pickedFile.name?.split('.').slice(0, -1).join('.') || 'Untitled Audio';

      // Make sure we have a valid URI
      if (!pickedFile.uri) {
        console.error('Picked file has no URI');
        Alert.alert('Error', 'Selected file is invalid', [{text: 'OK'}]);
        return;
      }

      // Add the file directly without keepLocalCopy since it's causing type issues
      console.log('Adding audio file:', pickedFile.uri);
      const newFile = await AudioService.addAudioFile(
        pickedFile.uri,
        fileTitle,
      );

      if (newFile) {
        dispatch(addFile(newFile));
        Alert.alert('Success', 'Audio file added successfully', [{text: 'OK'}]);
      } else {
        Alert.alert('Error', 'Failed to add audio file', [{text: 'OK'}]);
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

    if (isCurrentlyPlaying) {
      // Stop the loop
      const success = await AudioService.stopLoopPlayback(fileId);
      if (success) {
        setPlayingLoops(prev => ({...prev, [fileId]: false}));
        // Update Redux store
        dispatch(
          updateFile({
            id: fileId,
            loopMode: false,
          }),
        );
      }
    } else {
      // Start the loop
      const success = await AudioService.startLoopPlayback(fileId);
      if (success) {
        setPlayingLoops(prev => ({...prev, [fileId]: true}));
        // Update Redux store
        dispatch(
          updateFile({
            id: fileId,
            loopMode: true,
          }),
        );
      }
    }
  };

  // Play an audio file to preview it (non-looping)
  const handlePlayFile = async (file: AudioFile) => {
    // If file is in loop mode, don't allow regular playback
    if (playingLoops[file.id]) {
      return;
    }

    await AudioService.stopPlayback();
    await AudioService.playAudioForDevice(file.deviceId || '');
  };

  // Get device name for a file
  const getDeviceName = (fileDeviceId?: string) => {
    if (!fileDeviceId) return 'None';
    const device = devices.find(d => d.id === fileDeviceId);
    return device ? device.name : 'Unknown Device';
  };

  // Render each audio file item
  const renderFileItem = ({item}: {item: AudioFile}) => (
    <View className="bg-white mb-3 p-4 rounded-lg shadow">
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
        <Text className="text-sm text-green-600 font-bold mt-1">
          ♫ Playing in loop mode ♫
        </Text>
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
