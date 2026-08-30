import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {ArrowLeftIcon} from 'react-native-heroicons/outline';
import {CameraQualitySection} from '../components/settings/CameraQualitySection';
import type {RootStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({navigation}: Props) {
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.container} bounces={false}>
        <View style={s.header}>
          <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={s.back}>
            <ArrowLeftIcon size={20} color="#fff" />
          </Pressable>
          <View style={s.headerCopy}>
            <Text style={s.title}>Настройки</Text>
            <Text style={s.subtitle}>Параметры камеры и звонков</Text>
          </View>
        </View>

        <CameraQualitySection />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#0b0b0b'},
  container: {padding: 16, gap: 20},
  header: {flexDirection: 'row', alignItems: 'center', gap: 12},
  back: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#242424',
  },
  headerCopy: {gap: 2},
  title: {color: '#fff', fontSize: 26, fontWeight: '800'},
  subtitle: {color: '#777', fontSize: 13},
});
