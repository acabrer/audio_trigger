import React, {useEffect, useState, useCallback} from 'react';
import {SafeAreaView, StatusBar} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useAppDispatch, useAppSelector} from '../store/hooks';
import {addDevice, updateDevice} from '../store/slices/espDevices';
import UDPService, {ESPMessage, useUDPListener} from '../services/udp';
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
  const {autoStartListener, udpPort} = useAppSelector(state => state.settings);

  // Local state - use refs for values that shouldn't trigger rerenders
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastMessageTimestamp, setLastMessageTimestamp] = useState(0);
  const [lastMessage, setLastMessage] = useState<ESPMessage | null>(null);
  const [deviceUpdateCount, setDeviceUpdateCount] = useState(0);
  // Track active sounds
  const [playingDevices, setPlayingDevices] = useState<string[]>([]);
  // Track looping files
  const [loopingFiles, setLoopingFiles] = useState<string[]>([]);

  // Use the UDP listener hook with stable references
  const {isListening, startListener, stopListener, error} = useUDPListener();

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

        // Load and restore any looping files from previous session
        const audioFiles = await AudioService.loadAudioFiles();
        dispatch(setFiles(audioFiles));

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
            : isListening
            ? 'Listening'
            : 'Start Listening'
        }
        rightActionColor={
          playingDevices.length > 0 || loopingFiles.length > 0
            ? '#e53e3e'
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

      {/* UDP Status Card */}
      <UDPStatusCard port={udpPort} isListening={isListening} error={error} />

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
