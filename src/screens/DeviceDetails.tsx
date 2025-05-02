import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
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

// Import our new components
import Header from '../components/Header';
import DeviceInfoCard from '../components/devices/DeviceInfoCard';
import AudioAssignmentCard from '../components/devices/AudioAssignmentCard';
import DangerZoneCard from '../components/common/DangerZoneCard';

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
        <Header
          title="Device Details"
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />

        {/* Device Info Section */}
        <DeviceInfoCard
          device={device}
          deviceName={deviceName}
          setDeviceName={setDeviceName}
          saveDeviceName={saveDeviceName}
          formatBatteryLevel={formatBatteryLevel}
          formatLastSeen={formatLastSeen}
        />

        {/* Audio Assignment Section */}
        <AudioAssignmentCard
          audioFiles={audioFiles}
          selectedFileId={selectedFileId}
          assignAudioFile={assignAudioFile}
          testAudio={testAudio}
          stopAudio={stopAudio}
          isPlaying={isPlaying}
          navigateToAudioFiles={() => navigation.navigate('AudioFiles')}
        />

        {/* Danger Zone */}
        <DangerZoneCard
          title="Danger Zone"
          actionLabel="Remove Device"
          onAction={deleteDevice}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

export default DeviceDetailsScreen;
