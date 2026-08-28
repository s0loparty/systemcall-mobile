# Android native integration

Native package paths assume `com.systemcallmobile`.

In generated `MainApplication.kt`, import `com.livekit.reactnative.LiveKitReactNative`, `com.livekit.reactnative.audio.AudioType`, and `com.systemcallmobile.call.BackgroundCallPackage`.

At the start of `onCreate()` call:
```kotlin
LiveKitReactNative.setup(this, AudioType.CommunicationAudioType())
```
Add `BackgroundCallPackage()` to the React package list.

Before release add explicit runtime permission flow for CAMERA, RECORD_AUDIO and POST_NOTIFICATIONS (Android 13+).

`AndroidManifest.xml` enables PiP. Foreground service must be started while the call Activity is visible, especially on Android 14+.
