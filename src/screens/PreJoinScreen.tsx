import React, {useState} from 'react';
import {SafeAreaView, StyleSheet, Text, TextInput, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {MediaToggle} from '../components/call/MediaToggle';
import {PrimaryButton} from '../components/PrimaryButton';
import {joinRoom} from '../api/rooms';
import type {RootStackParamList} from '../navigation/types';
type Props = NativeStackScreenProps<RootStackParamList, 'PreJoin'>;
export function PreJoinScreen({route, navigation}: Props) {
  const [camera, setCamera] = useState(true);
  const [mic, setMic] = useState(true);
  const [name, setName] = useState('Гость');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function join() {
    if (!name.trim()) {
      setError('Введите имя.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const r = await joinRoom(route.params.publicId, name.trim());
      navigation.replace('Call', {
        roomName: r.room.name,
        livekit: r.livekit,
        cameraEnabled: camera,
        microphoneEnabled: mic,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось войти.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View>
          <Text style={s.title}>{route.params.roomName}</Text>
          <Text style={s.sub}>Проверьте камеру и микрофон</Text>
        </View>
        <View style={s.preview}>
          <Text style={s.previewText}>Превью камеры</Text>
        </View>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ваше имя"
          placeholderTextColor="#666"
          style={s.input}
        />
        {error ? <Text style={s.error}>{error}</Text> : null}
        <View style={s.controls}>
          <MediaToggle
            label="Микрофон"
            active={mic}
            onPress={() => setMic(v => !v)}
          />
          <MediaToggle
            label="Камера"
            active={camera}
            onPress={() => setCamera(v => !v)}
          />
        </View>
        <PrimaryButton
          label="Войти в звонок"
          loading={loading}
          onPress={join}
        />
      </View>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#0b0b0b'},
  container: {flex: 1, gap: 16, padding: 16},
  title: {color: '#fff', fontSize: 22, fontWeight: '800'},
  sub: {color: '#8b8b8b'},
  preview: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: '#151515',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: {color: '#888'},
  input: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#171717',
    color: '#fff',
    paddingHorizontal: 16,
    fontSize: 16,
  },
  error: {color: '#ff7373'},
  controls: {flexDirection: 'row', justifyContent: 'center', gap: 12},
});
