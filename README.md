# ESP8266 UDP Audio Trigger App

A React Native application that receives UDP messages from ESP8266 devices and triggers audio playback to Bluetooth speakers. This project was bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

## Features

- **ESP8266 Integration**: Listen for UDP messages from ESP8266 devices
- **Customizable Audio Mapping**: Assign different audio files to different ESP buttons
- **Bluetooth Speaker Support**: Play audio through connected Bluetooth speakers
- **Multi-Device Management**: Manage multiple ESP8266 devices from a single app
- **Simultaneous Audio Playback**: Play multiple audio files concurrently from different devices
- **Battery Monitoring**: View battery levels of connected ESP devices
- **Customizable Settings**: Configure UDP port, volume controls, and more

## Technical Stack

- **React Native**: Cross-platform mobile development
- **TypeScript**: Type-safe JavaScript
- **NativeWind**: Tailwind CSS-style utility classes for React Native
- **Redux**: State management with Redux Toolkit
- **UDP Socket**: Real-time communication with ESP8266 devices
- **Bluetooth Connectivity**: Connect to and control external speakers
- **React Navigation**: Screen navigation and routing

## Getting Started

> **Note**: Make sure you have completed the [React Native Environment Setup](https://reactnative.dev/docs/environment-setup) guide before proceeding.

### Prerequisites

- Node.js (LTS version recommended)
- Yarn or npm
- Android Studio (for Android development)
- Xcode (for iOS development, macOS only)
- Physical or virtual devices for testing

### Installation --> NOT WORKING FOR IOS

1. Clone the repository
2. Install dependencies:

```sh
# Using npm
npm install

# OR using Yarn
yarn install
```

3. For iOS, install CocoaPods dependencies:

```sh
bundle install
bundle exec pod install
```

## Running the App

### Start Metro Server

First, start the Metro server, the JavaScript build tool for React Native:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

### Run on Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### Run on iOS --> NOT WORKING

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

## ESP8266 Setup

This app expects ESP8266 devices to send UDP messages in one of the following formats:

1. Simple format: `BUTTON:DEVICE_ID:STATE`

   - Example: `BUTTON:ESP01:1` (button pressed)
   - Example: `BUTTON:ESP01:0` (button released)

2. JSON format:
   ```json
   {
     "deviceId": "ESP01",
     "buttonPressed": true,
     "batteryLevel": 0.75
   }
   ```

The default UDP port is 4210, which can be changed in the app settings.

## Usage Guide

1. **Home Screen**: View all connected ESP devices, monitor their status, and play/stop audio
2. **Device Details**: Configure a specific ESP device, assign audio files, and test playback
3. **Audio Files**: Manage your audio files library, add new files, and preview sounds
4. **Settings**: Configure UDP port, volume settings, and other app preferences

## Development

### Key Files and Directories

- `src/screens/`: UI screens for the application
- `src/services/`: Core functionality services (UDP, audio, Bluetooth)
- `src/store/`: Redux state management
- `src/navigation/`: Navigation configuration

### Adding New Features

To add new features, follow the existing architecture pattern:

1. Add new services in `src/services/` if needed
2. Update Redux store in `src/store/slices/` for new state requirements
3. Create or modify screens in `src/screens/` for UI changes

## Troubleshooting

If you encounter issues:

- Ensure your ESP8266 device is sending properly formatted UDP messages
- Verify that the ESP8266 and mobile device are on the same network
- Check that the UDP port matches in both the app settings and ESP8266 code
- For Bluetooth issues, ensure your device has granted the necessary permissions

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- React Native Community
- ESP8266 Community
- All open-source libraries used in this project
