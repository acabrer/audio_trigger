import React from 'react';
import {View, Text} from 'react-native';
import InfoField from '../common/InfoField';
import {ESPDevice} from '../../services/storage';

interface DeviceInfoCardProps {
  device: ESPDevice;
  deviceName: string;
  setDeviceName: (name: string) => void;
  saveDeviceName: () => void;
  formatBatteryLevel: (level?: number) => string;
  formatLastSeen: (timestamp?: number) => string;
}

const DeviceInfoCard: React.FC<DeviceInfoCardProps> = ({
  device,
  deviceName,
  setDeviceName,
  saveDeviceName,
  formatBatteryLevel,
  formatLastSeen,
}) => {
  return (
    <View className="bg-white p-4 m-4 rounded-lg shadow-sm">
      <Text className="text-lg font-bold mb-4 text-gray-800">
        Device Information
      </Text>

      <InfoField label="Device ID" value={device.id} />

      <InfoField
        label="Name"
        value={deviceName}
        editable={true}
        onChangeText={setDeviceName}
        onBlur={saveDeviceName}
      />

      <InfoField
        label="Battery Level"
        value={formatBatteryLevel(device.batteryLevel)}
      />

      <InfoField label="Last Seen" value={formatLastSeen(device.lastSeen)} />
    </View>
  );
};

export default DeviceInfoCard;
