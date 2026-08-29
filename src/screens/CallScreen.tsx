import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  type AppStateStatus,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  AudioSession,
  LiveKitRoom,
  useLocalParticipant,
} from '@livekit/react-native';
import {ConnectionState, Room, RoomEvent} from 'livekit-client';
import {ParticipantGrid} from '../components/call/ParticipantGrid';
import {MediaToggle} from '../components/call/MediaToggle';
import {PrimaryButton} from '../components/PrimaryButton';
import type {RootStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Call'>;

type CallStatus =
  | 'Подключение…'
  | 'В звонке'
  | 'Переподключение…'
  | 'Соединение потеряно';

export function CallScreen({route, navigation}: Props) {
  const room = useMemo(
    () => new Room({adaptiveStream: true, dynacast: true}),
    [],
  );
  const [status, setStatus] = useState<CallStatus>('Подключение…');
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const reconnecting = useRef(false);

  const recoverConnection = useCallback(async () => {
    if (reconnecting.current) {
      return;
    }

    if (room.state !== ConnectionState.Disconnected) {
      if (
        room.state === ConnectionState.Reconnecting ||
        room.state === ConnectionState.SignalReconnecting
      ) {
        setStatus('Переподключение…');
      }
      return;
    }

    reconnecting.current = true;
    setStatus('Переподключение…');

    try {
      await room.connect(route.params.livekit.url, route.params.livekit.token);
    } catch (error) {
      console.warn('LiveKit foreground reconnect failed', error);
      setStatus('Соединение потеряно');
    } finally {
      reconnecting.current = false;
    }
  }, [room, route.params.livekit.token, route.params.livekit.url]);

  useEffect(() => {
    void AudioSession.startAudioSession();

    const handleConnected = () => setStatus('В звонке');
    const handleReconnecting = () => setStatus('Переподключение…');
    const handleDisconnected = () => setStatus('Соединение потеряно');

    room
      .on(RoomEvent.Connected, handleConnected)
      .on(RoomEvent.Reconnected, handleConnected)
      .on(RoomEvent.Reconnecting, handleReconnecting)
      .on(RoomEvent.SignalReconnecting, handleReconnecting)
      .on(RoomEvent.Disconnected, handleDisconnected);

    const subscription = AppState.addEventListener('change', nextState => {
      const previousState = appState.current;
      appState.current = nextState;

      const returningToForeground =
        nextState === 'active' &&
        (previousState === 'background' || previousState === 'inactive');

      if (!returningToForeground) {
        return;
      }

      // Give the JS runtime / network stack a moment to become active again.
      setTimeout(() => {
        void recoverConnection();
      }, 500);
    });

    return () => {
      subscription.remove();
      room
        .off(RoomEvent.Connected, handleConnected)
        .off(RoomEvent.Reconnected, handleConnected)
        .off(RoomEvent.Reconnecting, handleReconnecting)
        .off(RoomEvent.SignalReconnecting, handleReconnecting)
        .off(RoomEvent.Disconnected, handleDisconnected);
      void AudioSession.stopAudioSession();
    };
  }, [recoverConnection, room]);

  return (
    <LiveKitRoom
      room={room}
      serverUrl={route.params.livekit.url}
      token={route.params.livekit.token}
      connect
      audio={route.params.microphoneEnabled}
      video={route.params.cameraEnabled}
      onConnected={() => setStatus('В звонке')}
      onDisconnected={() => setStatus('Соединение потеряно')}
      onError={error => {
        console.warn('LiveKit room error', error);
      }}>
      <Content
        roomName={route.params.roomName}
        status={status}
        onLeave={() => navigation.popToTop()}
      />
    </LiveKitRoom>
  );
}

function Content({
  roomName,
  status,
  onLeave,
}: {
  roomName: string;
  status: CallStatus;
  onLeave: () => void;
}) {
  const {localParticipant, isMicrophoneEnabled, isCameraEnabled} =
    useLocalParticipant();

  const mic = useCallback(() => {
    void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  }, [localParticipant, isMicrophoneEnabled]);

  const cam = useCallback(() => {
    void localParticipant.setCameraEnabled(!isCameraEnabled);
  }, [localParticipant, isCameraEnabled]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View>
          <Text style={s.title}>{roomName}</Text>
          <Text style={s.status}>{status}</Text>
        </View>
        <View style={s.grid}>
          <ParticipantGrid />
        </View>
        <View style={s.controls}>
          <MediaToggle
            label="Микрофон"
            active={isMicrophoneEnabled}
            onPress={mic}
          />
          <MediaToggle label="Камера" active={isCameraEnabled} onPress={cam} />
        </View>
        <PrimaryButton label="Завершить" danger onPress={onLeave} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#090909'},
  container: {flex: 1, padding: 14, gap: 14},
  title: {color: '#fff', fontSize: 20, fontWeight: '800'},
  status: {color: '#7f7f7f'},
  grid: {flex: 1},
  controls: {flexDirection: 'row', justifyContent: 'center', gap: 8},
});
