# Known limitations

1. The agreed Laravel `/api/mobile` endpoints do not exist yet.
2. Runtime camera/microphone permission UX still needs explicit implementation.
3. LiveKit RN rendering APIs may require small adjustment to the installed SDK version.
4. Native sample package is `com.systemcallmobile`.
5. Patch `MainApplication.kt` as described in `android/NATIVE_SETUP.md`.
6. PiP/background must be tested on physical Android 13/14/15 devices.
7. OEM battery managers can impose device-specific restrictions.
8. Waiting room, Reverb, auth, moderation, chat, subrooms and screen sharing are intentionally absent.
