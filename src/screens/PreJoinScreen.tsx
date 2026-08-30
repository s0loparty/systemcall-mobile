import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  KeyboardAvoidingView,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  ArrowsRightLeftIcon,
  ArrowLeftIcon,
  CheckIcon,
  MicrophoneIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
} from 'react-native-heroicons/outline';
import {createLocalVideoTrack} from 'livekit-client';
import type {LocalVideoTrack} from 'livekit-client';
import {FloatingLabelInput} from '../components/FloatingLabelInput';
import {MediaToggle} from '../components/call/MediaToggle';
import {LocalPreview} from '../components/call/LocalPreview';
import {PrimaryButton} from '../components/PrimaryButton';
import {joinRoom} from '../api/rooms';
import type {RootStackParamList} from '../navigation/types';
import {setBackgroundBlur} from '../utils/backgroundBlur';

type Props = NativeStackScreenProps<RootStackParamList, 'PreJoin'>;
type AndroidPermission =
  (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS];

export function PreJoinScreen({route, navigation}: Props) {
  const [camera, setCamera] = useState(true);
  const [mic, setMic] = useState(true);
  const [backgroundBlur, setBackgroundBlurEnabled] = useState(false);
  const [name, setName] = useState('Гость');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewTrack, setPreviewTrack] = useState<LocalVideoTrack | null>(
    null,
  );
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const previewTrackRef = useRef<LocalVideoTrack | null>(null);

  const requestAndroidPermission = useCallback(
    async (permission: AndroidPermission) => {
      if (Platform.OS !== 'android') {
        return true;
      }

      const granted = await PermissionsAndroid.request(permission);
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    },
    [],
  );

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
        if (backgroundBlur) {
          setBackgroundBlur(track, true);
        }
        previewTrackRef.current = track;
        setPreviewTrack(track);
        setError(null);
      } catch (e) {
        console.warn('PreJoin camera preview failed', e);
        setCamera(false);
        setError('Не удалось запустить камеру.');
      }
    },
    [backgroundBlur, ensureCameraPermission, stopPreview],
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

  const toggleBackgroundBlur = useCallback(() => {
    const enabled = !backgroundBlur;
    try {
      setBackgroundBlur(previewTrackRef.current, enabled);
      setBackgroundBlurEnabled(enabled);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Не удалось включить размытие фона.',
      );
    }
  }, [backgroundBlur]);

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
          backgroundBlurEnabled: backgroundBlur,
        });
        return;
      }

      navigation.replace('Call', {
        roomName: r.room.name,
        livekit: r.livekit,
        cameraEnabled: camera,
        microphoneEnabled: mic,
        cameraFacingMode: facingMode,
        backgroundBlurEnabled: backgroundBlur,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось войти.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={s.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={s.container}
          keyboardShouldPersistTaps="handled"
          bounces={false}>
          <View style={s.header}>
            <Pressable
              hitSlop={10}
              onPress={() => navigation.popToTop()}
              style={s.backButton}>
              <ArrowLeftIcon size={18} color="#fff" />
              <Text style={s.backLabel}>Назад</Text>
            </Pressable>
            <View>
              <Text style={s.title}>{route.params.roomName}</Text>
              <Text style={s.sub}>
                {route.params.waitingRoomEnabled
                  ? 'После входа организатор должен будет вас допустить'
                  : 'Проверьте камеру и микрофон'}
              </Text>
            </View>
          </View>

          <View style={s.preview}>
            <LocalPreview track={previewTrack} enabled={camera} />
          </View>

          <View style={s.form}>
            <FloatingLabelInput
              label="Ваше имя"
              value={name}
              onChangeText={setName}
              autoCorrect={false}
            />
            {route.params.hasPassword ? (
              <FloatingLabelInput
                label="Пароль"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            ) : null}
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{checked: backgroundBlur}}
              onPress={toggleBackgroundBlur}
              style={s.blurOption}>
              <View style={[s.checkbox, backgroundBlur && s.checkboxChecked]}>
                {backgroundBlur ? (
                  <CheckIcon size={14} color="#0b0b0b" />
                ) : null}
              </View>
              <View style={s.blurCopy}>
                <Text style={s.blurTitle}>Размыть фон</Text>
                <Text style={s.blurHint}>
                  Эффект виден в превью и участникам звонка
                </Text>
              </View>
            </Pressable>
            {error ? <Text style={s.error}>{error}</Text> : null}
            <View style={s.controls}>
              <MediaToggle
                label="Микрофон"
                active={mic}
                icon={<MicrophoneIcon size={18} color="#fff" />}
                onPress={() => void toggleMicrophone()}
              />
              <MediaToggle
                label="Камера"
                active={camera}
                icon={
                  camera ? (
                    <VideoCameraIcon size={18} color="#fff" />
                  ) : (
                    <VideoCameraSlashIcon size={18} color="#fff" />
                  )
                }
                onPress={toggleCamera}
              />
              <MediaToggle
                label={facingMode === 'user' ? 'Фронт' : 'Основа'}
                active={camera}
                icon={<ArrowsRightLeftIcon size={18} color="#fff" />}
                onPress={() => void switchCamera()}
              />
            </View>
            <PrimaryButton
              label={
                route.params.waitingRoomEnabled
                  ? 'Запросить вход'
                  : 'Войти в звонок'
              }
              loading={loading}
              onPress={join}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#0b0b0b'},
  container: {flexGrow: 1, gap: 16, padding: 16},
  header: {gap: 14},
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  backLabel: {color: '#fff', fontSize: 14, fontWeight: '600'},
  title: {color: '#fff', fontSize: 22, fontWeight: '800'},
  sub: {color: '#8b8b8b'},
  preview: {flex: 1, minHeight: 260},
  form: {gap: 12, paddingBottom: 8},
  blurOption: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#292929',
    backgroundColor: '#151515',
  },
  checkbox: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#555',
  },
  checkboxChecked: {backgroundColor: '#fff', borderColor: '#fff'},
  blurCopy: {flex: 1, gap: 2},
  blurTitle: {color: '#fff', fontSize: 15, fontWeight: '700'},
  blurHint: {color: '#777', fontSize: 12, lineHeight: 16},
  error: {color: '#ff7373'},
  controls: {flexDirection: 'row', justifyContent: 'center', gap: 8},
});
