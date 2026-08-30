import type {LiveKitCredentials} from '../types/api';

export type RootStackParamList = {
  Home: undefined;
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
    backgroundBlurEnabled: boolean;
  };
  Call: {
    roomName: string;
    livekit: LiveKitCredentials;
    cameraEnabled: boolean;
    microphoneEnabled: boolean;
    cameraFacingMode: 'user' | 'environment';
    backgroundBlurEnabled: boolean;
  };
};
