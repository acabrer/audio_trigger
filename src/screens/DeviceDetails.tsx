import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../types/types';
import {useAppDispatch, useAppSelector} from '../store/hooks';
import {updateDevice, removeDevice} from '../store/slices/espDevices';
import AudioService from '../services/audio';
import {AudioFile} from '../services/audio';
import {setFiles} from '../store/slices/audioFiles';

type DeviceDetailsScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'DeviceDetails'
>;

type DeviceDetailsScreenRouteProp = RouteProp<
  RootStackParamList,
  'DeviceDetails'
>;

const DeviceDetailsScreen: React.FC = () => {
  const navigation = useNavigation<DeviceDetailsScreenNavigationProp>();
  const route = useRoute<DeviceDetailsScreenRouteProp>();
  const dispatch = useAppDispatch();
  const {deviceId} = route.params;

  // Get device and audio files from state
  const device = useAppSelector(state =>
    state.espDevices.devices.find(d => d.id === deviceId),
  );
  const audioFiles = useAppSelector(state => state.audioFiles.files);
  const assignedFile = audioFiles.find(file => file.deviceId === deviceId);

  // Local state for editing
  const [deviceName, setDeviceName] = useState(device?.name || '');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(
    assignedFile?.id || null,
  );
  // Track if this device's audio is playing
  const [isPlaying, setIsPlaying] = useState(false);

  // Check playing status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const devicePlaying = AudioService.isDevicePlaying(deviceId);
      if (devicePlaying !== isPlaying) {
        setIsPlaying(devicePlaying);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [deviceId, isPlaying]);

  // Battery level formatting
  const formatBatteryLevel = (level?: number) => {
    if (level === undefined) {
      return 'Unknown';
    }
    return `${Math.round(level * 100)}%`;
  };

  // Format timestamp
  const formatLastSeen = (timestamp?: number) => {
    if (!timestamp) {
      return 'Never';
    }

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // Format as "X minutes/hours/days ago"
    if (diff < 60000) {
      return 'Just now';
    }
    if (diff < 3600000) {
      return `${Math.floor(diff / 60000)} minutes ago`;
    }
    if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)} hours ago`;
    }
    return `${Math.floor(diff / 86400000)} days ago`;
  };

  // Save device name
  const saveDeviceName = () => {
    if (device && deviceName.trim()) {
      dispatch(
        updateDevice({
          id: deviceId,
          name: deviceName.trim(),
        }),
      );
    }
  };

  // Assign audio file to device
  const assignAudioFile = async (fileId: string) => {
    if (fileId) {
      setSelectedFileId(fileId);
      const success = await AudioService.mapFileToDevice(fileId, deviceId);

      if (success) {
        // After mapping is successful, reload the updated audio files
        const updatedFiles = await AudioService.loadAudioFiles();

        // Update Redux store with the new files that have the correct mapping
        dispatch(setFiles(updatedFiles));

        console.log('Audio file mapping updated in Redux store');
      }
    }
  };
  // Test audio playback
  const testAudio = () => {
    AudioService.playAudioForDevice(deviceId);
  };

  // Stop only this device's audio
  const stopAudio = () => {
    AudioService.stopDeviceAudio(deviceId);
    setIsPlaying(false);
  };

  // Remove device from the app
  const deleteDevice = () => {
    dispatch(removeDevice(deviceId));
    navigation.goBack();
  };

  // Error state
  if (!device) {
    return (
      <SafeAreaView className="flex-1 bg-gray-100">
        <View className="px-4 py-6">
          <Text className="text-xl text-red-500">
            Device not found. It may have been deleted.
          </Text>
          <TouchableOpacity
            className="mt-4 bg-blue-600 p-3 rounded-lg"
            onPress={() => navigation.goBack()}>
            <Text className="text-white text-center font-bold">Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <ScrollView>
        {/* Header */}
        <View className="bg-white p-4 border-b border-gray-200 flex-row items-center justify-between">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="p-2 -ml-2">
            <Text className="text-blue-600 text-base">Back</Text>
          </TouchableOpacity>
          <Text className="text-lg font-bold text-center flex-1">
            Device Details
          </Text>
          <View style={{width: 50}} />
        </View>

        {/* Device Info Section */}
        <View className="bg-white p-4 m-4 rounded-lg shadow-sm">
          <Text className="text-lg font-bold mb-4 text-gray-800">
            Device Information
          </Text>

          <View className="mb-4">
            <Text className="text-sm text-gray-500 mb-1">Device ID</Text>
            <Text className="text-base font-medium">{device.id}</Text>
          </View>

          <View className="mb-4">
            <Text className="text-sm text-gray-500 mb-1">Name</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-2 text-base bg-white"
              value={deviceName}
              onChangeText={setDeviceName}
              onBlur={saveDeviceName}
              placeholder="Enter device name"
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm text-gray-500 mb-1">Battery Level</Text>
            <Text className="text-base">
              {formatBatteryLevel(device.batteryLevel)}
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-sm text-gray-500 mb-1">Last Seen</Text>
            <Text className="text-base">{formatLastSeen(device.lastSeen)}</Text>
          </View>
        </View>

        {/* Audio Assignment Section */}
        <View className="bg-white p-4 m-4 rounded-lg shadow-sm">
          <Text className="text-lg font-bold mb-4 text-gray-800">
            Assigned Audio
          </Text>

          {audioFiles.length === 0 ? (
            <View className="py-4 items-center">
              <Text className="text-gray-500 mb-2">
                No audio files available
              </Text>
              <TouchableOpacity
                className="bg-blue-600 p-3 rounded-lg"
                onPress={() => navigation.navigate('AudioFiles')}>
                <Text className="text-white font-bold">Add Audio Files</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text className="text-sm text-gray-500 mb-2">
                Selected Audio File
              </Text>

              <View className="mb-4 border border-gray-200 rounded-lg">
                {audioFiles.map((file: AudioFile) => (
                  <TouchableOpacity
                    key={file.id}
                    className={`p-4 border-b border-gray-200 flex-row justify-between items-center ${
                      selectedFileId === file.id ? 'bg-blue-50' : 'bg-white'
                    }`}
                    onPress={() => assignAudioFile(file.id)}>
                    <Text
                      className={`${
                        selectedFileId === file.id
                          ? 'font-bold text-blue-600'
                          : 'text-gray-800'
                      }`}>
                      {file.title}
                    </Text>
                    {selectedFileId === file.id && (
                      <Text className="text-blue-600">✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {selectedFileId && (
                <View className="flex-row mb-4">
                  <TouchableOpacity
                    className="flex-1 mr-2 bg-green-600 p-3 rounded-lg"
                    onPress={testAudio}>
                    <Text className="text-white text-center font-bold">
                      Play Sound
                    </Text>
                  </TouchableOpacity>

                  {isPlaying && (
                    <TouchableOpacity
                      className="flex-1 ml-2 bg-red-600 p-3 rounded-lg"
                      onPress={stopAudio}>
                      <Text className="text-white text-center font-bold">
                        Stop Sound
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </>
          )}
        </View>

        {/* Danger Zone */}
        <View className="bg-white p-4 m-4 rounded-lg shadow-sm">
          <Text className="text-lg font-bold mb-4 text-red-600">
            Danger Zone
          </Text>

          <TouchableOpacity
            className="bg-red-600 p-3 rounded-lg"
            onPress={deleteDevice}>
            <Text className="text-white text-center font-bold">
              Remove Device
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default DeviceDetailsScreen;
