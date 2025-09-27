import React, {useState} from 'react';
import {View, Text, TouchableOpacity, ScrollView} from 'react-native';
import {AudioFile} from '../../services/audio';
import {ESPDevice} from '../../services/storage';

interface ESP32ButtonAssignmentProps {
  device: ESPDevice;
  audioFiles: AudioFile[];
  assignAudioToButton: (fileId: string, buttonId: string) => void;
  testButtonAudio: (buttonId: string) => void;
  navigateToAudioFiles: () => void;
}

const ESP32ButtonAssignment: React.FC<ESP32ButtonAssignmentProps> = ({
  device,
  audioFiles,
  assignAudioToButton,
  testButtonAudio,
  navigateToAudioFiles,
}) => {
  const [selectedButton, setSelectedButton] = useState<string>('1');
  const [showFilePicker, setShowFilePicker] = useState<boolean>(false);

  // Get the maximum button count (default to 8 for ESP32)
  const maxButtons = device.buttonCount || 8;

  // Generate button numbers array
  const buttonNumbers = Array.from({length: maxButtons}, (_, i) => String(i + 1));

  // Get assigned audio file for a specific button
  const getAssignedAudioForButton = (buttonId: string): AudioFile | undefined => {
    return audioFiles.find(
      file => file.deviceId === device.id && file.buttonId === buttonId
    );
  };

  // Handle file assignment to the selected button
  const handleFileSelection = (fileId: string) => {
    assignAudioToButton(fileId, selectedButton);
    setShowFilePicker(false);
  };

  return (
    <View className="bg-white p-4 m-4 rounded-lg shadow-sm">
      <Text className="text-lg font-bold mb-4 text-gray-800">
        ESP32 Button Audio Assignment
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
          {/* Button Selector */}
          <Text className="text-sm text-gray-500 mb-2">Select Button</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-4">
            <View className="flex-row">
              {buttonNumbers.map((buttonId) => {
                const assignedFile = getAssignedAudioForButton(buttonId);
                const isSelected = selectedButton === buttonId;

                return (
                  <TouchableOpacity
                    key={buttonId}
                    className={`mr-2 px-4 py-3 rounded-lg border-2 min-w-[80px] items-center ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600'
                        : assignedFile
                        ? 'bg-green-50 border-green-300'
                        : 'bg-gray-50 border-gray-300'
                    }`}
                    onPress={() => setSelectedButton(buttonId)}>
                    <Text
                      className={`font-bold text-sm ${
                        isSelected
                          ? 'text-white'
                          : assignedFile
                          ? 'text-green-700'
                          : 'text-gray-600'
                      }`}>
                      Button {buttonId}
                    </Text>
                    {assignedFile && !isSelected && (
                      <Text className="text-xs text-green-600 mt-1">✓</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Selected Button Info */}
          <View className="bg-gray-50 p-3 rounded-lg mb-4">
            <Text className="font-bold text-gray-800 mb-1">
              Button {selectedButton} Assignment
            </Text>
            {(() => {
              const assignedFile = getAssignedAudioForButton(selectedButton);
              if (assignedFile) {
                return (
                  <View>
                    <Text className="text-green-700 mb-2">
                      ♫ {assignedFile.title}
                    </Text>
                    <View className="flex-row">
                      <TouchableOpacity
                        className="bg-green-600 px-4 py-2 rounded mr-2"
                        onPress={() => testButtonAudio(selectedButton)}>
                        <Text className="text-white font-bold">Test</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        className="bg-blue-600 px-4 py-2 rounded"
                        onPress={() => setShowFilePicker(true)}>
                        <Text className="text-white font-bold">Change</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              } else {
                return (
                  <View>
                    <Text className="text-gray-500 mb-2">No audio assigned</Text>
                    <TouchableOpacity
                      className="bg-blue-600 px-4 py-2 rounded self-start"
                      onPress={() => setShowFilePicker(true)}>
                      <Text className="text-white font-bold">Assign Audio</Text>
                    </TouchableOpacity>
                  </View>
                );
              }
            })()}
          </View>

          {/* File Picker Modal */}
          {showFilePicker && (
            <View className="border border-gray-300 rounded-lg mb-4 bg-white">
              <View className="bg-blue-50 p-3 border-b border-gray-200">
                <View className="flex-row justify-between items-center">
                  <Text className="font-bold text-gray-800">
                    Select Audio for Button {selectedButton}
                  </Text>
                  <TouchableOpacity onPress={() => setShowFilePicker(false)}>
                    <Text className="text-blue-600 font-bold">Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {/* Fixed height container with proper scrolling */}
              <View style={{height: Math.min(audioFiles.length * 60 + 20, 250)}}>
                <ScrollView
                  style={{flex: 1}}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                  bounces={false}
                >
                  {audioFiles
                    .filter(file => !file.deviceId || (file.deviceId === device.id)) // Show unassigned files or files for this device
                    .map((file, index) => (
                      <TouchableOpacity
                        key={file.id}
                        className={`p-4 flex-row justify-between items-center ${
                          index < audioFiles.filter(f => !f.deviceId || (f.deviceId === device.id)).length - 1
                            ? 'border-b border-gray-100'
                            : ''
                        }`}
                        onPress={() => handleFileSelection(file.id)}
                        activeOpacity={0.7}
                      >
                        <View className="flex-1 mr-3">
                          <Text className="text-gray-800 font-medium" numberOfLines={1}>
                            {file.title}
                          </Text>
                          {file.buttonId && (
                            <Text className="text-xs text-gray-500 mt-1">
                              Currently: Button {file.buttonId}
                            </Text>
                          )}
                        </View>
                        <View className="bg-blue-600 px-3 py-1 rounded">
                          <Text className="text-white text-sm font-medium">Select</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              </View>
            </View>
          )}

          {/* Quick Assignment Summary */}
          <View className="bg-blue-50 p-3 rounded-lg">
            <Text className="font-bold text-gray-800 mb-2">Assignment Summary</Text>
            <View className="flex-row flex-wrap">
              {buttonNumbers.map((buttonId) => {
                const assignedFile = getAssignedAudioForButton(buttonId);
                return (
                  <View key={buttonId} className="mr-3 mb-1">
                    <Text className="text-xs text-gray-600">
                      B{buttonId}: {assignedFile ? '✓' : '○'}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text className="text-xs text-gray-500 mt-2">
              {buttonNumbers.filter(id => getAssignedAudioForButton(id)).length} of {maxButtons} buttons assigned
            </Text>
          </View>
        </>
      )}
    </View>
  );
};

export default ESP32ButtonAssignment;