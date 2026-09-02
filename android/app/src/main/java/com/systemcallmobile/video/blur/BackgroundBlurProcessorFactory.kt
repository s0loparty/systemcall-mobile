package com.systemcallmobile.video.blur

import android.content.Context
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface

class BackgroundBlurProcessorFactory(
    private val appContext: Context,
) : VideoFrameProcessorFactoryInterface {
    override fun build(): VideoFrameProcessor = BackgroundBlurProcessor(appContext)
}
