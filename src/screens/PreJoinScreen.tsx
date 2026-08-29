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
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewTrack, setPreviewTrack] = useState<LocalVideoTrack | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const previewTrackRef = useRef<LocalVideoTrack | null>(null);
  type AndroidPermission =
    (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS];

  const requestAndroidPermission = useCallback(async (permission: AndroidPermission) => {
    if (Platform.OS !== 'android') {
      return true;
    }

    const granted = await PermissionsAndroid.request(permission);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }, []);

  const ensureCameraPermission = useCallback(async () => {
    const granted = await requestAndroidPermission(
      PermissionsAndroid.PERMISSIONS.CAMERA,
    );

    if (!granted) {
      setCamera(false);
      setError('Разрешите доступ к камере.');
    }

    return granted;
  }, [requestAndroidPermission]);

  const ensureMicrophonePermission = useCallback(async () => {
    const granted = await requestAndroidPermission(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );

    if (!granted) {
      setMic(false);
      setError('Разрешите доступ к микрофону.');
    }

    return granted;
  }, [requestAndroidPermission]);

  const stopPreview = useCallback(() => {
    previewTrackRef.current?.stop();
    previewTrackRef.current = null;
    setPreviewTrack(null);
  }, []);

  const startPreview = useCallback(
    async (nextFacingMode: 'user' | 'environment') => {
      try {
        if (!(await ensureCameraPermission())) {
          return;
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
    [ensureCameraPermission, stopPreview],
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

  const toggleMicrophone = useCallback(async () => {
    if (mic) {
      setMic(false);
      return;
    }

    if (await ensureMicrophonePermission()) {
      setMic(true);
      setError(null);
    }
  }, [ensureMicrophonePermission, mic]);

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

    if (route.params.hasPassword && !password) {
      setError('Введите пароль комнаты.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (camera && !(await ensureCameraPermission())) {
        return;
      }

      if (mic && !(await ensureMicrophonePermission())) {
        return;
      }

      const r = await joinRoom(
        route.params.publicId,
        name.trim(),
        route.params.hasPassword ? password : undefined,
      );
      stopPreview();

      if ('waiting_room' in r) {
        navigation.replace('WaitingRoom', {
          publicId: route.params.publicId,
          roomName: r.room.name,
          waitingToken: r.waiting_token,
          cameraEnabled: camera,
          microphoneEnabled: mic,
          cameraFacingMode: facingMode,
        });
        return;
      }

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
          <Text style={s.sub}>
            {route.params.waitingRoomEnabled
              ? 'После входа организатор должен будет вас допустить'
              : 'Проверьте камеру и микрофон'}
          </Text>
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
        {route.params.hasPassword ? (
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Пароль комнаты"
            placeholderTextColor="#666"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={s.input}
          />
        ) : null}
        {error ? <Text style={s.error}>{error}</Text> : null}
        <View style={s.controls}>
          <MediaToggle
            label="Микрофон"
            active={mic}
            onPress={() => void toggleMicrophone()}
          />
          <MediaToggle label="Камера" active={camera} onPress={toggleCamera} />
          <MediaToggle
            label={facingMode === 'user' ? 'Фронтальная' : 'Основная'}
            active={camera}
            onPress={() => void switchCamera()}
          />
        </View>
        <PrimaryButton
          label={route.params.waitingRoomEnabled ? 'Запросить вход' : 'Войти в звонок'}
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
