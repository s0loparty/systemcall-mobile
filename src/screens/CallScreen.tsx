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
  isTrackReference,
  LiveKitRoom,
  useLocalParticipant,
  useTracks,
  VideoTrack,
} from '@livekit/react-native';
import {
  ConnectionState,
  type LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import {ParticipantGrid} from '../components/call/ParticipantGrid';
import {MediaToggle} from '../components/call/MediaToggle';
import {PrimaryButton} from '../components/PrimaryButton';
import type {RootStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Call'>;
type FacingMode = 'user' | 'environment';

type CallStatus =
  | 'Подключение…'
  | 'В звонке'
  | 'Переподключение…'
  | 'Соединение потеряно';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function CallScreen({route, navigation}: Props) {
  const room = useMemo(
    () => new Room({adaptiveStream: true, dynacast: true}),
    [],
  );
  const [status, setStatus] = useState<CallStatus>('Подключение…');
  const [desiredMicrophoneEnabled, setDesiredMicrophoneEnabled] = useState(
    route.params.microphoneEnabled,
  );
  const [desiredCameraEnabled, setDesiredCameraEnabled] = useState(
    route.params.cameraEnabled,
  );
  const [cameraFacingMode, setCameraFacingMode] = useState<FacingMode>(
    route.params.cameraFacingMode,
  );
  const desiredMicrophoneRef = useRef(route.params.microphoneEnabled);
  const desiredCameraRef = useRef(route.params.cameraEnabled);
  const cameraFacingModeRef = useRef<FacingMode>(route.params.cameraFacingMode);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const reconnecting = useRef(false);
  const restoringMedia = useRef(false);

  const getCameraTrack = useCallback(() => {
    const publication = room.localParticipant.getTrackPublication(
      Track.Source.Camera,
    );
    return publication?.track as LocalVideoTrack | undefined;
  }, [room]);

  const applyCameraFacingMode = useCallback(async () => {
    const track = getCameraTrack();
    if (track) {
      await track.restartTrack({facingMode: cameraFacingModeRef.current});
    }
  }, [getCameraTrack]);

  const restoreCamera = useCallback(
    async (forceRestart = false) => {
      if (!desiredCameraRef.current) {
        await room.localParticipant.setCameraEnabled(false);
        return;
      }

      const existingTrack = getCameraTrack();

      // On Android the publication can survive backgrounding while its native
      // capturer becomes stale. Restart the existing track in-place instead of
      // toggling camera OFF first: turning it off during reconnect can leave
      // LiveKit with no working camera until the user manually toggles it again.
      if (forceRestart && existingTrack) {
        await existingTrack.restartTrack({
          facingMode: cameraFacingModeRef.current,
        });
        await wait(300);
        return;
      }

      await room.localParticipant.setCameraEnabled(true);
      await wait(300);

      const track = getCameraTrack();
      if (track) {
        await track.restartTrack({facingMode: cameraFacingModeRef.current});
      }
    },
    [getCameraTrack, room],
  );

  const restoreLocalMedia = useCallback(
    async (forceCameraRestart = false) => {
      if (restoringMedia.current || room.state !== ConnectionState.Connected) {
        return;
      }

      restoringMedia.current = true;
      try {
        await room.localParticipant.setMicrophoneEnabled(
          desiredMicrophoneRef.current,
        );
        await restoreCamera(forceCameraRestart);
      } catch (error) {
        console.warn('LiveKit local media restore failed', error);
      } finally {
        restoringMedia.current = false;
      }
    },
    [restoreCamera, room],
  );

  const recoverConnection = useCallback(async () => {
    if (reconnecting.current) {
      return;
    }

    if (
      room.state === ConnectionState.Reconnecting ||
      room.state === ConnectionState.SignalReconnecting
    ) {
      setStatus('Переподключение…');
      // Do not touch the camera while signaling is reconnecting. The
      // RoomEvent.Reconnected handler will restart the capturer once the room is
      // fully connected again.
      return;
    }

    if (room.state === ConnectionState.Connected) {
      await restoreLocalMedia(true);
      return;
    }

    if (room.state !== ConnectionState.Disconnected) {
      return;
    }

    reconnecting.current = true;
    setStatus('Переподключение…');

    try {
      await room.connect(route.params.livekit.url, route.params.livekit.token);
      await wait(300);
      await restoreLocalMedia(true);
      setStatus('В звонке');
    } catch (error) {
      console.warn('LiveKit foreground reconnect failed', error);
      setStatus('Соединение потеряно');
    } finally {
      reconnecting.current = false;
    }
  }, [
    restoreLocalMedia,
    room,
    route.params.livekit.token,
    route.params.livekit.url,
  ]);

  useEffect(() => {
    void AudioSession.startAudioSession();

    const handleConnected = () => setStatus('В звонке');
    const handleReconnected = () => {
      setStatus('В звонке');
      // Wait until Android/LiveKit has finished restoring signaling and then
      // restart the existing native camera capturer in-place.
      setTimeout(() => void restoreLocalMedia(true), 700);
    };
    const handleReconnecting = () => setStatus('Переподключение…');
    const handleDisconnected = () => setStatus('Соединение потеряно');

    room
      .on(RoomEvent.Connected, handleConnected)
      .on(RoomEvent.Reconnected, handleReconnected)
      .on(RoomEvent.Reconnecting, handleReconnecting)
      .on(RoomEvent.SignalReconnecting, handleReconnecting)
      .on(RoomEvent.Disconnected, handleDisconnected);

    const subscription = AppState.addEventListener('change', nextState => {
      const previousState = appState.current;
      appState.current = nextState;

      if (
        nextState === 'active' &&
        (previousState === 'background' || previousState === 'inactive')
      ) {
        setTimeout(() => void recoverConnection(), 900);
      }
    });

    return () => {
      subscription.remove();
      room
        .off(RoomEvent.Connected, handleConnected)
        .off(RoomEvent.Reconnected, handleReconnected)
        .off(RoomEvent.Reconnecting, handleReconnecting)
        .off(RoomEvent.SignalReconnecting, handleReconnecting)
        .off(RoomEvent.Disconnected, handleDisconnected);
      void AudioSession.stopAudioSession();
    };
  }, [recoverConnection, restoreLocalMedia, room]);

  const changeMicrophone = useCallback(
    async (enabled: boolean) => {
      desiredMicrophoneRef.current = enabled;
      setDesiredMicrophoneEnabled(enabled);
      try {
        await room.localParticipant.setMicrophoneEnabled(enabled);
      } catch (error) {
        console.warn('LiveKit microphone toggle failed', error);
      }
    },
    [room],
  );

  const changeCamera = useCallback(
    async (enabled: boolean) => {
      desiredCameraRef.current = enabled;
      setDesiredCameraEnabled(enabled);
      try {
        if (enabled) {
          await restoreCamera();
        } else {
          await room.localParticipant.setCameraEnabled(false);
        }
      } catch (error) {
        console.warn('LiveKit camera toggle failed', error);
      }
    },
    [restoreCamera, room],
  );

  const switchCamera = useCallback(async () => {
    const next: FacingMode =
      cameraFacingModeRef.current === 'user' ? 'environment' : 'user';
    cameraFacingModeRef.current = next;
    setCameraFacingMode(next);

    if (!desiredCameraRef.current) {
      return;
    }

    try {
      await applyCameraFacingMode();
    } catch (error) {
      console.warn('LiveKit camera switch failed', error);
    }
  }, [applyCameraFacingMode]);

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
      onError={error => console.warn('LiveKit room error', error)}>
      <Content
        roomName={route.params.roomName}
        status={status}
        desiredMicrophoneEnabled={desiredMicrophoneEnabled}
        desiredCameraEnabled={desiredCameraEnabled}
        cameraFacingMode={cameraFacingMode}
        onMicrophoneChange={changeMicrophone}
        onCameraChange={changeCamera}
        onSwitchCamera={switchCamera}
        onLeave={() => navigation.popToTop()}
      />
    </LiveKitRoom>
  );
}

function Content({
  roomName,
  status,
  desiredMicrophoneEnabled,
  desiredCameraEnabled,
  cameraFacingMode,
  onMicrophoneChange,
  onCameraChange,
  onSwitchCamera,
  onLeave,
}: {
  roomName: string;
  status: CallStatus;
  desiredMicrophoneEnabled: boolean;
  desiredCameraEnabled: boolean;
  cameraFacingMode: FacingMode;
  onMicrophoneChange: (enabled: boolean) => Promise<void>;
  onCameraChange: (enabled: boolean) => Promise<void>;
  onSwitchCamera: () => Promise<void>;
  onLeave: () => void;
}) {
  const {isMicrophoneEnabled, isCameraEnabled} = useLocalParticipant();
  const localTracks = useTracks(
    [{source: Track.Source.Camera, withPlaceholder: true}],
    {onlySubscribed: false},
  ).filter(track => track.participant?.isLocal);
  const localCamera = localTracks[0];

  const mediaIsSynchronizing =
    status === 'Подключение…' || status === 'Переподключение…';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View>
          <Text style={s.title}>{roomName}</Text>
          <Text style={s.status}>{status}</Text>
        </View>
        <View style={s.grid}>
          <ParticipantGrid />
          <View style={s.selfView}>
            {desiredCameraEnabled && localCamera && isTrackReference(localCamera) ? (
              <VideoTrack trackRef={localCamera} style={s.selfVideo} />
            ) : (
              <View style={s.selfPlaceholder}>
                <Text style={s.selfText}>Вы</Text>
              </View>
            )}
          </View>
        </View>
        <View style={s.controls}>
          <MediaToggle
            label="Микрофон"
            active={
              mediaIsSynchronizing
                ? desiredMicrophoneEnabled
                : isMicrophoneEnabled
            }
            onPress={() => void onMicrophoneChange(!desiredMicrophoneEnabled)}
          />
          <MediaToggle
            label="Камера"
            active={
              mediaIsSynchronizing ? desiredCameraEnabled : isCameraEnabled
            }
            onPress={() => void onCameraChange(!desiredCameraEnabled)}
          />
          <MediaToggle
            label={cameraFacingMode === 'user' ? 'Фронтальная' : 'Основная'}
            active={desiredCameraEnabled}
            onPress={() => void onSwitchCamera()}
          />
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
  grid: {flex: 1, position: 'relative'},
  controls: {flexDirection: 'row', justifyContent: 'center', gap: 8},
  selfView: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 112,
    height: 154,
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2b2b2b',
    backgroundColor: '#171717',
  },
  selfVideo: {flex: 1},
  selfPlaceholder: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  selfText: {color: '#aaa', fontWeight: '700'},
});
