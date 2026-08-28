# SystemCall Mobile MVP

Minimal Android React Native client for the SystemCall Laravel + LiveKit backend.

## MVP flow

1. Paste a normal SystemCall room URL.
2. Parse `roomId/publicId`.
3. Check that the room exists.
4. Show camera preview and mic/camera toggles.
5. Join as a guest through the mobile join endpoint.
6. Connect to LiveKit.
7. Keep the call alive when the app goes to background.
8. Enter Android Picture-in-Picture when the call screen is minimized.

## Deliberately excluded

Authentication, registration, Reverb, waiting room UI, moderation, chat, subrooms,
screen sharing, push notifications and call history.

## Expected backend contract

The mobile client is intentionally isolated behind `src/api/rooms.ts`.

Expected endpoints:

- `GET /api/mobile/rooms/{publicId}`
- `POST /api/mobile/rooms/{publicId}/join`

Example join response:

```json
{
  "room": {
    "public_id": "abc123",
    "name": "Demo call"
  },
  "member": {
    "id": 10,
    "display_name": "Guest",
    "livekit_identity": "guest_x"
  },
  "livekit": {
    "url": "wss://livekit.example.com",
    "token": "...",
    "room_name": "room_abc123",
    "identity": "guest_x",
    "expires_in": 3600
  }
}
```

If the backend contract changes, adapt **only** `src/api/*` and shared types when possible.

## Setup

This repository contains the application source layer plus the Android native files that
matter for foreground calls/PiP. It is meant to be placed into a fresh React Native CLI project.

Recommended bootstrap:

```bash
npx @react-native-community/cli init SystemCallMobile
```

Then copy the repository contents over the generated project and run:

```bash
npm install
npm run android
```

LiveKit requires native setup and `registerGlobals()`. The project already calls
`registerGlobals()` in `index.js`.

## API base URL

Change `src/config.ts` during local development or wire it to your preferred env solution.

For an Android emulator, remember that `localhost` points to the emulator itself.
Use `10.0.2.2` for a Laravel server running on the host machine.

## Android PiP / foreground service

PiP is exposed through `src/native/pip.ts`.

Foreground service is exposed through `src/native/backgroundCall.ts` and a tiny Kotlin native module.
The service starts only while an active call exists and shows a persistent Android notification.

The provided native code is intentionally small and isolated so it can be replaced later without
rewriting the React Native call screens.

## Important

The backend does not yet expose the proposed `/api/mobile` endpoints. Until it does,
the call join request will fail. This is intentional: the UI/live-call architecture is already wired
against the agreed mobile API instead of coupling the app to the current browser-cookie flow.
