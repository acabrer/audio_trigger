import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import {AudioFile} from '../../services/audio';

interface LoopingFilesSectionProps {
  loopingFiles: string[];
  files: AudioFile[];
  onStopAllLoops: () => void;
  onStopLoop: (fileId: string) => void;
}

const LoopingFilesSection: React.FC<LoopingFilesSectionProps> = ({
  loopingFiles,
  files,
  onStopAllLoops,
  onStopLoop,
}) => {
  if (loopingFiles.length === 0) {
    return null;
  }

  // Get the file objects that are looping
  const loopingFileObjects = files.filter(file =>
    loopingFiles.includes(file.id),
  );

  return (
    <View className="bg-green-50 p-3 mx-4 mt-2 mb-4 rounded-lg">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-green-800 font-bold">Looping Audio Files:</Text>
        <TouchableOpacity
          className="bg-red-600 px-3 py-1 rounded"
          onPress={onStopAllLoops}>
          <Text className="text-white font-bold">Stop All Loops</Text>
        </TouchableOpacity>
      </View>

      {loopingFileObjects.map(file => (
        <View
          key={file.id}
          className="flex-row justify-between items-center mt-1">
          <Text className="text-green-800">♫ {file.title}</Text>
          <TouchableOpacity
            className="bg-red-600 px-2 py-1 rounded"
            onPress={() => onStopLoop(file.id)}>
            <Text className="text-white text-xs">Stop</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
};

export default LoopingFilesSection;
