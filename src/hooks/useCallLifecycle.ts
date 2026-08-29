import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {AudioSession} from '@livekit/react-native';
import {
  ConnectionState,
  getLogger,
  LogLevel,
  type LocalAudioTrack,
  type LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import {backgroundCall} from '../native/backgroundCall';
import type {RootStackParamList} from '../navigation/types';

export type FacingMode = 'user' | 'environment';
export type CallStatus =
  | 'Подключение…'
  | 'В звонке'
  | 'Переподключение…'
  | 'Соединение потеряно';

type TimerHandle = ReturnType<typeof setTimeout>;
type CallRouteParams = RootStackParamList['Call'];

type CallLifecycleDeps = {
  appState?: Pick<typeof AppState, 'currentState' | 'addEventListener'>;
  audioSession?: Pick<typeof AudioSession, 'startAudioSession' | 'stopAudioSession'>;
  backgroundCall?: Pick<typeof backgroundCall, 'start' | 'stop'>;
  createRoom?: () => Room;
  loggerFactory?: typeof getLogger;
  wait?: (ms: number) => Promise<void>;
};

export type UseCallLifecycleResult = {
  room: Room;
  status: CallStatus;
  desiredMicrophoneEnabled: boolean;
  desiredCameraEnabled: boolean;
  cameraFacingMode: FacingMode;
  changeMicrophone: (enabled: boolean) => Promise<void>;
  changeCamera: (enabled: boolean) => Promise<void>;
  switchCamera: () => Promise<void>;
  leaveCall: () => Promise<void>;
};

const CALL_LOGGER_NAME = 'systemcall-mobile-call';
const waitForMs = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function useCallLifecycle(
  routeParams: CallRouteParams,
  onLeaveComplete: () => void,
  deps: CallLifecycleDeps = {},
): UseCallLifecycleResult {
  const {
    appState: injectedAppState,
    audioSession: injectedAudioSession,
    backgroundCall: injectedBackgroundCall,
    createRoom,
    loggerFactory: injectedLoggerFactory,
    wait: injectedWait,
  } = deps;

  const appStateApi = injectedAppState ?? AppState;
  const audioSession = injectedAudioSession ?? AudioSession;
  const backgroundCallApi = injectedBackgroundCall ?? backgroundCall;
  const loggerFactory = injectedLoggerFactory ?? getLogger;
  const wait = injectedWait ?? waitForMs;

  const room = useMemo(
    () =>
      createRoom?.() ??
      new Room({
        adaptiveStream: true,
        dynacast: true,
        loggerName: CALL_LOGGER_NAME,
      }),
    [createRoom],
  );

  const [status, setStatus] = useState<CallStatus>('Подключение…');
  const [desiredMicrophoneEnabled, setDesiredMicrophoneEnabled] = useState(
    routeParams.microphoneEnabled,
  );
  const [desiredCameraEnabled, setDesiredCameraEnabled] = useState(
    routeParams.cameraEnabled,
  );
  const [cameraFacingMode, setCameraFacingMode] = useState<FacingMode>(
    routeParams.cameraFacingMode,
  );

  const desiredMicrophoneRef = useRef(routeParams.microphoneEnabled);
  const desiredCameraRef = useRef(routeParams.cameraEnabled);
  const cameraFacingModeRef = useRef<FacingMode>(routeParams.cameraFacingMode);
  const appState = useRef<AppStateStatus>(appStateApi.currentState);
  const restoringMedia = useRef(false);
  const leaving = useRef(false);
  const connecting = useRef(false);
  const lastForcedCameraRecoveryAt = useRef(0);
  const lastForcedMicrophoneRecoveryAt = useRef(0);
  const timers = useRef<TimerHandle[]>([]);

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timers.current = timers.current.filter(item => item !== timer);
      if (!leaving.current) {
        callback();
      }
    }, delay);
    timers.current.push(timer);
    return timer;
  }, []);

  const clearScheduledWork = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const getCameraTrack = useCallback(() => {
    const publication = room.localParticipant.getTrackPublication(
      Track.Source.Camera,
    );
    return publication?.track as LocalVideoTrack | undefined;
  }, [room]);

  const getMicrophoneTrack = useCallback(() => {
    const publication = room.localParticipant.getTrackPublication(
      Track.Source.Microphone,
    );
    return publication?.track as LocalAudioTrack | undefined;
  }, [room]);

  const ensureAudioSession = useCallback(async () => {
    if (leaving.current) {
      return;
    }

    try {
      await audioSession.startAudioSession();
    } catch (error) {
      if (!leaving.current) {
        console.warn('LiveKit audio session resume failed', error);
      }
    }
  }, [audioSession]);

  const ensureForegroundService = useCallback(async () => {
    if (leaving.current) {
      return;
    }

    try {
      await backgroundCallApi.start();
    } catch (error) {
      if (!leaving.current) {
        console.warn('Background call service resume failed', error);
      }
    }
  }, [backgroundCallApi]);

  const applyCameraFacingMode = useCallback(async () => {
    if (leaving.current) {
      return;
    }

    const track = getCameraTrack();
    if (track) {
      await track.restartTrack({facingMode: cameraFacingModeRef.current});
    }
  }, [getCameraTrack]);

  const restoreMicrophone = useCallback(
    async (forceRecreate = false) => {
      if (leaving.current) {
        return;
      }

      if (!desiredMicrophoneRef.current) {
        await room.localParticipant.setMicrophoneEnabled(false);
        return;
      }

      if (forceRecreate) {
        const now = Date.now();
        if (now - lastForcedMicrophoneRecoveryAt.current < 1200) {
          return;
        }
        lastForcedMicrophoneRecoveryAt.current = now;

        await room.localParticipant.setMicrophoneEnabled(false);
        await wait(150);
        if (leaving.current) {
          return;
        }
      }

      const track = getMicrophoneTrack();
      if (forceRecreate && track) {
        try {
          await track.restartTrack();
        } catch (error) {
          console.warn('LiveKit microphone restart failed', error);
        }
      }

      await room.localParticipant.setMicrophoneEnabled(true);
    },
    [getMicrophoneTrack, room, wait],
  );

  const restoreCamera = useCallback(
    async (forceRecreate = false) => {
      if (leaving.current) {
        return;
      }

      if (!desiredCameraRef.current) {
        await room.localParticipant.setCameraEnabled(false);
        return;
      }

      if (forceRecreate) {
        const now = Date.now();
        if (now - lastForcedCameraRecoveryAt.current < 2500) {
          return;
        }
        lastForcedCameraRecoveryAt.current = now;

        await room.localParticipant.setCameraEnabled(false);
        await wait(250);
        if (leaving.current) {
          return;
        }
      }

      await room.localParticipant.setCameraEnabled(true, {
        facingMode: cameraFacingModeRef.current,
      });
    },
    [room, wait],
  );

  const syncDesiredMedia = useCallback(
    async (forceRecovery = false) => {
      if (
        leaving.current ||
        restoringMedia.current ||
        room.state !== ConnectionState.Connected
      ) {
        return;
      }

      restoringMedia.current = true;
      try {
        await ensureAudioSession();
        await ensureForegroundService();

        if (forceRecovery) {
          const hasPublishedTracks =
            !!getCameraTrack() || !!getMicrophoneTrack();
          if (hasPublishedTracks) {
            await room.localParticipant.republishAllTracks(undefined, true);
            await wait(200);
          }
        }

        await restoreMicrophone(forceRecovery);
        if (!leaving.current) {
          await restoreCamera(forceRecovery);
        }
      } catch (error) {
        if (!leaving.current) {
          console.warn('LiveKit local media restore failed', error);
        }
      } finally {
        restoringMedia.current = false;
      }
    },
    [
      ensureAudioSession,
      ensureForegroundService,
      getCameraTrack,
      getMicrophoneTrack,
      restoreCamera,
      restoreMicrophone,
      room,
      wait,
    ],
  );

  const connectRoom = useCallback(
    async (recovering = false) => {
      if (leaving.current || connecting.current) {
        return;
      }

      if (
        room.state === ConnectionState.Reconnecting ||
        room.state === ConnectionState.SignalReconnecting
      ) {
        setStatus('Переподключение…');
        return;
      }

      if (room.state === ConnectionState.Connected) {
        await syncDesiredMedia(recovering);
        return;
      }

      connecting.current = true;
      setStatus(recovering ? 'Переподключение…' : 'Подключение…');

      try {
        await ensureAudioSession();
        await room.connect(routeParams.livekit.url, routeParams.livekit.token);
      } catch (error) {
        if (!leaving.current) {
          console.warn('LiveKit connect failed', error);
          setStatus('Соединение потеряно');
        }
      } finally {
        connecting.current = false;
      }
    },
    [ensureAudioSession, room, routeParams.livekit.token, routeParams.livekit.url, syncDesiredMedia],
  );

  const handleAppForeground = useCallback(async () => {
    if (leaving.current) {
      return;
    }

    if (
      room.state === ConnectionState.Reconnecting ||
      room.state === ConnectionState.SignalReconnecting
    ) {
      setStatus('Переподключение…');
      return;
    }

    if (room.state === ConnectionState.Connected) {
      await wait(1200);
      if (!leaving.current && room.state === ConnectionState.Connected) {
        await syncDesiredMedia(true);
      }
      return;
    }

    if (room.state === ConnectionState.Disconnected) {
      await connectRoom(true);
    }
  }, [connectRoom, room, syncDesiredMedia, wait]);

  const releaseLocalMedia = useCallback(async () => {
    const tasks: Promise<unknown>[] = [];

    tasks.push(
      room.localParticipant.setCameraEnabled(false).catch(error => {
        console.warn('LiveKit camera release failed', error);
      }),
    );
    tasks.push(
      room.localParticipant.setMicrophoneEnabled(false).catch(error => {
        console.warn('LiveKit microphone release failed', error);
      }),
    );

    await Promise.all(tasks);
  }, [room]);

  const leaveCall = useCallback(async () => {
    if (leaving.current) {
      return;
    }

    leaving.current = true;
    clearScheduledWork();

    try {
      await releaseLocalMedia();
    } catch {}

    try {
      loggerFactory(CALL_LOGGER_NAME).setLevel(LogLevel.silent);
      if (room.state !== ConnectionState.Disconnected) {
        await room.disconnect(true);
      }
    } catch (error) {
      console.warn('LiveKit graceful disconnect failed', error);
    }

    try {
      await backgroundCallApi.stop();
    } catch (error) {
      console.warn('Background call service stop failed', error);
    }

    try {
      await audioSession.stopAudioSession();
    } catch (error) {
      console.warn('LiveKit audio session stop failed', error);
    }

    onLeaveComplete();
  }, [
    audioSession,
    backgroundCallApi,
    clearScheduledWork,
    loggerFactory,
    onLeaveComplete,
    releaseLocalMedia,
    room,
  ]);

  useEffect(() => {
    loggerFactory(CALL_LOGGER_NAME).setLevel(LogLevel.info);

    const handleConnected = () => {
      if (!leaving.current) {
        setStatus('В звонке');
        schedule(() => void syncDesiredMedia(true), 200);
      }
    };

    const handleReconnected = () => {
      if (leaving.current) {
        return;
      }
      setStatus('В звонке');
      schedule(() => void syncDesiredMedia(true), 900);
    };

    const handleReconnecting = () => {
      if (!leaving.current) {
        setStatus('Переподключение…');
      }
    };

    const handleDisconnected = () => {
      if (!leaving.current) {
        setStatus('Соединение потеряно');
      }
    };

    room
      .on(RoomEvent.Connected, handleConnected)
      .on(RoomEvent.Reconnected, handleReconnected)
      .on(RoomEvent.Reconnecting, handleReconnecting)
      .on(RoomEvent.SignalReconnecting, handleReconnecting)
      .on(RoomEvent.Disconnected, handleDisconnected);

    void connectRoom(false);

    const subscription = appStateApi.addEventListener('change', nextState => {
      const previousState = appState.current;
      appState.current = nextState;

      if (
        !leaving.current &&
        nextState === 'active' &&
        (previousState === 'background' || previousState === 'inactive')
      ) {
        schedule(() => void handleAppForeground(), 500);
      }
    });

    return () => {
      leaving.current = true;
      clearScheduledWork();
      subscription.remove();
      room
        .off(RoomEvent.Connected, handleConnected)
        .off(RoomEvent.Reconnected, handleReconnected)
        .off(RoomEvent.Reconnecting, handleReconnecting)
        .off(RoomEvent.SignalReconnecting, handleReconnecting)
        .off(RoomEvent.Disconnected, handleDisconnected);
      void releaseLocalMedia().catch(() => undefined);
      void backgroundCallApi.stop().catch(error => {
        console.warn('Background call service stop failed', error);
      });
      void audioSession.stopAudioSession().catch(error => {
        console.warn('LiveKit audio session stop failed', error);
      });
      if (room.state !== ConnectionState.Disconnected) {
        void room.disconnect(true).catch(error => {
          console.warn('LiveKit cleanup disconnect failed', error);
        });
      }
    };
  }, [
    appStateApi,
    audioSession,
    backgroundCallApi,
    clearScheduledWork,
    connectRoom,
    handleAppForeground,
    loggerFactory,
    releaseLocalMedia,
    room,
    schedule,
    syncDesiredMedia,
  ]);

  const changeMicrophone = useCallback(
    async (enabled: boolean) => {
      if (leaving.current) {
        return;
      }

      desiredMicrophoneRef.current = enabled;
      setDesiredMicrophoneEnabled(enabled);
      try {
        if (enabled) {
          await restoreMicrophone(true);
        } else {
          await room.localParticipant.setMicrophoneEnabled(false);
        }
      } catch (error) {
        console.warn('LiveKit microphone toggle failed', error);
      }
    },
    [restoreMicrophone, room],
  );

  const changeCamera = useCallback(
    async (enabled: boolean) => {
      if (leaving.current) {
        return;
      }

      desiredCameraRef.current = enabled;
      setDesiredCameraEnabled(enabled);
      try {
        if (enabled) {
          await restoreCamera(true);
        } else {
          await room.localParticipant.setCameraEnabled(false);
        }
      } catch (error) {
        console.warn('LiveKit camera toggle failed', error);
      }
    },
    [restoreCamera, room],
  );

  const switchCamera = useCallback(async () => {
    if (leaving.current) {
      return;
    }

    const next: FacingMode =
      cameraFacingModeRef.current === 'user' ? 'environment' : 'user';
    cameraFacingModeRef.current = next;
    setCameraFacingMode(next);

    if (!desiredCameraRef.current) {
      return;
    }

    try {
      await applyCameraFacingMode();
    } catch (error) {
      console.warn('LiveKit camera switch failed', error);
    }
  }, [applyCameraFacingMode]);

  return {
    room,
    status,
    desiredMicrophoneEnabled,
    desiredCameraEnabled,
    cameraFacingMode,
    changeMicrophone,
    changeCamera,
    switchCamera,
    leaveCall,
  };
}
