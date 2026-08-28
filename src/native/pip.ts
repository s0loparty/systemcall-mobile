import PipHandler from '@videosdk.live/react-native-pip-android';
export const pip={setCallScreenActive(active:boolean){PipHandler.setMeetingScreenState(active)},enter(width=16,height=9){PipHandler.enterPipMode(width,height)}};
