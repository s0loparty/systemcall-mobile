package com.systemcallmobile.video.diagnostics

import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface

class FramePacingDiagnosticsProcessorFactory : VideoFrameProcessorFactoryInterface {
    override fun build(): VideoFrameProcessor = FramePacingDiagnosticsProcessor()
}
