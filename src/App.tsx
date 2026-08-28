import React from 'react';
import {NavigationContainer,DarkTheme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {HomeScreen} from './screens/HomeScreen';import {PreJoinScreen} from './screens/PreJoinScreen';import {CallScreen} from './screens/CallScreen';import type {RootStackParamList} from './navigation/types';
const Stack=createNativeStackNavigator<RootStackParamList>();
export default function App(){return <NavigationContainer theme={DarkTheme}><Stack.Navigator initialRouteName="Home" screenOptions={{headerShown:false,animation:'fade'}}><Stack.Screen name="Home" component={HomeScreen}/><Stack.Screen name="PreJoin" component={PreJoinScreen}/><Stack.Screen name="Call" component={CallScreen} options={{gestureEnabled:false}}/></Stack.Navigator></NavigationContainer>}
