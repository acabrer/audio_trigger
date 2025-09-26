module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|nativewind|react-native-reanimated|@react-native|@react-navigation|react-native-screens|react-native-safe-area-context|react-native-udp|react-native-audio-api|react-native-fs|react-native-ble-plx|react-native-sound-player|@react-native-documents|@react-native-async-storage|@react-native-community)/)',
  ],
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
};
