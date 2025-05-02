import React from 'react';
import {View, Text} from 'react-native';

interface UDPStatusCardProps {
  port: number;
  isListening: boolean;
  error: string | null;
}

const UDPStatusCard: React.FC<UDPStatusCardProps> = ({
  port,
  isListening,
  error,
}) => {
  return (
    <>
      <View className="bg-blue-50 p-3 mx-4 mt-2 rounded-lg">
        <Text className="text-blue-800">UDP Port: {port}</Text>
        <Text className="text-blue-800">
          Status: {isListening ? 'Listening for ESP devices' : 'Not listening'}
        </Text>
      </View>

      {error && (
        <View className="bg-red-100 p-3 mx-4 mt-2 rounded-lg">
          <Text className="text-red-800">Error: {error}</Text>
        </View>
      )}
    </>
  );
};

export default UDPStatusCard;
