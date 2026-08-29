import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {usePipModeListener} from '@videosdk.live/react-native-pip-android';
import {
  isTrackReference,
  useLocalParticipant,
  useTracks,
  VideoTrack,
} from '@livekit/react-native';
import {Track} from 'livekit-client';
import {MediaToggle} from './MediaToggle';
import {ParticipantGrid} from './ParticipantGrid';
import {PrimaryButton} from '../PrimaryButton';
import type {CallStatus, FacingMode} from '../../hooks/useCallLifecycle';

type Props = {
  roomName: string;
  status: CallStatus;
  desiredMicrophoneEnabled: boolean;
  desiredCameraEnabled: boolean;
  cameraFacingMode: FacingMode;
  onMicrophoneChange: (enabled: boolean) => Promise<void>;
  onCameraChange: (enabled: boolean) => Promise<void>;
  onSwitchCamera: () => Promise<void>;
  onLeave: () => void;
};

export function CallScreenContent({
  roomName,
  status,
  desiredMicrophoneEnabled,
  desiredCameraEnabled,
  cameraFacingMode,
  onMicrophoneChange,
  onCameraChange,
  onSwitchCamera,
  onLeave,
}: Props) {
  const isInPipMode = Boolean(usePipModeListener());
  const {isMicrophoneEnabled, isCameraEnabled} = useLocalParticipant();
  const localTracks = useTracks(
    [{source: Track.Source.Camera, withPlaceholder: true}],
    {onlySubscribed: false},
  ).filter(track => track.participant?.isLocal);
  const localCamera = localTracks[0];

  const mediaIsSynchronizing =
    status === 'Подключение…' || status === 'Переподключение…';

  const localPreview = (
    <View style={isInPipMode ? s.pipPreview : s.selfView}>
      {desiredCameraEnabled && localCamera && isTrackReference(localCamera) ? (
        <VideoTrack trackRef={localCamera} style={s.selfVideo} />
      ) : (
        <View style={s.selfPlaceholder}>
          <Text style={s.selfText}>Вы</Text>
        </View>
      )}
    </View>
  );

  if (isInPipMode) {
    return <View style={s.pipContainer}>{localPreview}</View>;
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.container}>
        <View>
          <Text style={s.title}>{roomName}</Text>
          <Text style={s.status}>{status}</Text>
        </View>
        <View style={s.grid}>
          <ParticipantGrid />
          {localPreview}
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
  pipContainer: {flex: 1, backgroundColor: '#090909'},
  pipPreview: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#171717',
  },
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
