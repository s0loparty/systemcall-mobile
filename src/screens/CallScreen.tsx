import React, {useCallback, useEffect, useMemo} from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RoomContext} from '@livekit/react-native';
import {Room} from 'livekit-client';
import {CallScreenContent} from '../components/call/CallScreenContent';
import {useCallLifecycle} from '../hooks/useCallLifecycle';
import {pip} from '../native/pip';
import {useCameraSettings} from '../settings/CameraSettingsContext';
import {getCameraCaptureOptions} from '../settings/cameraQuality';
import type {RootStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Call'>;

export function CallScreen({route, navigation}: Props) {
  const {qualityPresetId} = useCameraSettings();
  const configuredRoom = useMemo(
    () =>
      new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: getCameraCaptureOptions(
          qualityPresetId,
          route.params.cameraFacingMode,
        ),
      }),
    [qualityPresetId, route.params.cameraFacingMode],
  );
  const createRoom = useCallback(() => configuredRoom, [configuredRoom]);

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
  } = useCallLifecycle(route.params, () => navigation.popToTop(), {createRoom});

  useEffect(() => {
    pip.setCallScreenActive(true);
    return () => {
      pip.setCallScreenActive(false);
    };
  }, []);

  return (
    <RoomContext.Provider value={room}>
      <CallScreenContent
        roomName={route.params.roomName}
        status={status}
        desiredMicrophoneEnabled={desiredMicrophoneEnabled}
        desiredCameraEnabled={desiredCameraEnabled}
        cameraFacingMode={cameraFacingMode}
        onMicrophoneChange={changeMicrophone}
        onCameraChange={changeCamera}
        onSwitchCamera={switchCamera}
        onLeave={() => void leaveCall()}
      />
    </RoomContext.Provider>
  );
}
