import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';

interface HeaderProps {
  title: string;
  rightAction?: () => void;
  rightActionTitle?: string;
  rightActionColor?: string;
  showBackButton?: boolean;
  onBackPress?: () => void;
}

const Header: React.FC<HeaderProps> = ({
  title,
  rightAction,
  rightActionTitle,
  rightActionColor = '#3498db',
  showBackButton = false,
  onBackPress,
}) => {
  return (
    <View className="flex-row justify-between items-center p-4 border-b border-gray-200">
      {showBackButton ? (
        <TouchableOpacity onPress={onBackPress} className="p-2 -ml-2">
          <Text className="text-blue-600 text-base">Back</Text>
        </TouchableOpacity>
      ) : (
        <Text className="text-xl font-bold text-gray-900">{title}</Text>
      )}

      {rightAction && (
        <TouchableOpacity
          className={`px-4 py-2 rounded-lg bg-[${rightActionColor}]`}
          onPress={rightAction}>
          <Text className="text-white font-bold">{rightActionTitle}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default Header;
