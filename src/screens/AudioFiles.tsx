import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import DocumentPicker, {types} from '@react-native-documents/picker';
import {useAppDispatch, useAppSelector} from '../store/hooks';
import {addFile, removeFile, setFiles} from '../store/slices/audioFiles';
import AudioService, {AudioFile} from '../services/audio';
import {RootStackParamList} from '../types/types';

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

  // Load audio files when the component mounts
  useEffect(() => {
    const loadFiles = async () => {
      const audioFiles = await AudioService.loadAudioFiles();
      dispatch(setFiles(audioFiles));
    };

    loadFiles();
  }, [dispatch]);

  // Pick an audio file using the document picker

  const pickAudioFile = async () => {
    try {
      setIsAdding(true);
      const result = await DocumentPicker.pick({
        type: [types.audio],
        copyTo: 'documentDirectory',
      });

      const pickedFile = result[0];

      // Get a title for the file - either use the filename or ask the user
      let fileTitle =
        pickedFile.name?.split('.').slice(0, -1).join('.') || 'Untitled Audio';

      // Add the file to our audio service and store
      if (pickedFile.uri) {
        const newFile = await AudioService.addAudioFile(
          pickedFile.uri,
          fileTitle,
        );

        if (newFile) {
          dispatch(addFile(newFile));
          Alert.alert('Success', 'Audio file added successfully', [
            {text: 'OK'},
          ]);
        } else {
          Alert.alert('Error', 'Failed to add audio file', [{text: 'OK'}]);
        }
      }
    } catch (err: any) {
      // Fixed error handling - check for error code directly
      if (!(err && err.code === 'DOCUMENT_PICKER_CANCELED')) {
        console.error('Error picking document:', err);
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

  // Play an audio file to preview it
  const handlePlayFile = async (file: AudioFile) => {
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
          <TouchableOpacity
            className="bg-blue-600 px-3 py-1 mr-2 rounded"
            onPress={() => handlePlayFile(item)}>
            <Text className="text-white font-medium">Play</Text>
          </TouchableOpacity>

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
