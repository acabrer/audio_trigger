import React from 'react';
import {View, Text, FlatList, ActivityIndicator} from 'react-native';
import {ESPDevice} from '../../types/types';
import DeviceItem from './DeviceItem';
import {AudioFile} from '../../services/audio';

interface DeviceListProps {
  devices: ESPDevice[];
  audioFiles: AudioFile[];
  playingDevices: string[];
  isLoading: boolean;
  onStopAudio: (deviceId: string) => void;
  onPlayAudio: (deviceId: string) => void;
  onViewDetails: (deviceId: string) => void;
  getDeviceStatus: (deviceId: string) => string;
  getDeviceAudioFile: (deviceId: string) => AudioFile | undefined;
  isDevicePlaying: (deviceId: string) => boolean;
}

const DeviceList: React.FC<DeviceListProps> = ({
  devices,
  audioFiles,
  playingDevices,
  isLoading,
  onStopAudio,
  onPlayAudio,
  onViewDetails,
  getDeviceStatus,
  getDeviceAudioFile,
  isDevicePlaying,
}) => {
  const renderDeviceItem = ({item}: {item: ESPDevice}) => {
    const audioFile = getDeviceAudioFile(item.id);
    const devicePlaying = isDevicePlaying(item.id);

    return (
      <DeviceItem
        device={item}
        audioFile={audioFile}
        isPlaying={devicePlaying}
        onStopAudio={onStopAudio}
        onPlayAudio={onPlayAudio}
        onViewDetails={onViewDetails}
        deviceStatus={getDeviceStatus(item.id)}
      />
    );
  };

  const EmptyListComponent = () => (
    <View className="p-8 items-center justify-center bg-gray-200 rounded-lg">
      <Text className="text-center text-gray-600 leading-6">
        No ESP devices found. Make sure your devices are powered on and
        connected to the same network.
      </Text>
    </View>
  );

  return (
    <View className="flex-1 p-4">
      <Text className="text-lg font-bold mb-4 text-gray-800">
        Connected ESP Devices
      </Text>
      {isLoading ? (
        <View className="items-center justify-center p-4">
          <ActivityIndicator size="large" color="#3498db" />
          <Text className="text-gray-600 mt-2">Initializing services...</Text>
        </View>
      ) : (
        <FlatList
          data={devices}
          renderItem={renderDeviceItem}
          keyExtractor={item => item.id}
          contentContainerStyle={{paddingBottom: 16}}
          ListEmptyComponent={EmptyListComponent}
        />
      )}
    </View>
  );
};

export default DeviceList;
