import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import {ESPDevice} from '../../types/types';
import {AudioFile} from '../../services/audio';

interface PlayingAudioBannerProps {
  playingDevices: string[];
  devices: ESPDevice[];
  audioFiles: AudioFile[];
  onStopDeviceAudio: (deviceId: string) => void;
}

const PlayingAudioBanner: React.FC<PlayingAudioBannerProps> = ({
  playingDevices,
  devices,
  audioFiles,
  onStopDeviceAudio,
}) => {
  if (playingDevices.length === 0) {
    return null;
  }

  return (
    <View className="bg-green-100 p-3 mx-4 mt-2 rounded-lg">
      <Text className="text-green-800 font-bold">Now Playing:</Text>
      {playingDevices.map(deviceId => {
        const device = devices.find(d => d.id === deviceId);
        const audioFile = audioFiles.find(f => f.deviceId === deviceId);
        return (
          <View
            key={deviceId}
            className="flex-row justify-between items-center mt-1">
            <Text className="text-green-800">
              {device?.name || `Device ${deviceId}`}:{' '}
              {audioFile?.title || 'Unknown'}
            </Text>
            <TouchableOpacity
              className="bg-red-600 px-2 py-1 rounded"
              onPress={() => onStopDeviceAudio(deviceId)}>
              <Text className="text-white text-xs">Stop</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
};

export default PlayingAudioBanner;
