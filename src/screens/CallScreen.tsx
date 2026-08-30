import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RoomContext} from '@livekit/react-native';
import {createLocalVideoTrack, Room, type LocalVideoTrack} from 'livekit-client';
import {CallScreenContent} from '../components/call/CallScreenContent';
import {useCallLifecycle} from '../hooks/useCallLifecycle';
import {pip} from '../native/pip';
import {getCameraCaptureOptions} from '../settings/cameraQuality';
import type {RootStackParamList} from '../navigation/types';
import {setBackgroundBlur} from '../utils/backgroundBlur';

type Props = NativeStackScreenProps<RootStackParamList, 'Call'>;

// Temporary A/B diagnostic: keep the selected-quality local camera + blur
// preview while connected to LiveKit, but do not publish video to the room.
const DIAGNOSTIC_UNPUBLISHED_VIDEO = true;

export function CallScreen({route, navigation}: Props) {
  const configuredRoom = useMemo(
    () =>
      new Room({
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: {simulcast: false},
        videoCaptureDefaults: getCameraCaptureOptions(
          route.params.cameraQualityPresetId,
          route.params.cameraFacingMode,
        ),
      }),
    [route.params.cameraFacingMode, route.params.cameraQualityPresetId],
  );
  const createRoom = useCallback(() => configuredRoom, [configuredRoom]);

  const diagnosticParams = useMemo(
    () =>
      DIAGNOSTIC_UNPUBLISHED_VIDEO
        ? {...route.params, cameraEnabled: false}
        : route.params,
    [route.params],
  );

  const {
    room,
    status,
    desiredMicrophoneEnabled,
    desiredCameraEnabled,
    cameraFacingMode,
    changeMicrophone,
    changeCamera,
    switchCamera,
    leaveCall,
  } = useCallLifecycle(diagnosticParams, () => navigation.popToTop(), {createRoom});

  const [diagnosticPreviewTrack, setDiagnosticPreviewTrack] =
    useState<LocalVideoTrack | null>(null);
  const diagnosticPreviewTrackRef = useRef<LocalVideoTrack | null>(null);

  useEffect(() => {
    if (!DIAGNOSTIC_UNPUBLISHED_VIDEO || !route.params.cameraEnabled) return;

    let cancelled = false;

    void (async () => {
      try {
        const track = await createLocalVideoTrack(
          getCameraCaptureOptions(
            route.params.cameraQualityPresetId,
            route.params.cameraFacingMode,
          ),
        );

        if (cancelled) {
          track.stop();
          return;
        }

        if (route.params.backgroundBlurEnabled) {
          setBackgroundBlur(track, true);
        }

        diagnosticPreviewTrackRef.current = track;
        setDiagnosticPreviewTrack(track);
        console.info(
          '[VideoDiagnostic] local camera active but NOT published to LiveKit',
        );
      } catch (error) {
        console.warn('[VideoDiagnostic] failed to create local preview', error);
      }
    })();

    return () => {
      cancelled = true;
      const track = diagnosticPreviewTrackRef.current;
      diagnosticPreviewTrackRef.current = null;
      setDiagnosticPreviewTrack(null);
      if (track) {
        try {
          setBackgroundBlur(track, false);
        } catch {
          // Track teardown must continue even if the diagnostic effect is gone.
        }
        track.stop();
      }
    };
  }, [
    route.params.backgroundBlurEnabled,
    route.params.cameraEnabled,
    route.params.cameraFacingMode,
    route.params.cameraQualityPresetId,
  ]);

  useEffect(() => {
    pip.setCallScreenActive(true);
    return () => pip.setCallScreenActive(false);
  }, []);

  return (
    <RoomContext.Provider value={room}>
      <CallScreenContent
        roomName={route.params.roomName}
        status={status}
        desiredMicrophoneEnabled={desiredMicrophoneEnabled}
        desiredCameraEnabled={
          DIAGNOSTIC_UNPUBLISHED_VIDEO
            ? route.params.cameraEnabled
            : desiredCameraEnabled
        }
        cameraFacingMode={cameraFacingMode}
        diagnosticPreviewTrack={diagnosticPreviewTrack}
        diagnosticPreviewEnabled={Boolean(
          DIAGNOSTIC_UNPUBLISHED_VIDEO &&
            route.params.cameraEnabled &&
            diagnosticPreviewTrack,
        )}
        onMicrophoneChange={changeMicrophone}
        onCameraChange={
          DIAGNOSTIC_UNPUBLISHED_VIDEO ? async () => {} : changeCamera
        }
        onSwitchCamera={
          DIAGNOSTIC_UNPUBLISHED_VIDEO ? async () => {} : switchCamera
        }
        onLeave={() => void leaveCall()}
      />
    </RoomContext.Provider>
  );
}
