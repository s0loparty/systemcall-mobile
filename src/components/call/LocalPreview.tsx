import React, {useEffect, useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {RTCView, MediaStream} from '@livekit/react-native-webrtc';
import type {LocalVideoTrack} from 'livekit-client';

type Props = {
  track: LocalVideoTrack | null;
  enabled: boolean;
  compact?: boolean;
};

export function LocalPreview({track, enabled, compact = false}: Props) {
  const stream = useMemo(() => {
    if (!track) {
      return null;
    }

    return new MediaStream([track.mediaStreamTrack]);
  }, [track]);

  useEffect(() => {
    return () => {
      stream?.release();
    };
  }, [stream]);

  return (
    <View style={[s.container, compact && s.compact]}>
      {enabled && stream ? (
        <RTCView
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
