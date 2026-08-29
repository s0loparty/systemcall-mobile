import {NativeModules, Platform} from 'react-native';
type Module = {start(): Promise<void>; stop(): Promise<void>};
const nativeModule = NativeModules.BackgroundCall as Module | undefined;
export const backgroundCall = {
  async start() {
    if (Platform.OS !== 'android') return;
    if (!nativeModule) {
      console.warn('BackgroundCall native module is not installed');
      return;
    }
    await nativeModule.start();
  },
  async stop() {
    if (Platform.OS !== 'android' || !nativeModule) return;
    await nativeModule.stop();
  },
};
