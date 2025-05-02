// src/components/devices/DeviceItem.tsx
import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import {ESPDevice} from '../../types/types';
import {AudioFile} from '../../services/audio';

interface DeviceItemProps {
  device: ESPDevice;
  audioFile?: AudioFile;
  isPlaying: boolean;
  onStopAudio: (deviceId: string) => void;
  onPlayAudio: (deviceId: string) => void;
  onViewDetails: (deviceId: string) => void;
  deviceStatus: string;
}

const DeviceItem: React.FC<DeviceItemProps> = ({
  device,
  audioFile,
  isPlaying,
  onStopAudio,
  onPlayAudio,
  onViewDetails,
  deviceStatus,
}) => {
  return (
    <TouchableOpacity
      className="flex-row bg-white mb-3 p-4 rounded-lg shadow"
      onPress={() => onViewDetails(device.id)}>
      <View className="flex-1">
        <Text className="text-base font-bold mb-1 text-gray-800">
          {device.name}
        </Text>
        <Text className="text-sm text-gray-500 mb-1">{deviceStatus}</Text>
        {audioFile ? (
          <Text
            className={`text-sm ${
              isPlaying ? 'text-green-600 font-bold' : 'text-blue-600'
            }`}>
            Audio: {audioFile.title} {isPlaying ? '(Playing)' : ''}
          </Text>
        ) : (
          <Text className="text-sm text-orange-600">No audio assigned</Text>
        )}
      </View>
      <View className="flex-row">
        {isPlaying ? (
          <TouchableOpacity
            className="bg-red-600 px-4 py-2 rounded-lg self-center mr-2"
            onPress={() => onStopAudio(device.id)}>
            <Text className="text-white font-bold">Stop</Text>
          </TouchableOpacity>
        ) : (
          audioFile && (
            <TouchableOpacity
              className="bg-blue-600 px-4 py-2 rounded-lg self-center mr-2"
              onPress={() => onPlayAudio(device.id)}>
              <Text className="text-white font-bold">Play</Text>
            </TouchableOpacity>
          )
        )}
        <TouchableOpacity
          className="bg-gray-600 px-4 py-2 rounded-lg self-center"
          onPress={() => onViewDetails(device.id)}>
          <Text className="text-white font-bold">Details</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

export default DeviceItem;
