import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {RootStackParamList} from '../types/types';

// Import screens
import HomeScreen from '../screens/Home';
import DeviceDetailsScreen from '../screens/DeviceDetails';
import AudioFilesScreen from '../screens/AudioFiles';
import SettingsScreen from '../screens/Settings';

// Create the stack navigator
const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerShown: false,
        }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="DeviceDetails" component={DeviceDetailsScreen} />
        <Stack.Screen name="AudioFiles" component={AudioFilesScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
