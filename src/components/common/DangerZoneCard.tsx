import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';

interface DangerZoneCardProps {
  title: string;
  actionLabel: string;
  onAction: () => void;
}

const DangerZoneCard: React.FC<DangerZoneCardProps> = ({
  title,
  actionLabel,
  onAction,
}) => {
  return (
    <View className="bg-white p-4 m-4 rounded-lg shadow-sm">
      <Text className="text-lg font-bold mb-4 text-red-600">{title}</Text>

      <TouchableOpacity
        className="bg-red-600 p-3 rounded-lg"
        onPress={onAction}>
        <Text className="text-white text-center font-bold">{actionLabel}</Text>
      </TouchableOpacity>
    </View>
  );
};

export default DangerZoneCard;
