import React from 'react';
import {View, Text, TextInput} from 'react-native';

interface InfoFieldProps {
  label: string;
  value: string;
  editable?: boolean;
  onChangeText?: (text: string) => void;
  onBlur?: () => void;
}

const InfoField: React.FC<InfoFieldProps> = ({
  label,
  value,
  editable = false,
  onChangeText,
  onBlur,
}) => {
  return (
    <View className="mb-4">
      <Text className="text-sm text-gray-500 mb-1">{label}</Text>
      {editable ? (
        <TextInput
          className="border border-gray-300 rounded-lg p-2 text-base bg-white"
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          placeholder={`Enter ${label.toLowerCase()}`}
        />
      ) : (
        <Text className="text-base font-medium">{value}</Text>
      )}
    </View>
  );
};

export default InfoField;
