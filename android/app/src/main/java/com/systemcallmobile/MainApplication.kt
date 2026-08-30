package com.systemcallmobile

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.livekit.reactnative.LiveKitReactNative
import com.livekit.reactnative.audio.AudioType
import com.oney.WebRTCModule.videoEffects.ProcessorProvider
import com.systemcallmobile.call.BackgroundCallPackage
import com.systemcallmobile.video.blur.BackgroundBlurProcessorFactory
import com.systemcallmobile.video.diagnostics.FramePacingDiagnosticsProcessorFactory

class MainApplication : Application(), ReactApplication {
    override val reactNativeHost: ReactNativeHost =
        object : DefaultReactNativeHost(this) {
            override fun getPackages(): List<ReactPackage> =
                PackageList(this).packages.apply {
                    add(BackgroundCallPackage())
                }

            override fun getJSMainModuleName(): String = "index"
            override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG
            override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
            override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
        }

    override val reactHost: ReactHost
        get() = getDefaultReactHost(applicationContext, reactNativeHost)

    override fun onCreate() {
        super.onCreate()
        LiveKitReactNative.setup(this, AudioType.CommunicationAudioType())
        ProcessorProvider.addProcessor(
            "systemcall-background-blur",
            BackgroundBlurProcessorFactory(this),
        )
        ProcessorProvider.addProcessor(
            "systemcall-frame-pacing-diagnostics",
            FramePacingDiagnosticsProcessorFactory(),
        )
        loadReactNative(this)
    }
}
