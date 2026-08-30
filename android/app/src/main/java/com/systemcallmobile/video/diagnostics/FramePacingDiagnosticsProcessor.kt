package com.systemcallmobile.video.diagnostics

import android.util.Log
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoFrame

class FramePacingDiagnosticsProcessor : VideoFrameProcessor {
    private var inputFrames = 0
    private var previousFrameArrivalNs = 0L
    private var maxFrameGapMs = 0f
    private var frameGapSpikes = 0
    private var lastStatsLogMs = System.currentTimeMillis()

    override fun process(frame: VideoFrame, textureHelper: SurfaceTextureHelper): VideoFrame {
        val nowNs = System.nanoTime()
        if (previousFrameArrivalNs != 0L) {
            val gapMs = (nowNs - previousFrameArrivalNs) / 1_000_000f
            maxFrameGapMs = maxOf(maxFrameGapMs, gapMs)
            if (gapMs >= FRAME_GAP_SPIKE_THRESHOLD_MS) {
                frameGapSpikes++
            }
        }
        previousFrameArrivalNs = nowNs
        inputFrames++

        maybeLogStats()

        // VideoEffectProcessor releases both the processor output and its retained
        // input frame after forwarding to the sink. Because this diagnostics
        // processor returns the exact same VideoFrame instance, retain once more
        // so those two releases stay balanced.
        frame.retain()
        return frame
    }

    private fun maybeLogStats() {
        val now = System.currentTimeMillis()
        val elapsedMs = now - lastStatsLogMs
        if (elapsedMs < STATS_INTERVAL_MS) return

        val seconds = elapsedMs.toFloat() / 1000f
        Log.i(
            TAG,
            "CameraFramePacing: mode=blur-off, inputFps=${inputFrames / seconds}, " +
                "maxFrameGapMs=$maxFrameGapMs, frameGapSpikes=$frameGapSpikes, " +
                "thread=${Thread.currentThread().name}",
        )

        inputFrames = 0
        maxFrameGapMs = 0f
        frameGapSpikes = 0
        lastStatsLogMs = now
    }

    companion object {
        private const val TAG = "SystemCall.FramePacing"
        private const val STATS_INTERVAL_MS = 4_000L
        private const val FRAME_GAP_SPIKE_THRESHOLD_MS = 50f
    }
}
