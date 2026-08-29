import React, {useCallback, useEffect} from 'react';
import {SafeAreaView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  AudioSession,
  LiveKitRoom,
  useLocalParticipant,
} from '@livekit/react-native';
import {ParticipantGrid} from '../components/call/ParticipantGrid';
import {MediaToggle} from '../components/call/MediaToggle';
import {PrimaryButton} from '../components/PrimaryButton';
import type {RootStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Call'>;

export function CallScreen({route, navigation}: Props) {
  useEffect(() => {
    void AudioSession.startAudioSession();

    return () => {
      void AudioSession.stopAudioSession();
    };
  }, []);

  return (
    <LiveKitRoom
      serverUrl={route.params.livekit.url}
      token={route.params.livekit.token}
      connect
      audio={route.params.microphoneEnabled}
      video={route.params.cameraEnabled}
      options={{adaptiveStream: true, dynacast: true}}>
      <Content
        roomName={route.params.roomName}
        onLeave={() => navigation.popToTop()}
      />
    </LiveKitRoom>
  );
}

function Content({roomName, onLeave}: {roomName: string; onLeave: () => void}) {
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
          <Text style={s.status}>В звонке</Text>
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
