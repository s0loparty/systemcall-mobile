package com.systemcallmobile

import android.content.res.Configuration
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import live.videosdk.pipmode.AndroidPipModule

class MainActivity : ReactActivity() {
    override fun getMainComponentName(): String = "SystemCallMobile"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        AndroidPipModule.pipModeReq()
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration,
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        AndroidPipModule.pipModeChanged(isInPictureInPictureMode)
    }
}
