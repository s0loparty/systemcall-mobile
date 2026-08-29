import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {createLocalVideoTrack} from 'livekit-client';
import type {LocalVideoTrack} from 'livekit-client';
import {MediaToggle} from '../components/call/MediaToggle';
import {LocalPreview} from '../components/call/LocalPreview';
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
  const [previewTrack, setPreviewTrack] = useState<LocalVideoTrack | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const previewTrackRef = useRef<LocalVideoTrack | null>(null);

  const stopPreview = useCallback(() => {
    previewTrackRef.current?.stop();
    previewTrackRef.current = null;
    setPreviewTrack(null);
  }, []);

  const startPreview = useCallback(
    async (nextFacingMode: 'user' | 'environment') => {
      try {
        if (Platform.OS === 'android') {
          const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.CAMERA,
          );
          if (result !== PermissionsAndroid.RESULTS.GRANTED) {
            setCamera(false);
            setError('Разрешите доступ к камере.');
            return;
          }
        }

        stopPreview();
        const track = await createLocalVideoTrack({facingMode: nextFacingMode});
        previewTrackRef.current = track;
        setPreviewTrack(track);
        setError(null);
      } catch (e) {
        console.warn('PreJoin camera preview failed', e);
        setCamera(false);
        setError('Не удалось запустить камеру.');
      }
    },
    [stopPreview],
  );

  useEffect(() => {
    void startPreview('user');
    return stopPreview;
  }, [startPreview, stopPreview]);

  const toggleCamera = useCallback(() => {
    if (camera) {
      setCamera(false);
      stopPreview();
      return;
    }

    setCamera(true);
    void startPreview(facingMode);
  }, [camera, facingMode, startPreview, stopPreview]);

  const switchCamera = useCallback(async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    if (camera) {
      await startPreview(next);
    }
  }, [camera, facingMode, startPreview]);

  async function join() {
    if (!name.trim()) {
      setError('Введите имя.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const r = await joinRoom(route.params.publicId, name.trim());
      stopPreview();
      navigation.replace('Call', {
        roomName: r.room.name,
        livekit: r.livekit,
        cameraEnabled: camera,
        microphoneEnabled: mic,
        cameraFacingMode: facingMode,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось войти.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.container}>
        <View>
          <Text style={s.title}>{route.params.roomName}</Text>
          <Text style={s.sub}>Проверьте камеру и микрофон</Text>
        </View>
        <View style={s.preview}>
          <LocalPreview track={previewTrack} enabled={camera} />
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
          <MediaToggle label="Камера" active={camera} onPress={toggleCamera} />
          <MediaToggle
            label={facingMode === 'user' ? 'Фронтальная' : 'Основная'}
            active={camera}
            onPress={() => void switchCamera()}
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
  preview: {flex: 1},
  input: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#171717',
    color: '#fff',
    paddingHorizontal: 16,
    fontSize: 16,
  },
  error: {color: '#ff7373'},
  controls: {flexDirection: 'row', justifyContent: 'center', gap: 8},
});
