import {useCallback, useEffect, useRef, useState} from 'react';
import {PermissionsAndroid, Platform} from 'react-native';
import {createLocalVideoTrack, type LocalVideoTrack} from 'livekit-client';
import {
  getCameraCaptureOptions,
  type CameraQualityPresetId,
} from '../settings/cameraQuality';

export function useCameraPreview(qualityPresetId: CameraQualityPresetId) {
  const [track, setTrack] = useState<LocalVideoTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trackRef = useRef<LocalVideoTrack | null>(null);

  const stop = useCallback(() => {
    trackRef.current?.stop();
    trackRef.current = null;
    setTrack(null);
  }, []);

  const start = useCallback(async () => {
    if (Platform.OS === 'android') {
      const permission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
      );
      if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
        setError('Разрешите доступ к камере для предпросмотра.');
        return;
      }
    }

    try {
      stop();
      const nextTrack = await createLocalVideoTrack(
        getCameraCaptureOptions(qualityPresetId),
      );
      trackRef.current = nextTrack;
      setTrack(nextTrack);
      setError(null);
    } catch (reason) {
      console.warn('Settings camera preview failed', reason);
      setError('Не удалось запустить предпросмотр камеры.');
    }
  }, [qualityPresetId, stop]);

  useEffect(() => {
    void start();
    return stop;
  }, [start, stop]);

  return {track, error};
}
