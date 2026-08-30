import React from 'react';
import {NavigationContainer, DarkTheme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {HomeScreen} from './screens/HomeScreen';
import {SettingsScreen} from './screens/SettingsScreen';
import {PreJoinScreen} from './screens/PreJoinScreen';
import {WaitingRoomScreen} from './screens/WaitingRoomScreen';
import {CallScreen} from './screens/CallScreen';
import {CameraSettingsProvider} from './settings/CameraSettingsContext';
import type {RootStackParamList} from './navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <CameraSettingsProvider>
        <NavigationContainer theme={DarkTheme}>
          <Stack.Navigator
            initialRouteName="Home"
            screenOptions={{headerShown: false, animation: 'fade'}}>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="PreJoin" component={PreJoinScreen} />
            <Stack.Screen
              name="WaitingRoom"
              component={WaitingRoomScreen}
              options={{gestureEnabled: false}}
            />
            <Stack.Screen
              name="Call"
              component={CallScreen}
              options={{gestureEnabled: false}}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </CameraSettingsProvider>
    </SafeAreaProvider>
  );
}
