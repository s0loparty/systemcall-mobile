import {NativeModules, Platform} from 'react-native';
type StartOptions = {
  cameraEnabled?: boolean;
  microphoneEnabled?: boolean;
};
type Module = {
  start(cameraEnabled: boolean, microphoneEnabled: boolean): Promise<void>;
  stop(): Promise<void>;
};
const nativeModule = NativeModules.BackgroundCall as Module | undefined;
export const backgroundCall = {
  async start({
    cameraEnabled = true,
    microphoneEnabled = true,
  }: StartOptions = {}) {
    if (Platform.OS !== 'android') return;
    if (!nativeModule) {
      console.warn('BackgroundCall native module is not installed');
      return;
    }
    await nativeModule.start(cameraEnabled, microphoneEnabled);
  },
  async stop() {
    if (Platform.OS !== 'android' || !nativeModule) return;
    await nativeModule.stop();
  },
};
