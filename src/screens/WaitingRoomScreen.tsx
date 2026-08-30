import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {getWaitingRoomStatus} from '../api/rooms';
import {PrimaryButton} from '../components/PrimaryButton';
import type {RootStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'WaitingRoom'>;

export function WaitingRoomScreen({route, navigation}: Props) {
  const [message, setMessage] = useState('Ожидаем подтверждения организатора…');
  const [rejected, setRejected] = useState(false);
  const finished = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (cancelled || finished.current) {
        return;
      }

      try {
        const result = await getWaitingRoomStatus(
          route.params.publicId,
          route.params.waitingToken,
        );

        if (cancelled) {
          return;
        }

        if (result.waiting_room.status === 'rejected') {
          finished.current = true;
          setRejected(true);
          setMessage('Организатор отклонил запрос на вход.');
          return;
        }

        if (result.waiting_room.status === 'approved' && result.livekit) {
          finished.current = true;
          navigation.replace('Call', {
            roomName: result.room.name,
            livekit: result.livekit,
            cameraEnabled: route.params.cameraEnabled,
            microphoneEnabled: route.params.microphoneEnabled,
            cameraFacingMode: route.params.cameraFacingMode,
            backgroundBlurEnabled: route.params.backgroundBlurEnabled,
          });
          return;
        }

        setMessage('Ожидаем подтверждения организатора…');
      } catch (error) {
        console.warn('Waiting room status check failed', error);
        if (!cancelled) {
          setMessage('Не удалось проверить статус. Повторяем попытку…');
        }
      }

      if (!cancelled && !finished.current) {
        timer = setTimeout(() => void poll(), 2000);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [navigation, route.params]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.container}>
        <View style={s.content}>
          {!rejected ? <ActivityIndicator size="large" /> : null}
          <Text style={s.title}>{route.params.roomName}</Text>
          <Text style={s.message}>{message}</Text>
          {!rejected ? (
            <Text style={s.hint}>
              Оставьте этот экран открытым. После подтверждения вы автоматически войдёте в звонок.
            </Text>
          ) : null}
        </View>
        <PrimaryButton
          label={rejected ? 'На главную' : 'Отменить'}
          danger={!rejected}
          onPress={() => navigation.popToTop()}
        />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#0b0b0b'},
  container: {flex: 1, padding: 20, justifyContent: 'space-between'},
  content: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16},
  title: {color: '#fff', fontSize: 26, fontWeight: '800', textAlign: 'center'},
  message: {color: '#d0d0d0', fontSize: 17, textAlign: 'center'},
  hint: {color: '#777', fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 320},
});
