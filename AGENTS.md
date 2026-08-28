# SystemCall Mobile MVP — AI Agent Rules

## Mission
Maintain a deliberately small Android MVP client for the existing SystemCall platform.

Core flow: **paste room link → prejoin camera/mic → join LiveKit → call → minimize → Android PiP/background → return → leave**.

Do not expand scope unless explicitly requested.

## Backend
Main backend: `s0loparty/systemcall` (Laravel + PostgreSQL + Redis + LiveKit; Reverb is used by web).

The web guest flow is cookie-based. Mobile must use the dedicated mobile API and must not emulate browser cookies/sessions.

Expected endpoints:
- `GET /api/mobile/rooms/{publicId}`
- `POST /api/mobile/rooms/{publicId}/join`

`POST join` creates guest membership and returns a short-lived LiveKit token in one request.

## MVP scope
Required: Android, React Native + TypeScript, no auth, pasted HTTPS room URL, prejoin camera preview, mic/camera toggles, front/back switch, LiveKit call screen, remote video, leave call, PiP, foreground/background call service, basic reconnect handling.

Not required: auth, deep/App Links, Reverb, waiting-room UI, moderation, chat, pinning, subrooms, screen sharing, push notifications, call history, iOS.

## Architecture rules
1. Laravel HTTP details belong in `src/api`; screens must not know endpoint paths/raw quirks.
2. LiveKit owns media and media-session participant state. Do not add Reverb to duplicate it.
3. Android-specific behavior stays behind `src/native/pip.ts` and `src/native/backgroundCall.ts`.
4. Keep one LiveKit room connection for the full call lifecycle. Entering PiP must not reconnect.
5. Start foreground service for an active call; stop it and release media when the call ends.
6. Do not add Redux/Zustand/MobX without a concrete need.
7. Show explicit errors for malformed URL, missing room, backend failure, denied permissions and LiveKit failure.
8. URL parsing stays in `src/utils/roomLink.ts`. MVP accepts a pasted normal URL only.
9. Never embed LiveKit API secret, Laravel secrets or permanent tokens.
10. Keep UI mobile-first: primary video/grid, small local overlay, bottom controls, large touch targets.

## Definition of Done
On physical Android devices: paste valid link; prejoin preview works; mic/camera toggle; join guest; two-way audio/video; switch camera; Home enters PiP; media continues; return without second LiveKit connection; hang up; foreground notification disappears; media resources release.

Test PiP/background on at least two physical Android devices before calling it stable.

## AI change policy
Before implementing: verify MVP scope, reuse adapters/hooks, avoid unnecessary dependencies, isolate native Android changes, and update this file whenever architecture/scope changes.
