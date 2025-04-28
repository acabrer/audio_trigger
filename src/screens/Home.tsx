// Home.tsx

import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useAppDispatch, useAppSelector} from '../store/hooks';
import {addDevice, updateDevice} from '../store/slices/espDevices';
import UDPService, {ESPMessage, useUDPListener} from '../services/udp';
import AudioService from '../services/audio';
import {RootStackParamList} from '../types/types';

type HomeScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Home'
>;

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const dispatch = useAppDispatch();

  // Get state from Redux
  const {devices} = useAppSelector(state => state.espDevices);
  const {files} = useAppSelector(state => state.audioFiles);
  const {autoStartListener} = useAppSelector(state => state.settings);

  // Local state
  const [isInitialized, setIsInitialized] = useState(false);

  // Use the UDP listener hook
  const {isListening, startListener, stopListener, error} = useUDPListener();

  // Handle ESP button press - defined with useCallback to use in dependency array
  const handleESPMessage = useCallback(
    async (message: ESPMessage) => {
      // Check if we already know this device
      const existingDevice = devices.find(
        device => device.id === message.deviceId,
      );

      if (existingDevice) {
        // Update last seen timestamp and battery level
        dispatch(
          updateDevice({
            id: message.deviceId,
            lastSeen: message.timestamp,
            batteryLevel: message.batteryLevel,
          }),
        );
      } else {
        // Add new device
        dispatch(
          addDevice({
            id: message.deviceId,
            name: `ESP Device ${message.deviceId.slice(-4)}`,
            lastSeen: message.timestamp,
            batteryLevel: message.batteryLevel,
          }),
        );
      }

      // If button was pressed, play associated audio
      if (message.buttonPressed) {
        const success = await AudioService.playAudioForDevice(message.deviceId);
        if (!success) {
          console.log('No audio file associated with this device.');
        }
      }
    },
    [devices, dispatch],
  );

  // Initialize services
  useEffect(() => {
    const initialize = async () => {
      // Initialize audio service
      await AudioService.initialize();

      // Start UDP service if autoStart is enabled
      if (autoStartListener) {
        startListener();
      }

      setIsInitialized(true);
    };

    initialize();

    // Cleanup on unmount
    return () => {
      stopListener();
    };
  }, [autoStartListener, startListener, stopListener]);

  // Handle UDP messages using the service singleton
  useEffect(() => {
    if (!isInitialized) return;

    // Subscribe to UDP messages
    const unsubscribe = UDPService.subscribe(handleESPMessage);
    UDPService.initialize();

    return () => {
      unsubscribe();
    };
  }, [isInitialized, handleESPMessage]);

  // Toggle UDP listener
  const toggleListener = () => {
    if (isListening) {
      stopListener();
    } else {
      startListener();
    }
  };

  // Get device status
  const getDeviceStatus = (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device) return 'Unknown';

    const audioFile = files.find(f => f.deviceId === deviceId);
    if (!audioFile) return 'No audio assigned';

    const lastSeen = device.lastSeen ? new Date(device.lastSeen) : null;
    const timeAgo = lastSeen
      ? `${Math.floor((Date.now() - lastSeen.getTime()) / 60000)} min ago`
      : 'Never';

    return `Last seen: ${timeAgo}`;
  };

  // Render each device item
  const renderDeviceItem = ({item}: {item: {id: string; name: string}}) => {
    const audioFile = files.find(f => f.deviceId === item.id);

    return (
      <TouchableOpacity
        className="flex-row bg-white mb-3 p-4 rounded-lg shadow"
        onPress={() =>
          navigation.navigate('DeviceDetails', {deviceId: item.id})
        }>
        <View className="flex-1">
          <Text className="text-base font-bold mb-1 text-gray-800">
            {item.name}
          </Text>
          <Text className="text-sm text-gray-500 mb-1">
            {getDeviceStatus(item.id)}
          </Text>
          {audioFile && (
            <Text className="text-sm text-blue-600">
              Audio: {audioFile.title}
            </Text>
          )}
        </View>
        <TouchableOpacity
          className="bg-blue-600 px-4 py-2 rounded-lg self-center"
          onPress={() => AudioService.playAudioForDevice(item.id)}>
          <Text className="text-white font-bold">Test</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <StatusBar barStyle="dark-content" />

      <View className="flex-row justify-between items-center p-4 border-b border-gray-200">
        <Text className="text-xl font-bold text-gray-900">
          ESP Audio Trigger
        </Text>
        <TouchableOpacity
          className={`px-4 py-2 rounded-lg ${
            isListening ? 'bg-green-600' : 'bg-gray-600'
          }`}
          onPress={toggleListener}>
          <Text className="text-white font-bold">
            {isListening ? 'Listening' : 'Start Listening'}
          </Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View className="bg-red-100 p-4 mx-4 mt-4 rounded-lg">
          <Text className="text-red-800">Error: {error}</Text>
        </View>
      )}

      <View className="flex-1 p-4">
        <Text className="text-lg font-bold mb-4 text-gray-800">
          Connected ESP Devices
        </Text>
        {devices.length === 0 ? (
          <View className="p-8 items-center justify-center bg-gray-200 rounded-lg">
            <Text className="text-center text-gray-600 leading-6">
              No ESP devices found. Make sure your devices are powered on and
              connected to the same network.
            </Text>
          </View>
        ) : (
          <FlatList
            data={devices}
            renderItem={renderDeviceItem}
            keyExtractor={item => item.id}
            contentContainerStyle={{paddingBottom: 16}}
          />
        )}
      </View>

      <View className="flex-row border-t border-gray-200 p-4">
        <TouchableOpacity
          className="flex-1 bg-gray-800 p-4 rounded-lg mx-2 items-center"
          onPress={() => navigation.navigate('AudioFiles')}>
          <Text className="text-white font-bold">Manage Audio Files</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 bg-gray-800 p-4 rounded-lg mx-2 items-center"
          onPress={() => navigation.navigate('Settings')}>
          <Text className="text-white font-bold">Settings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default HomeScreen;
