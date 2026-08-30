import {Platform} from 'react-native';
import type {LocalVideoTrack} from 'livekit-client';

export const BACKGROUND_BLUR_EFFECT = 'systemcall-background-blur';

type VideoEffectsMediaTrack = {
  _setVideoEffects?: (names: readonly string[] | null) => void;
};

export function setBackgroundBlur(
  track: LocalVideoTrack | null | undefined,
  enabled: boolean,
  platform: string = Platform.OS,
): void {
  if (!track) {
    return;
  }

  if (platform !== 'android') {
    if (enabled) {
      throw new Error('Размытие фона пока доступно только на Android.');
    }
    return;
  }

  const mediaTrack = track.mediaStreamTrack as unknown as VideoEffectsMediaTrack;

  if (typeof mediaTrack._setVideoEffects !== 'function') {
    if (enabled) {
      throw new Error('Размытие фона недоступно на этом устройстве.');
    }
    return;
  }

  // react-native-webrtc on Android expects null to remove the processor.
  // An empty array can leave an empty VideoEffectProcessor in the pipeline.
  mediaTrack._setVideoEffects(enabled ? [BACKGROUND_BLUR_EFFECT] : null);
}
