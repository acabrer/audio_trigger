import React, {useEffect, useState, useCallback, useRef} from 'react';
import {SafeAreaView, StatusBar} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useAppDispatch, useAppSelector} from '../store/hooks';
import {addDevice, updateDevice} from '../store/slices/espDevices';
import UDPService, {ESPMessage, useUDPListener} from '../services/udp';
import BluetoothLEService, {
  useBluetoothLE,
} from '../services/bluetoothLE';
import AudioService from '../services/audio';
import {RootStackParamList} from '../types/types';
import {setFiles} from '../store/slices/audioFiles';

// Import our new components
import Header from '../components/Header';
import UDPStatusCard from '../components/UDPStatusCard';
import DeviceList from '../components/devices/DeviceList';
import PlayingAudioBanner from '../components/audio/PlayingAudioBanner';
import LoopingFilesSection from '../components/audio/LoopingFilesSection';
import FooterNavigation from '../components/FooterNavigation';
import LastMessageCard from '../components/devices/LastMessageCard';

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
  const {autoStartListener, udpPort, connectionMode, pairedBluetoothDevice} =
    useAppSelector(state => state.settings);

  // Local state - use refs for values that shouldn't trigger rerenders
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLastMessageTimestamp] = useState(0);
  const [lastMessage, setLastMessage] = useState<ESPMessage | null>(null);
  const [, setDeviceUpdateCount] = useState(0);
  // Track active sounds
  const [playingDevices, setPlayingDevices] = useState<string[]>([]);
  // Track looping files
  const [loopingFiles, setLoopingFiles] = useState<string[]>([]);

  // Use the UDP listener hook with stable references
  const {
    isListening,
    startListener: startUDPListener,
    stopListener: stopUDPListener,
    error: udpError,
  } = useUDPListener();

  // Use Bluetooth LE hook
  const {
    isConnected: isBLEConnected,
    connect: connectBLE,
    disconnect: disconnectBLE,
    error: bleError,
  } = useBluetoothLE();

  // Check for active sounds and looping files periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      // Check for playing devices
      const currentPlaying = AudioService.getPlayingDevices();
      if (
        JSON.stringify(currentPlaying.sort()) !==
        JSON.stringify(playingDevices.sort())
      ) {
        setPlayingDevices(currentPlaying);
      }

      // Check for looping files
      const loopingFilesResult = await AudioService.getLoopingFiles();
      const loopingFileIds = loopingFilesResult.map(file => file.id);
      if (
        JSON.stringify(loopingFileIds.sort()) !==
        JSON.stringify(loopingFiles.sort())
      ) {
        setLoopingFiles(loopingFileIds);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [playingDevices, loopingFiles]);

  // Handle ESP button press - optimized and instrumented for minimal latency
  const handleESPMessage = useCallback(
    async (message: ESPMessage) => {
      const messageStart = performance.now();
      console.log('Home screen received ESP message:', message);

      // Update last message - always show the latest
      setLastMessage(message);
      setLastMessageTimestamp(Date.now());

      // If button was pressed, play audio FIRST (fast path)
      // Then do device tracking afterwards to minimize latency
      if (message.buttonPressed) {
        console.log('Button was pressed, attempting to play audio...');

        // FAST PATH: Play audio immediately (instrumented)
        const playbackStart = performance.now();
        const success = await AudioService.playAudioForDevice(
          message.deviceId,
          files,
          message.buttonId,
          message.timestamp, // When message was received
          message.espTimestamp // When touch occurred on ESP32
        );
        const playbackTime = performance.now() - playbackStart;

        const totalHandlingTime = performance.now() - messageStart;
        const stateUpdateTime = totalHandlingTime - playbackTime;

        // Log message handling breakdown
        console.log(
          `📊 Message handling: ${totalHandlingTime.toFixed(2)}ms total\n` +
          `   ├─ Playback call: ${playbackTime.toFixed(2)}ms\n` +
          `   └─ State updates: ${stateUpdateTime.toFixed(2)}ms`
        );

        if (!success) {
          if (message.buttonId) {
            console.log(`No audio file associated with device ${message.deviceId}, button ${message.buttonId}`);
          } else {
            console.log('No audio file associated with this device.');
          }
        } else {
          console.log('✅ Successfully played audio for device');

          // Update playing devices
          setPlayingDevices(prev => {
            if (!prev.includes(message.deviceId)) {
              return [...prev, message.deviceId];
            }
            return prev;
          });
        }

        // DEFERRED: Update device tracking AFTER audio plays (reduces latency by 3-8ms)
        setTimeout(() => {
          const existingDevice = devices.find(
            device => device.id === message.deviceId,
          );

          if (existingDevice) {
            // Update last seen timestamp, battery level, and device type
            dispatch(
              updateDevice({
                id: message.deviceId,
                lastSeen: message.timestamp,
                batteryLevel: message.batteryLevel,
                deviceType: message.deviceType,
                // Update button count for ESP32 devices
                buttonCount: message.deviceType === 'ESP32' && message.buttonId
                  ? Math.max(existingDevice.buttonCount || 0, parseInt(message.buttonId) || 0)
                  : existingDevice.buttonCount,
              }),
            );
            // Force a device list refresh but limit the frequency
            setDeviceUpdateCount(prev => prev + 1);
          } else {
            // Add new device
            const deviceName = message.deviceType === 'ESP32'
              ? `ESP32 Device ${message.deviceId}`
              : `ESP Button ${message.deviceId}`;

            dispatch(
              addDevice({
                id: message.deviceId,
                name: deviceName,
                lastSeen: message.timestamp,
                batteryLevel: message.batteryLevel,
                deviceType: message.deviceType,
                buttonCount: message.deviceType === 'ESP32' && message.buttonId
                  ? parseInt(message.buttonId) || 0
                  : undefined,
              }),
            );
            // Force a device list refresh
            setDeviceUpdateCount(prev => prev + 1);
          }
        }, 0); // Defer to next tick
      } else {
        // Button release - skip Redux updates entirely for better performance
        // Only update if this is a new device
        const existingDevice = devices.find(
          device => device.id === message.deviceId,
        );

        if (!existingDevice) {
          // Add new device (first time seeing this device)
          const deviceName = message.deviceType === 'ESP32'
            ? `ESP32 Device ${message.deviceId}`
            : `ESP Button ${message.deviceId}`;

          dispatch(
            addDevice({
              id: message.deviceId,
              name: deviceName,
              lastSeen: message.timestamp,
              batteryLevel: message.batteryLevel,
              deviceType: message.deviceType,
              buttonCount: message.deviceType === 'ESP32' && message.buttonId
                ? parseInt(message.buttonId) || 0
                : undefined,
            }),
          );
        }
        // Skip updates for button release on known devices
      }
    },
    [devices, dispatch, files],
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

        // Pre-warm audio system for minimal latency (eliminates cold start)
        await AudioService.prewarmAudioSystem();
        console.log('Audio system pre-warmed');

        // Initialize BLE service
        await BluetoothLEService.initialize();
        console.log('BLE service initialized');

        if (!mounted) return;
        setIsInitialized(true);

        // Start appropriate service based on connection mode
        if (autoStartListener) {
          setTimeout(async () => {
            if (!mounted) return;

            const mode = connectionMode || 'udp'; // Default to UDP if undefined
            console.log('[Home] Starting service in mode:', mode);

            if (mode === 'ble' && pairedBluetoothDevice) {
              console.log('[Home] Auto-connecting to BLE device:', pairedBluetoothDevice);
              await connectBLE(pairedBluetoothDevice);
              console.log('[Home] BLE connection initiated');
            } else {
              // Default to UDP
              console.log('[Home] Auto-starting UDP listener...');
              startUDPListener();
              console.log('[Home] UDP listener started');
            }
          }, 500);
        }

        // Load and restore any looping files from previous session
        const audioFiles = await AudioService.loadAudioFiles();
        dispatch(setFiles(audioFiles));

        // Preload all audio files for instant playback (eliminates disk I/O + decode time)
        await AudioService.preloadAllAudioFiles();
        console.log('All audio files preloaded and cached');

        // Restart any files that should be looping
        const filesToLoop = audioFiles.filter(file => file.loopMode);
        for (const file of filesToLoop) {
          await AudioService.startLoopPlayback(file.id);
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
      stopUDPListener();
      disconnectBLE();
    };
  }, []); // Empty dependency array - only run once

  // Subscribe to messages when initialized
  // Using useRef to maintain stable subscription
  const handleESPMessageRef = useRef(handleESPMessage);
  handleESPMessageRef.current = handleESPMessage;

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    const mode = connectionMode || 'udp'; // Default to UDP if undefined
    console.log('[Home] Subscribing to messages for mode:', mode);

    // Subscribe to appropriate service based on connection mode
    let unsubscribe: () => void;

    if (mode === 'ble') {
      // Subscribe to BLE messages
      console.log('[Home] Subscribing to BLE messages');
      unsubscribe = BluetoothLEService.subscribe((msg: ESPMessage) => {
        handleESPMessageRef.current(msg);
      });
    } else {
      // Subscribe to UDP messages (default)
      console.log('[Home] Subscribing to UDP messages');
      unsubscribe = UDPService.subscribe((msg: ESPMessage) => {
        handleESPMessageRef.current(msg);
      });
    }

    return () => {
      unsubscribe();
    };
  }, [isInitialized, connectionMode]); // Re-subscribe when mode changes

  // Toggle listener with stable reference (supports both UDP and BLE)
  const toggleListener = useCallback(async () => {
    const mode = connectionMode || 'udp'; // Default to UDP if undefined
    console.log('[Home] Toggle listener for mode:', mode);

    if (mode === 'ble') {
      console.log(
        '[Home] Toggle BLE connection, current state:',
        isBLEConnected,
      );

      if (isBLEConnected) {
        await disconnectBLE();
      } else if (pairedBluetoothDevice) {
        await connectBLE(pairedBluetoothDevice);
      }
    } else {
      console.log('[Home] Toggle UDP listener, current state:', isListening);

      if (isListening) {
        stopUDPListener();
      } else {
        startUDPListener();
      }
    }
  }, [
    connectionMode,
    isListening,
    isBLEConnected,
    startUDPListener,
    stopUDPListener,
    connectBLE,
    disconnectBLE,
    pairedBluetoothDevice,
  ]);

  // Global stop audio function - stops all playing sounds
  const stopAllAudio = useCallback(() => {
    console.log('Stopping all audio from Home screen');
    AudioService.stopPlayback();
    setPlayingDevices([]);
    setLoopingFiles([]);
  }, []);

  // Stop all looping files
  const stopAllLoops = useCallback(async () => {
    console.log('Stopping all looping audio files');
    await AudioService.stopAllLoops();
    setLoopingFiles([]);
  }, []);

  // Function to stop audio for a specific device
  const stopDeviceAudio = useCallback((deviceId: string) => {
    console.log(`Stopping audio for device ${deviceId}`);
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

      const lastSeen = device.lastSeen ? new Date(device.lastSeen) : null;
      const timeAgo = lastSeen
        ? Math.floor((Date.now() - lastSeen.getTime()) / 60000) === 0
          ? 'Just now'
          : `${Math.floor((Date.now() - lastSeen.getTime()) / 60000)} min ago`
        : 'Never';

      return `Last seen: ${timeAgo}`;
    },
    [devices],
  );

  // Function to test audio for a device
  const testAudio = useCallback(async (deviceId: string) => {
    console.log('Testing audio for device:', deviceId);
    const success = await AudioService.playAudioForDevice(deviceId, files);
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
  }, [files]);

  // Check if a device sound is playing
  const isDevicePlaying = useCallback(
    (deviceId: string) => {
      return playingDevices.includes(deviceId);
    },
    [playingDevices],
  );

  // Find audio file for device
  const getDeviceAudioFile = useCallback(
    (deviceId: string) => {
      return files.find(file => file.deviceId === deviceId);
    },
    [files],
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('Home screen focused - forcing UI refresh');
      setDeviceUpdateCount(prevCount => prevCount + 1);
    });

    return unsubscribe;
  }, [navigation]);

  const navigateToDeviceDetails = useCallback(
    (deviceId: string) => {
      navigation.navigate('DeviceDetails', {deviceId});
    },
    [navigation],
  );

  const onStopButtonAudio = useCallback((fileId: string) => {
    AudioService.stopLoopPlayback(fileId);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <StatusBar barStyle="dark-content" />

      {/* App Header with toggle listener button */}
      <Header
        title="ESP Audio Trigger"
        rightAction={
          playingDevices.length > 0 || loopingFiles.length > 0
            ? stopAllAudio
            : toggleListener
        }
        rightActionTitle={
          playingDevices.length > 0 || loopingFiles.length > 0
            ? 'Stop All'
            : (connectionMode || 'udp') === 'ble'
            ? isBLEConnected
              ? 'BLE ✓'
              : 'Connect BLE'
            : isListening
            ? 'Listening'
            : 'Start Listening'
        }
        rightActionColor={
          playingDevices.length > 0 || loopingFiles.length > 0
            ? '#e53e3e'
            : (connectionMode || 'udp') === 'ble'
            ? isBLEConnected
              ? '#48bb78'
              : '#718096'
            : isListening
            ? '#48bb78'
            : '#718096'
        }
      />

      {/* Now Playing Banner */}
      <PlayingAudioBanner
        playingDevices={playingDevices}
        devices={devices}
        audioFiles={files}
        onStopDeviceAudio={stopDeviceAudio}
      />

      {/* Looping Files Section */}
      <LoopingFilesSection
        loopingFiles={loopingFiles}
        files={files}
        onStopAllLoops={stopAllLoops}
        onStopLoop={onStopButtonAudio}
      />

      {/* Connection Status Card */}
      <UDPStatusCard
        port={udpPort}
        isListening={connectionMode === 'ble' ? isBLEConnected : isListening}
        error={connectionMode === 'ble' ? bleError : udpError}
      />

      {/* Last Message Card */}
      <LastMessageCard lastMessage={lastMessage} />

      {/* Device List */}
      <DeviceList
        devices={devices}
        audioFiles={files}
        playingDevices={playingDevices}
        isLoading={isLoading}
        onStopAudio={stopDeviceAudio}
        onPlayAudio={testAudio}
        onViewDetails={navigateToDeviceDetails}
        getDeviceStatus={getDeviceStatus}
        getDeviceAudioFile={getDeviceAudioFile}
        isDevicePlaying={isDevicePlaying}
      />

      {/* Footer Navigation */}
      <FooterNavigation
        onManageAudioPress={() => navigation.navigate('AudioFiles')}
        onSettingsPress={() => navigation.navigate('Settings')}
      />
    </SafeAreaView>
  );
};

export default HomeScreen;
