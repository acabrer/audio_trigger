// src/screens/Home.tsx

import React, {useEffect, useState, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useAppDispatch, useAppSelector} from '../store/hooks';
import {addDevice, updateDevice} from '../store/slices/espDevices';
import UDPService, {ESPMessage, useUDPListener} from '../services/udp';
import AudioService from '../services/audio';
import {RootStackParamList} from '../types/types';
import {ESPDevice} from '../services/storage';

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
  const {autoStartListener, udpPort} = useAppSelector(state => state.settings);

  // Local state - use refs for values that shouldn't trigger rerenders
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastMessageTimestamp, setLastMessageTimestamp] = useState(0);
  const [lastMessage, setLastMessage] = useState<ESPMessage | null>(null);
  const [deviceUpdateCount, setDeviceUpdateCount] = useState(0);
  // Track active sounds
  const [playingDevices, setPlayingDevices] = useState<string[]>([]);

  // Use the UDP listener hook with stable references
  const {isListening, startListener, stopListener, error} = useUDPListener();

  // Check for active sounds periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const currentPlaying = AudioService.getPlayingDevices();

      // Only update state if the playing devices have changed
      if (
        JSON.stringify(currentPlaying.sort()) !==
        JSON.stringify(playingDevices.sort())
      ) {
        setPlayingDevices(currentPlaying);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [playingDevices]);

  // Handle ESP button press - debounce device updates
  const handleESPMessage = useCallback(
    async (message: ESPMessage) => {
      console.log('Home screen received ESP message:', message);

      // Update last message - always show the latest
      setLastMessage(message);
      setLastMessageTimestamp(Date.now());

      // Check if we already know this device
      const existingDevice = devices.find(
        device => device.id === message.deviceId,
      );

      // Only update Redux store on button press or for new devices
      if (!existingDevice || message.buttonPressed) {
        if (existingDevice) {
          // Update last seen timestamp and battery level
          dispatch(
            updateDevice({
              id: message.deviceId,
              lastSeen: message.timestamp,
              batteryLevel: message.batteryLevel,
            }),
          );
          // Force a device list refresh but limit the frequency
          setDeviceUpdateCount(prev => prev + 1);
        } else {
          // Add new device
          dispatch(
            addDevice({
              id: message.deviceId,
              name: `ESP Button ${message.deviceId}`,
              lastSeen: message.timestamp,
              batteryLevel: message.batteryLevel,
            }),
          );
          // Force a device list refresh
          setDeviceUpdateCount(prev => prev + 1);
        }
      }

      // If button was pressed, play associated audio - now allows multiple sounds simultaneously
      if (message.buttonPressed) {
        console.log('Button was pressed, attempting to play audio...');
        const success = await AudioService.playAudioForDevice(message.deviceId);
        if (!success) {
          console.log('No audio file associated with this device.');
        } else {
          console.log('Successfully played audio for device');

          // Update playing devices
          setPlayingDevices(prev => {
            if (!prev.includes(message.deviceId)) {
              return [...prev, message.deviceId];
            }
            return prev;
          });
        }
      }
    },
    [devices, dispatch],
  );

  // Initialize services once and avoid re-initializing
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      if (!mounted) return;
      setIsLoading(true);

      try {
        // Initialize audio service
        await AudioService.initialize();
        console.log('Audio service initialized');

        // Initialize UDP service
        await UDPService.initialize();
        console.log(
          'UDP service initialized on port',
          UDPService.getCurrentPort(),
        );

        if (!mounted) return;
        setIsInitialized(true);

        // Start UDP service if autoStart is enabled (only on first mount)
        if (autoStartListener) {
          console.log('Auto-starting UDP listener...');
          setTimeout(() => {
            if (mounted) {
              startListener();
              console.log('UDP listener started');
            }
          }, 500);
        }
      } catch (err) {
        console.error('Error during initialization:', err);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initialize();

    // Cleanup on unmount
    return () => {
      mounted = false;
      stopListener();
    };
  }, []); // Empty dependency array - only run once

  // Subscribe to UDP messages when initialized
  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    console.log('Subscribing to UDP messages');

    // Subscribe to UDP messages
    const unsubscribe = UDPService.subscribe(handleESPMessage);

    return () => {
      unsubscribe();
    };
  }, [isInitialized, handleESPMessage]);

  // Toggle UDP listener with stable reference
  const toggleListener = useCallback(() => {
    console.log('Toggle listener clicked, current state:', isListening);

    if (isListening) {
      stopListener();
    } else {
      startListener();
    }
  }, [isListening, startListener, stopListener]);

  // Global stop audio function - stops all playing sounds
  const stopAllAudio = useCallback(() => {
    AudioService.stopPlayback();
    setPlayingDevices([]);
  }, []);

  // Function to stop audio for a specific device
  const stopDeviceAudio = useCallback((deviceId: string) => {
    AudioService.stopDeviceAudio(deviceId);
    setPlayingDevices(prev => prev.filter(id => id !== deviceId));
  }, []);

  // Get device status - memoize to reduce recalculations
  const getDeviceStatus = useCallback(
    (deviceId: string) => {
      const device = devices.find(d => d.id === deviceId);
      if (!device) {
        return 'Unknown';
      }

      const audioFile = files.find(f => f.deviceId === deviceId);

      if (!audioFile) {
        return 'No audio assigned';
      }

      const lastSeen = device.lastSeen ? new Date(device.lastSeen) : null;
      const timeAgo = lastSeen
        ? Math.floor((Date.now() - lastSeen.getTime()) / 60000) === 0
          ? 'Just now'
          : `${Math.floor((Date.now() - lastSeen.getTime()) / 60000)} min ago`
        : 'Never';

      return `Last seen: ${timeAgo}`;
    },
    [devices, files],
  );

  // Function to test audio for a device
  const testAudio = useCallback(async (deviceId: string) => {
    console.log('Testing audio for device:', deviceId);
    const success = await AudioService.playAudioForDevice(deviceId);
    if (!success) {
      console.log(
        'No audio file associated with this device or playback failed',
      );
    } else {
      // Update playing devices
      setPlayingDevices(prev => {
        if (!prev.includes(deviceId)) {
          return [...prev, deviceId];
        }
        return prev;
      });
    }
  }, []);

  // Check if a device sound is playing
  const isDevicePlaying = useCallback(
    (deviceId: string) => {
      return playingDevices.includes(deviceId);
    },
    [playingDevices],
  );

  // Memoize the render function to prevent recreating on every render
  const renderDeviceItem = useCallback(
    ({item}: {item: ESPDevice}) => {
      const audioFile = files.find(f => f.deviceId === item.id);
      const devicePlaying = isDevicePlaying(item.id);

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
              <Text
                className={`text-sm ${
                  devicePlaying ? 'text-green-600 font-bold' : 'text-blue-600'
                }`}>
                Audio: {audioFile.title} {devicePlaying ? '(Playing)' : ''}
              </Text>
            )}
          </View>
          <View className="flex-row">
            {devicePlaying ? (
              <TouchableOpacity
                className="bg-red-600 px-4 py-2 rounded-lg self-center mr-2"
                onPress={() => stopDeviceAudio(item.id)}>
                <Text className="text-white font-bold">Stop</Text>
              </TouchableOpacity>
            ) : (
              audioFile && (
                <TouchableOpacity
                  className="bg-blue-600 px-4 py-2 rounded-lg self-center mr-2"
                  onPress={() => testAudio(item.id)}>
                  <Text className="text-white font-bold">Play</Text>
                </TouchableOpacity>
              )
            )}
            <TouchableOpacity
              className="bg-gray-600 px-4 py-2 rounded-lg self-center"
              onPress={() =>
                navigation.navigate('DeviceDetails', {deviceId: item.id})
              }>
              <Text className="text-white font-bold">Details</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    },
    [
      files,
      getDeviceStatus,
      navigation,
      testAudio,
      stopDeviceAudio,
      isDevicePlaying,
    ],
  );

  // Memoize the list key extractor
  const keyExtractor = useCallback((item: ESPDevice) => item.id, []);

  // Memoize the list empty component
  const ListEmptyComponent = useMemo(
    () => (
      <View className="p-8 items-center justify-center bg-gray-200 rounded-lg">
        <Text className="text-center text-gray-600 leading-6">
          No ESP devices found. Make sure your devices are powered on and
          connected to the same network.
        </Text>
      </View>
    ),
    [],
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <StatusBar barStyle="dark-content" />

      <View className="flex-row justify-between items-center p-4 border-b border-gray-200">
        <Text className="text-xl font-bold text-gray-900">
          ESP Audio Trigger
        </Text>
        <View className="flex-row">
          {/* Only show Stop All button if sounds are playing */}
          {playingDevices.length > 0 && (
            <TouchableOpacity
              className="px-4 py-2 mr-2 rounded-lg bg-red-600"
              onPress={stopAllAudio}>
              <Text className="text-white font-bold">Stop All</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            className={`px-4 py-2 rounded-lg ${
              isListening ? 'bg-green-600' : 'bg-gray-600'
            }`}
            onPress={toggleListener}
            disabled={isLoading}>
            <Text className="text-white font-bold">
              {isLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : isListening ? (
                'Listening'
              ) : (
                'Start Listening'
              )}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Now Playing Banner - show if sounds are playing */}
      {playingDevices.length > 0 && (
        <View className="bg-green-100 p-3 mx-4 mt-2 rounded-lg">
          <Text className="text-green-800 font-bold">Now Playing:</Text>
          {playingDevices.map(deviceId => {
            const device = devices.find(d => d.id === deviceId);
            const audioFile = files.find(f => f.deviceId === deviceId);
            return (
              <View
                key={deviceId}
                className="flex-row justify-between items-center mt-1">
                <Text className="text-green-800">
                  {device?.name || `Device ${deviceId}`}:{' '}
                  {audioFile?.title || 'Unknown'}
                </Text>
                <TouchableOpacity
                  className="bg-red-600 px-2 py-1 rounded"
                  onPress={() => stopDeviceAudio(deviceId)}>
                  <Text className="text-white text-xs">Stop</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {/* Port information */}
      <View className="bg-blue-50 p-3 mx-4 mt-2 rounded-lg">
        <Text className="text-blue-800">UDP Port: {udpPort}</Text>
        <Text className="text-blue-800">
          Status: {isListening ? 'Listening for ESP devices' : 'Not listening'}
        </Text>
      </View>

      {error && (
        <View className="bg-red-100 p-3 mx-4 mt-2 rounded-lg">
          <Text className="text-red-800">Error: {error}</Text>
        </View>
      )}

      {/* Last message info */}
      {lastMessage && (
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
      )}

      <View className="flex-1 p-4">
        <Text className="text-lg font-bold mb-4 text-gray-800">
          Connected ESP Devices
        </Text>
        {isLoading ? (
          <View className="items-center justify-center p-4">
            <ActivityIndicator size="large" color="#3498db" />
            <Text className="text-gray-600 mt-2">Initializing services...</Text>
          </View>
        ) : (
          <FlatList
            data={devices}
            renderItem={renderDeviceItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={{paddingBottom: 16}}
            ListEmptyComponent={ListEmptyComponent}
            extraData={[deviceUpdateCount, playingDevices]} // Re-render when these change
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
