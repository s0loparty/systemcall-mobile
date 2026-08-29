package com.systemcallmobile.call

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class BackgroundCallModule(
    private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context) {
    override fun getName() = "BackgroundCall"

    @ReactMethod
    fun start(cameraEnabled: Boolean, microphoneEnabled: Boolean, promise: Promise) {
        try {
            val intent =
                Intent(context, CallForegroundService::class.java)
                    .putExtra(CallForegroundService.EXTRA_CAMERA_ENABLED, cameraEnabled)
                    .putExtra(
                        CallForegroundService.EXTRA_MICROPHONE_ENABLED,
                        microphoneEnabled,
                    )

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            promise.resolve(null)
        } catch (e: Throwable) {
            promise.reject("BACKGROUND_CALL_START_FAILED", e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            context.stopService(Intent(context, CallForegroundService::class.java))
            promise.resolve(null)
        } catch (e: Throwable) {
            promise.reject("BACKGROUND_CALL_STOP_FAILED", e)
        }
    }
}
