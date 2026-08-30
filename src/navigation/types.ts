import type {LiveKitCredentials} from '../types/api';
import type {CameraQualityPresetId} from '../settings/cameraQuality';

export type RootStackParamList = {
  Home: undefined;
  Settings: undefined;
  PreJoin: {
    publicId: string;
    roomName: string;
    hasPassword: boolean;
    waitingRoomEnabled: boolean;
  };
  WaitingRoom: {
    publicId: string;
    roomName: string;
    waitingToken: string;
    cameraEnabled: boolean;
    microphoneEnabled: boolean;
    cameraFacingMode: 'user' | 'environment';
    cameraQualityPresetId: CameraQualityPresetId;
    backgroundBlurEnabled: boolean;
  };
  Call: {
    roomName: string;
    livekit: LiveKitCredentials;
    cameraEnabled: boolean;
    microphoneEnabled: boolean;
    cameraFacingMode: 'user' | 'environment';
    cameraQualityPresetId: CameraQualityPresetId;
    backgroundBlurEnabled: boolean;
  };
};
