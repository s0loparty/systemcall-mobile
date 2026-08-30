package com.systemcallmobile.video.blur

import android.content.Context
import android.util.Log
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import com.systemcallmobile.BuildConfig
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoFrame

class BackgroundBlurProcessor(
    context: Context,
) : VideoFrameProcessor {
    private val segmentationEngine = SegmentationEngine()
    private val renderer = BackgroundBlurRenderer(context.applicationContext)
    private var inputFrames = 0
    private var outputFrames = 0
    private var droppedFrames = 0
    private var totalRenderMs = 0L
    private var lastStatsLogMs = System.currentTimeMillis()

    override fun process(frame: VideoFrame, textureHelper: SurfaceTextureHelper): VideoFrame? {
        return try {
            inputFrames++
            segmentationEngine.maybeStart(frame)
            val mask = segmentationEngine.currentMask()
            if (mask == null) {
                droppedFrames++
                maybeLogStats()
                return null
            }
            val startedAtNs = System.nanoTime()
            val output = renderer.render(frame, mask, textureHelper)
            totalRenderMs += (System.nanoTime() - startedAtNs) / 1_000_000L
            outputFrames++
            maybeLogStats()
            output
        } catch (error: Throwable) {
            droppedFrames++
            maybeLogStats()
            Log.w(TAG, "Background blur processing failed", error)
            null
        }
    }

    private fun maybeLogStats() {
        if (!BuildConfig.DEBUG) return
        val now = System.currentTimeMillis()
        val elapsedMs = now - lastStatsLogMs
        if (elapsedMs < STATS_INTERVAL_MS) return

        val seconds = elapsedMs.toFloat() / 1000f
        val segmentationStats = segmentationEngine.consumeStats()
        val avgRenderMs =
            if (outputFrames > 0) totalRenderMs.toFloat() / outputFrames.toFloat() else 0f
        Log.d(
            TAG,
            "BlurPerformance: inputFps=${inputFrames / seconds}, " +
                "outputFps=${outputFrames / seconds}, " +
                "segmentationFps=${segmentationStats.completedCount / seconds}, " +
                "avgSegmentationMs=${segmentationStats.averageDurationMs}, " +
                "avgRenderMs=$avgRenderMs, droppedFrames=$droppedFrames",
        )

        inputFrames = 0
        outputFrames = 0
        droppedFrames = 0
        totalRenderMs = 0
        lastStatsLogMs = now
    }

    companion object {
        private const val TAG = "SystemCall.BackgroundBlur"
        private const val STATS_INTERVAL_MS = 4_000L
    }
}
