import React from 'react';
import {ConnectionState, LogLevel, RoomEvent, Track} from 'livekit-client';

const TestRenderer = require('react-test-renderer') as {
  act: (fn: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => {unmount: () => void};
};

const {act, create} = TestRenderer;

jest.mock('@livekit/react-native', () => ({
  AudioSession: {
    startAudioSession: jest.fn(async () => undefined),
    stopAudioSession: jest.fn(async () => undefined),
  },
}));

const {useCallLifecycle} =
  require('../useCallLifecycle') as typeof import('../useCallLifecycle');
type UseCallLifecycleResult =
  import('../useCallLifecycle').UseCallLifecycleResult;

type Listener = (...args: unknown[]) => void;

type FakeTrack = {
  restartTrack: jest.Mock<Promise<void>, [unknown?]>;
};

type FakeRoom = {
  state: ConnectionState;
  connect: jest.Mock<Promise<void>, [string, string]>;
  disconnect: jest.Mock<Promise<void>, [boolean?]>;
  localParticipant: {
    getTrackPublication: (
      source: Track.Source,
    ) => {track?: FakeTrack} | undefined;
    setCameraEnabled: jest.Mock<Promise<void>, [boolean, unknown?]>;
    setMicrophoneEnabled: jest.Mock<Promise<void>, [boolean]>;
    republishAllTracks: jest.Mock<Promise<void>, [unknown?, boolean?]>;
  };
  on: (event: RoomEvent, listener: Listener) => FakeRoom;
  off: (event: RoomEvent, listener: Listener) => FakeRoom;
  emit: (event: RoomEvent, ...args: unknown[]) => void;
};

const routeParams = {
  roomName: 'Комната',
  livekit: {
    url: 'wss://example.test',
    token: 'token',
    room_name: 'room',
    identity: 'guest',
    expires_in: 3600,
  },
  cameraEnabled: true,
  microphoneEnabled: true,
  cameraFacingMode: 'user' as const,
  cameraQualityPresetId: 'medium' as const,
  backgroundBlurEnabled: true,
};

function createFakeRoom(initialState: ConnectionState): FakeRoom {
  const listeners = new Map<RoomEvent, Set<Listener>>();
  const microphoneTrack: FakeTrack = {
    restartTrack: jest.fn(async (_options?: unknown) => undefined),
  };
  const cameraTrack: FakeTrack = {
    restartTrack: jest.fn(async (_options?: unknown) => undefined),
  };

  const room: FakeRoom = {
    state: initialState,
    connect: jest.fn(async (_url: string, _token: string) => undefined),
    disconnect: jest.fn(async (_stopTracks?: boolean) => undefined),
    localParticipant: {
      getTrackPublication: (source: Track.Source) => {
        if (source === Track.Source.Camera) {
          return {track: cameraTrack};
        }
        if (source === Track.Source.Microphone) {
          return {track: microphoneTrack};
        }
        return undefined;
      },
      setCameraEnabled: jest.fn(
        async (_enabled: boolean, _options?: unknown) => undefined,
      ),
      setMicrophoneEnabled: jest.fn(async (_enabled: boolean) => undefined),
      republishAllTracks: jest.fn(
        async (_options?: unknown, _restartTracks?: boolean) => undefined,
      ),
    },
    on: (event, listener) => {
      const current = listeners.get(event) ?? new Set<Listener>();
      current.add(listener);
      listeners.set(event, current);
      return room;
    },
    off: (event, listener) => {
      listeners.get(event)?.delete(listener);
      return room;
    },
    emit: (event, ...args) => {
      listeners.get(event)?.forEach(listener => listener(...args));
    },
  };

  return room;
}

function createFakeAppState(
  initialState: 'active' | 'background' | 'inactive' = 'active',
) {
  const listeners = new Set<
    (state: 'active' | 'background' | 'inactive') => void
  >();

  return {
    currentState: initialState,
    addEventListener: jest.fn(
      (
        _event: 'change',
        listener: (state: 'active' | 'background' | 'inactive') => void,
      ) => {
        listeners.add(listener);
        return {
          remove: () => listeners.delete(listener),
        };
      },
    ),
    emit(state: 'active' | 'background' | 'inactive') {
      this.currentState = state;
      listeners.forEach(listener => listener(state));
    },
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useCallLifecycle', () => {
  let renderer: {unmount: () => void} | undefined;
  let latest: UseCallLifecycleResult | undefined;

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
      renderer = undefined;
    }
    latest = undefined;
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  function renderHook({
    room,
    appState,
    onLeaveComplete = jest.fn(),
  }: {
    room: FakeRoom;
    appState: ReturnType<typeof createFakeAppState>;
    onLeaveComplete?: jest.Mock;
  }) {
    const audioSession = {
      startAudioSession: jest.fn(async () => undefined),
      stopAudioSession: jest.fn(async () => undefined),
    };
    const backgroundCall = {
      start: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
    };
    const logger = {setLevel: jest.fn()};
    const loggerFactory = jest.fn(() => logger);
    const applyBackgroundBlur = jest.fn();

    function Harness() {
      latest = useCallLifecycle(routeParams, onLeaveComplete, {
        appState,
        audioSession,
        backgroundCall,
        createRoom: () => room as never,
        loggerFactory: loggerFactory as never,
        wait: async () => undefined,
        applyBackgroundBlur: applyBackgroundBlur as never,
      });
      return null;
    }

    act(() => {
      renderer = create(React.createElement(Harness));
    });

    return {
      audioSession,
      backgroundCall,
      logger,
      loggerFactory,
      onLeaveComplete,
      applyBackgroundBlur,
    };
  }

  it('restores media stack and republishes tracks when app returns foreground while connected', async () => {
    jest.useFakeTimers();
    const room = createFakeRoom(ConnectionState.Connected);
    const appState = createFakeAppState();
    const deps = renderHook({room, appState});

    await flush();

    appState.emit('background');
    appState.emit('active');

    act(() => {
      jest.advanceTimersByTime(500);
    });
    await flush();

    expect(deps.audioSession.startAudioSession).toHaveBeenCalled();
    expect(deps.backgroundCall.start).toHaveBeenCalled();
    expect(room.connect).not.toHaveBeenCalled();
    expect(room.localParticipant.republishAllTracks).toHaveBeenCalledWith(
      undefined,
      true,
    );
    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledWith(false);
    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledWith(true, {
      facingMode: 'user',
      resolution: {width: 854, height: 480, frameRate: 15},
    });
    expect(deps.applyBackgroundBlur).toHaveBeenCalledWith(
      expect.objectContaining({restartTrack: expect.any(Function)}),
      true,
    );
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(
      false,
    );
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(
      true,
    );
  });

  it('marks status reconnecting on foreground when room is reconnecting and does not start second connect', async () => {
    jest.useFakeTimers();
    const room = createFakeRoom(ConnectionState.Reconnecting);
    const appState = createFakeAppState();
    renderHook({room, appState});

    appState.emit('background');
    appState.emit('active');

    act(() => {
      jest.advanceTimersByTime(500);
    });
    await flush();

    expect(room.connect).not.toHaveBeenCalled();
    expect(room.localParticipant.republishAllTracks).not.toHaveBeenCalled();
    expect(latest?.status).toBe('Переподключение…');
  });

  it('connects again on foreground when room was disconnected', async () => {
    jest.useFakeTimers();
    const room = createFakeRoom(ConnectionState.Disconnected);
    const appState = createFakeAppState();
    const deps = renderHook({room, appState});

    await flush();

    expect(deps.audioSession.startAudioSession).toHaveBeenCalledTimes(1);
    expect(room.connect).toHaveBeenCalledWith('wss://example.test', 'token');

    appState.emit('background');
    appState.emit('active');

    act(() => {
      jest.advanceTimersByTime(500);
    });
    await flush();

    expect(room.connect).toHaveBeenCalledTimes(2);
    expect(latest?.status).toBe('Переподключение…');
  });

  it('disconnects, releases local media, silences logger, and completes leave flow', async () => {
    const room = createFakeRoom(ConnectionState.Connected);
    const appState = createFakeAppState();
    const deps = renderHook({room, appState});

    await act(async () => {
      await latest?.leaveCall();
    });

    expect(deps.backgroundCall.stop).toHaveBeenCalled();
    expect(deps.loggerFactory).toHaveBeenCalled();
    expect(deps.logger.setLevel).toHaveBeenCalledWith(LogLevel.silent);
    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledWith(false);
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(
      false,
    );
    expect(room.disconnect).toHaveBeenCalledWith(true);
    expect(deps.onLeaveComplete).toHaveBeenCalled();
  });

  it('recreates microphone track when user enables microphone', async () => {
    const room = createFakeRoom(ConnectionState.Connected);
    const appState = createFakeAppState();
    renderHook({room, appState});

    await act(async () => {
      await latest?.changeMicrophone(false);
      await latest?.changeMicrophone(true);
    });

    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenNthCalledWith(
      1,
      false,
    );
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenNthCalledWith(
      2,
      false,
    );
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenNthCalledWith(
      3,
      true,
    );
  });

  it('restarts camera with selected quality preset when switching facing mode', async () => {
    const room = createFakeRoom(ConnectionState.Connected);
    const appState = createFakeAppState();
    const deps = renderHook({room, appState});
    const cameraTrack = room.localParticipant.getTrackPublication(
      Track.Source.Camera,
    )?.track;

    await act(async () => {
      await latest?.switchCamera();
    });

    expect(cameraTrack?.restartTrack).toHaveBeenCalledWith({
      facingMode: 'environment',
      resolution: {width: 854, height: 480, frameRate: 15},
    });
    expect(deps.applyBackgroundBlur).toHaveBeenCalledWith(cameraTrack, true);
  });
});
