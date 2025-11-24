import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  TextInput,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Slider from '@react-native-community/slider';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useAppDispatch, useAppSelector} from '../store/hooks';
import {
  updateSettings,
  clearLastConnectedDevices,
} from '../store/slices/settings';
import StorageService from '../services/storage';
import {RootStackParamList} from '../types/types';
import UDPService from '../services/udp';
import SoundPlayer from 'react-native-sound-player'; // Changed from TrackPlayer
import {useBluetoothLE} from '../services/bluetoothLE';

type SettingsScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Settings'
>;

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const dispatch = useAppDispatch();

  // Get settings from Redux state
  const settings = useAppSelector(state => state.settings);

  // Bluetooth LE hook
  const {scanDevices, connect, disconnect, isConnected, device, isScanning: bleScanning} =
    useBluetoothLE();

  // Local state for input values
  const [portValue, setPortValue] = useState(settings.udpPort.toString());
  const [volumeValue, setVolumeValue] = useState(settings.maxVolume);
  const [autoStartValue, setAutoStartValue] = useState(
    settings.autoStartListener,
  );
  const [darkModeValue, setDarkModeValue] = useState(settings.darkMode);
  const [connectionModeValue, setConnectionModeValue] = useState<
    'udp' | 'ble'
  >(settings.connectionMode || 'udp');

  // Debug log to verify Bluetooth UI is loaded
  useEffect(() => {
    console.log('[Settings] Connection mode:', settings.connectionMode);
    console.log('[Settings] Connection mode value:', connectionModeValue);
  }, [settings.connectionMode, connectionModeValue]);

  // BLE device scanning state
  const [availableDevices, setAvailableDevices] = useState<any[]>([]);

  // Track if settings have been modified
  const [isModified, setIsModified] = useState(false);

  // Scan for BLE devices
  const handleScanDevices = async () => {
    try {
      const devices = await scanDevices();
      setAvailableDevices(devices);
      if (devices.length === 0) {
        Alert.alert(
          'No Devices Found',
          'No ESP32 devices found. Make sure your ESP32 is powered on and advertising.',
        );
      }
    } catch (error) {
      Alert.alert('Scan Error', 'Failed to scan for BLE devices');
    }
  };

  // Connect to BLE device
  const handleConnectBLE = async (deviceId: string) => {
    try {
      const success = await connect(deviceId);
      if (success) {
        Alert.alert('Connected', 'Successfully connected to ESP32 via BLE');
        setIsModified(true);
      } else {
        Alert.alert('Connection Failed', 'Could not connect to device');
      }
    } catch (error) {
      Alert.alert('Connection Error', 'An error occurred while connecting');
    }
  };

  // Apply settings changes
  const applySettings = async () => {
    const updatedSettings = {
      udpPort: parseInt(portValue, 10),
      autoStartListener: autoStartValue,
      maxVolume: volumeValue,
      darkMode: darkModeValue,
      connectionMode: connectionModeValue,
      pairedBluetoothDevice: device?.id,
    };

    // Validate the port number
    if (
      isNaN(updatedSettings.udpPort) ||
      updatedSettings.udpPort < 1024 ||
      updatedSettings.udpPort > 65535
    ) {
      Alert.alert(
        'Invalid Port',
        'Please enter a valid port number (1024-65535)',
      );
      return;
    }

    // Save settings
    const success = await StorageService.saveSettings(updatedSettings);

    if (success) {
      // Update Redux state
      dispatch(updateSettings(updatedSettings));

      // Apply volume setting to the audio player
      try {
        SoundPlayer.setVolume(volumeValue); // Changed from TrackPlayer
      } catch (error) {
        console.error('Error setting volume:', error);
      }

      // If UDP port changed, restart the UDP service
      if (updatedSettings.udpPort !== settings.udpPort) {
        UDPService.stop();
        UDPService.initialize();
      }

      setIsModified(false);
      Alert.alert('Success', 'Settings saved successfully');
    } else {
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  // Reset app data (for debugging)
  const resetAppData = () => {
    Alert.alert(
      'Reset App Data',
      'This will delete all app data including devices and audio files. This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            const success = await StorageService.clearAllStorage();
            if (success) {
              Alert.alert(
                'Success',
                'All app data has been reset. Please restart the app.',
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.navigate('Home'),
                  },
                ],
              );
            } else {
              Alert.alert('Error', 'Failed to reset app data');
            }
          },
        },
      ],
    );
  };

  // Handle input changes
  useEffect(() => {
    const checkModified = () => {
      if (
        parseInt(portValue, 10) !== settings.udpPort ||
        autoStartValue !== settings.autoStartListener ||
        volumeValue !== settings.maxVolume ||
        darkModeValue !== settings.darkMode ||
        connectionModeValue !== (settings.connectionMode || 'udp') ||
        device?.id !== settings.pairedBluetoothDevice
      ) {
        setIsModified(true);
      } else {
        setIsModified(false);
      }
    };

    checkModified();
  }, [
    portValue,
    autoStartValue,
    volumeValue,
    darkModeValue,
    connectionModeValue,
    device,
    settings,
  ]);

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <ScrollView>
        {/* Header */}
        <View className="bg-white p-4 border-b border-gray-200 flex-row items-center justify-between">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="p-2 -ml-2">
            <Text className="text-blue-600 text-base">Back</Text>
          </TouchableOpacity>
          <Text className="text-lg font-bold text-center flex-1">Settings</Text>
          <View style={{width: 50}} />
        </View>

        {/* Settings Sections */}
        <View className="p-4">
          {/* Connection Mode */}
          <View className="bg-blue-50 p-4 rounded-lg shadow-sm mb-4 border-2 border-blue-500">
            <Text className="text-lg font-bold mb-4 text-gray-800">
              🔵 Connection Mode (NEW)
            </Text>

            <View className="flex-row justify-between items-center mb-2">
              <View className="flex-1">
                <Text className="text-base text-gray-800">
                  {connectionModeValue === 'udp' ? 'UDP Network' : 'BLE (Bluetooth Low Energy)'}
                </Text>
                <Text className="text-xs text-gray-400 mt-1">
                  {connectionModeValue === 'udp'
                    ? 'Connect via WiFi (supports multiple devices, 30-80ms latency)'
                    : 'Direct BLE connection (single device, 15-30ms latency ⚡)'}
                </Text>
              </View>
              <Switch
                value={connectionModeValue === 'ble'}
                onValueChange={value => {
                  setConnectionModeValue(value ? 'ble' : 'udp');
                }}
                trackColor={{false: '#767577', true: '#3498db'}}
                thumbColor={
                  connectionModeValue === 'ble' ? '#fff' : '#f4f3f4'
                }
              />
            </View>

            {/* BLE Device Picker */}
            {connectionModeValue === 'ble' && (
              <View className="mt-4 pt-4 border-t border-gray-200">
                <Text className="text-sm text-gray-600 mb-2">
                  BLE Device
                </Text>

                {isConnected && device ? (
                  <View className="bg-green-50 p-3 rounded-lg mb-2">
                    <Text className="text-green-800 font-semibold">
                      Connected: {device.name || 'ESP32 Touch Sensor'}
                    </Text>
                    <Text className="text-green-600 text-xs mt-1">
                      ID: {device.id}
                    </Text>
                    <TouchableOpacity
                      className="mt-2 bg-red-100 p-2 rounded"
                      onPress={disconnect}>
                      <Text className="text-red-600 text-center text-sm">
                        Disconnect
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    className="bg-blue-100 p-3 rounded-lg mb-2"
                    onPress={handleScanDevices}
                    disabled={bleScanning}>
                    {bleScanning ? (
                      <View className="flex-row items-center justify-center">
                        <ActivityIndicator size="small" color="#3498db" />
                        <Text className="text-blue-600 ml-2">Scanning...</Text>
                      </View>
                    ) : (
                      <Text className="text-blue-600 text-center">
                        Scan for ESP32 BLE Devices
                      </Text>
                    )}
                  </TouchableOpacity>
                )}

                {/* Available Devices List */}
                {availableDevices.length > 0 && !isConnected && (
                  <View className="mt-2">
                    <Text className="text-xs text-gray-500 mb-2">
                      Available Devices:
                    </Text>
                    {availableDevices.map(dev => (
                      <TouchableOpacity
                        key={dev.id}
                        className="bg-gray-50 p-3 rounded-lg mb-2"
                        onPress={() => handleConnectBLE(dev.id)}>
                        <Text className="text-gray-800 font-medium">
                          {dev.name || dev.localName || 'ESP32 Touch Sensor'}
                        </Text>
                        <Text className="text-gray-500 text-xs">
                          ID: {dev.id}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Network Settings (only show when UDP mode) */}
          {connectionModeValue === 'udp' && (
            <View className="bg-white p-4 rounded-lg shadow-sm mb-4">
              <Text className="text-lg font-bold mb-4 text-gray-800">
                Network Settings
              </Text>

            <View className="mb-4">
              <Text className="text-sm text-gray-500 mb-1">UDP Port</Text>
              <TextInput
                className="border border-gray-300 rounded-lg p-2 text-base bg-white"
                value={portValue}
                onChangeText={setPortValue}
                keyboardType="number-pad"
                placeholder="Enter UDP port"
              />
              <Text className="text-xs text-gray-400 mt-1">
                Default: 8888. Restart required if changed.
              </Text>
            </View>

            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-base text-gray-800">
                Auto-start UDP Listener
              </Text>
              <Switch
                value={autoStartValue}
                onValueChange={setAutoStartValue}
                trackColor={{false: '#767577', true: '#3498db'}}
                thumbColor={autoStartValue ? '#fff' : '#f4f3f4'}
              />
            </View>
            <Text className="text-xs text-gray-400">
              Automatically start listening for ESP devices when app launches
            </Text>
          </View>
          )}

          {/* Audio Settings */}
          <View className="bg-white p-4 rounded-lg shadow-sm mb-4">
            <Text className="text-lg font-bold mb-4 text-gray-800">
              Audio Settings
            </Text>

            <View className="mb-4">
              <Text className="text-base text-gray-800 mb-2">
                Maximum Volume: {Math.round(volumeValue * 100)}%
              </Text>
              <Slider
                value={volumeValue}
                onValueChange={setVolumeValue}
                minimumValue={0}
                maximumValue={1}
                step={0.05}
                minimumTrackTintColor="#3498db"
                maximumTrackTintColor="#d3d3d3"
              />
            </View>
          </View>

          {/* Display Settings */}
          <View className="bg-white p-4 rounded-lg shadow-sm mb-4">
            <Text className="text-lg font-bold mb-4 text-gray-800">
              Display Settings
            </Text>

            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-base text-gray-800">Dark Mode</Text>
              <Switch
                value={darkModeValue}
                onValueChange={setDarkModeValue}
                trackColor={{false: '#767577', true: '#3498db'}}
                thumbColor={darkModeValue ? '#fff' : '#f4f3f4'}
              />
            </View>
            <Text className="text-xs text-gray-400">
              Enable dark theme for the app interface
            </Text>
          </View>

          {/* Device History */}
          <View className="bg-white p-4 rounded-lg shadow-sm mb-4">
            <Text className="text-lg font-bold mb-4 text-gray-800">
              Device History
            </Text>

            <Text className="text-base text-gray-800 mb-2">
              Recently Connected Devices: {settings.lastConnectedDevices.length}
            </Text>

            <TouchableOpacity
              className="bg-gray-200 p-2 rounded-lg"
              onPress={() => {
                Alert.alert(
                  'Clear History',
                  'This will clear the list of recently connected devices.',
                  [
                    {
                      text: 'Cancel',
                      style: 'cancel',
                    },
                    {
                      text: 'Clear',
                      style: 'destructive',
                      onPress: () => dispatch(clearLastConnectedDevices()),
                    },
                  ],
                );
              }}>
              <Text className="text-center text-gray-800">
                Clear Device History
              </Text>
            </TouchableOpacity>
          </View>

          {/* Advanced Settings */}
          <View className="bg-white p-4 rounded-lg shadow-sm mb-4">
            <Text className="text-lg font-bold mb-4 text-red-600">
              Advanced Settings
            </Text>

            <TouchableOpacity
              className="bg-red-100 p-3 rounded-lg mb-2"
              onPress={resetAppData}>
              <Text className="text-center text-red-600 font-bold">
                Reset App Data
              </Text>
            </TouchableOpacity>
            <Text className="text-xs text-gray-400 mb-2">
              This will delete all app data including devices and audio files.
              This action cannot be undone.
            </Text>
          </View>
        </View>

        {/* Save Button */}
        {isModified && (
          <View className="px-4 pb-8">
            <TouchableOpacity
              className="bg-blue-600 p-4 rounded-lg"
              onPress={applySettings}>
              <Text className="text-center text-white font-bold">
                Save Settings
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default SettingsScreen;
