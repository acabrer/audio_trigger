import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';

interface FooterNavigationProps {
  onManageAudioPress: () => void;
  onSettingsPress: () => void;
}

const FooterNavigation: React.FC<FooterNavigationProps> = ({
  onManageAudioPress,
  onSettingsPress,
}) => {
  return (
    <View className="flex-row border-t border-gray-200 p-4">
      <TouchableOpacity
        className="flex-1 bg-gray-800 p-4 rounded-lg mx-2 items-center"
        onPress={onManageAudioPress}>
        <Text className="text-white font-bold">Manage Audio Files</Text>
      </TouchableOpacity>
      <TouchableOpacity
        className="flex-1 bg-gray-800 p-4 rounded-lg mx-2 items-center"
        onPress={onSettingsPress}>
        <Text className="text-white font-bold">Settings</Text>
      </TouchableOpacity>
    </View>
  );
};

export default FooterNavigation;
