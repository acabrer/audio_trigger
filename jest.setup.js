/* eslint-env jest */
// Jest setup file for React Native testing

// Mock NativeWind
jest.mock('nativewind', () => ({
  styled: (component) => component,
  withExpoSnack: (component) => component,
}));

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// Mock react-native-screens
jest.mock('react-native-screens', () => ({
  enableScreens: jest.fn(),
  ScreenContainer: ({ children }) => children,
  Screen: ({ children }) => children,
}));

// Mock React Navigation
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    }),
    useRoute: () => ({
      params: {},
    }),
    useFocusEffect: jest.fn(),
  };
});

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Mock RNFS
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/documents',
  exists: jest.fn(() => Promise.resolve(true)),
  mkdir: jest.fn(() => Promise.resolve()),
  readFile: jest.fn(() => Promise.resolve('')),
  writeFile: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
  stat: jest.fn(() => Promise.resolve({
    size: '1000',
    isDirectory: () => false,
  })),
  copyFile: jest.fn(() => Promise.resolve()),
}));

// Mock react-native-udp
jest.mock('react-native-udp', () => ({
  createSocket: jest.fn(() => ({
    bind: jest.fn((port, callback) => callback && callback()),
    on: jest.fn(),
    close: jest.fn(),
    removeAllListeners: jest.fn(),
  })),
}));

// Mock react-native-audio-api
jest.mock('react-native-audio-api', () => ({
  AudioContext: jest.fn(() => ({
    createBufferSource: jest.fn(() => ({
      buffer: null,
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      loop: false,
      onended: null,
    })),
    destination: {},
    decodeAudioData: jest.fn(() => Promise.resolve({
      numberOfChannels: 2,
      length: 44100,
      sampleRate: 44100,
    })),
  })),
  AudioBuffer: jest.fn(),
  AudioBufferSourceNode: jest.fn(),
}));

// Mock react-native-ble-plx
jest.mock('react-native-ble-plx', () => ({
  BleManager: jest.fn(() => ({
    startDeviceScan: jest.fn(),
    stopDeviceScan: jest.fn(),
    connectToDevice: jest.fn(),
    onStateChange: jest.fn(),
    state: jest.fn(() => Promise.resolve('PoweredOn')),
  })),
}));

// Mock react-native-sound-player
jest.mock('react-native-sound-player', () => ({
  playSoundFile: jest.fn(),
  loadSoundFile: jest.fn(),
  playUrl: jest.fn(),
  stop: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  seek: jest.fn(),
  setSpeaker: jest.fn(),
  setVolume: jest.fn(),
}));

// Mock react-native-documents/picker
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(() => Promise.resolve([{
    uri: 'file://mock/file.mp3',
    name: 'test.mp3',
    size: 1000,
    type: 'audio/mp3',
  }])),
}));

// Silence console warnings in tests
const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
  console.warn = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Require cycle:')
    ) {
      return;
    }
    originalWarn(...args);
  };

  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning:') ||
       args[0].includes('React.jsx'))
    ) {
      return;
    }
    originalError(...args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
  console.error = originalError;
});