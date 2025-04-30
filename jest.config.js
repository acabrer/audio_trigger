module.exports = {
  preset: 'react-native',
  // Do not use a direct plugins property here
  // If you need Jest-related plugins, use transform, transformIgnorePatterns, etc.
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|nativewind|react-native-reanimated|@react-native)/)',
  ],
};
