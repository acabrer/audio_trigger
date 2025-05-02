import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import {AudioFile} from '../../services/audio';

interface AudioAssignmentCardProps {
  audioFiles: AudioFile[];
  selectedFileId: string | null;
  assignAudioFile: (fileId: string) => void;
  testAudio: () => void;
  stopAudio: () => void;
  isPlaying: boolean;
  navigateToAudioFiles: () => void;
}

const AudioAssignmentCard: React.FC<AudioAssignmentCardProps> = ({
  audioFiles,
  selectedFileId,
  assignAudioFile,
  testAudio,
  stopAudio,
  isPlaying,
  navigateToAudioFiles,
}) => {
  return (
    <View className="bg-white p-4 m-4 rounded-lg shadow-sm">
      <Text className="text-lg font-bold mb-4 text-gray-800">
        Assigned Audio
      </Text>

      {audioFiles.length === 0 ? (
        <View className="py-4 items-center">
          <Text className="text-gray-500 mb-2">No audio files available</Text>
          <TouchableOpacity
            className="bg-blue-600 p-3 rounded-lg"
            onPress={navigateToAudioFiles}>
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
  );
};

export default AudioAssignmentCard;
