import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {RTCView} from '@livekit/react-native-webrtc';
import {TrackEvent, type LocalVideoTrack, type Track} from 'livekit-client';

type Props = {
  track: LocalVideoTrack | null;
  enabled: boolean;
  compact?: boolean;
};

export function LocalPreview({track, enabled, compact = false}: Props) {
  const [stream, setStream] = useState(track?.mediaStream ?? null);

  useEffect(() => {
    setStream(track?.mediaStream ?? null);

    if (!track) {
      return;
    }

    // Match LiveKit's own React Native VideoTrack implementation: render the
    // LocalVideoTrack-owned MediaStream instead of constructing/releasing a
    // second MediaStream wrapper around mediaStreamTrack. Also refresh the
    // stream when LiveKit restarts the native camera track.
    const onRestarted = (restartedTrack: Track | null) => {
      setStream(restartedTrack?.mediaStream ?? null);
    };

    track.on(TrackEvent.Restarted, onRestarted);
    return () => {
      track.off(TrackEvent.Restarted, onRestarted);
    };
  }, [track]);

  return (
    <View style={[s.container, compact && s.compact]}>
      {enabled && stream ? (
        <RTCView
          // LiveKit owns this MediaStream. Do not call release() from the view.
          streamURL={stream.toURL()}
          objectFit="cover"
          mirror
          style={s.video}
        />
      ) : (
        <View style={s.placeholder}>
          <Text style={s.placeholderText}>Камера выключена</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#151515',
  },
  compact: {
    flex: 0,
    width: 112,
    height: 154,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2b2b2b',
  },
  video: {flex: 1},
  placeholder: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  placeholderText: {color: '#888'},
});
