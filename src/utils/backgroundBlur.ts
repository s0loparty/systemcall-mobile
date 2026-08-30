import {Platform} from 'react-native';
import type {LocalVideoTrack} from 'livekit-client';

export const BACKGROUND_BLUR_EFFECT = 'systemcall-background-blur';
export const FRAME_PACING_DIAGNOSTICS_EFFECT =
  'systemcall-frame-pacing-diagnostics';

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

  const mediaTrack =
    track.mediaStreamTrack as unknown as VideoEffectsMediaTrack;

  if (typeof mediaTrack._setVideoEffects !== 'function') {
    if (enabled) {
      throw new Error('Размытие фона недоступно на этом устройстве.');
    }
    return;
  }

  // During the frame-pacing A/B test keep a tiny pass-through processor when
  // blur is disabled. This measures camera frame arrival at the same point in
  // react-native-webrtc without segmentation, GL rendering, or pixel conversion.
  mediaTrack._setVideoEffects(
    enabled ? [BACKGROUND_BLUR_EFFECT] : [FRAME_PACING_DIAGNOSTICS_EFFECT],
  );
}
