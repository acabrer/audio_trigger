import React from 'react';
import {View, Text} from 'react-native';
import {ESPMessage} from '../../services/udp';

interface LastMessageCardProps {
  lastMessage: ESPMessage | null;
}

const LastMessageCard: React.FC<LastMessageCardProps> = ({lastMessage}) => {
  if (!lastMessage) {
    return null;
  }

  return (
    <View className="bg-green-50 p-3 mx-4 mt-2 mb-4 rounded-lg">
      <Text className="text-green-800 font-bold">Last Message:</Text>
      <Text className="text-green-800">
        Device: {lastMessage.deviceId}, Button:{' '}
        {lastMessage.buttonPressed ? 'Pressed' : 'Released'}
      </Text>
      <Text className="text-green-800">
        Time: {new Date(lastMessage.timestamp).toLocaleTimeString()}
      </Text>
    </View>
  );
};

export default LastMessageCard;
