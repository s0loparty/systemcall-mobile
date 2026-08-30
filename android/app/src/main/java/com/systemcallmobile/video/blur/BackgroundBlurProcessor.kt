package com.systemcallmobile.video.blur

import android.content.Context
import android.util.Log
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoFrame

class BackgroundBlurProcessor(
    context: Context,
) : VideoFrameProcessor {
    private val segmentationEngine = SegmentationEngine()
    private val segmentationSampler = GpuSegmentationSampler()
    private val renderer = BackgroundBlurRenderer(context.applicationContext)
    private var inputFrames = 0
    private var outputFrames = 0
    private var droppedFrames = 0
    private var totalRenderMs = 0L
    private var lastStatsLogMs = System.currentTimeMillis()
    private var firstFrameLogged = false
    private var firstMaskLogged = false
    private var firstOutputLogged = false
    private var previousFrameArrivalNs = 0L
    private var maxFrameGapMs = 0f
    private var frameGapSpikes = 0

    init {
        Log.i(TAG, "BlurDiagnostics: processor created on thread=${Thread.currentThread().name}")
    }

    override fun process(frame: VideoFrame, textureHelper: SurfaceTextureHelper): VideoFrame? {
        return try {
            recordFrameGap()
            inputFrames++
            if (!firstFrameLogged) {
                firstFrameLogged = true
                Log.i(
                    TAG,
                    "BlurDiagnostics: first frame received " +
                        "size=${frame.rotatedWidth}x${frame.rotatedHeight}, " +
                        "buffer=${frame.buffer.javaClass.simpleName}, " +
                        "thread=${Thread.currentThread().name}",
                )
            }

            maybeSampleSegmentation(frame)
            val mask = segmentationEngine.currentMask()
            if (mask == null) {
                droppedFrames++
                maybeLogStats()
                return null
            }

            if (!firstMaskLogged) {
                firstMaskLogged = true
                Log.i(
                    TAG,
                    "BlurDiagnostics: first segmentation mask ready " +
                        "size=${mask.width}x${mask.height}, thread=${Thread.currentThread().name}",
                )
            }

            val startedAtNs = System.nanoTime()
            val output = renderer.render(frame, mask, textureHelper)
            totalRenderMs += (System.nanoTime() - startedAtNs) / 1_000_000L

            if (output != null) {
                outputFrames++
                if (!firstOutputLogged) {
                    firstOutputLogged = true
                    Log.i(
                        TAG,
                        "BlurDiagnostics: first rendered frame " +
                            "size=${output.rotatedWidth}x${output.rotatedHeight}, " +
                            "buffer=${output.buffer.javaClass.simpleName}, " +
                            "thread=${Thread.currentThread().name}",
                    )
                }
            } else {
                droppedFrames++
            }

            maybeLogStats()
            output
        } catch (error: Throwable) {
            droppedFrames++
            maybeLogStats()
            Log.e(TAG, "BlurDiagnostics: background blur processing failed", error)
            null
        }
    }

    private fun maybeSampleSegmentation(frame: VideoFrame) {
        if (!segmentationEngine.shouldSample()) return

        val startedAtNs = System.nanoTime()
        val bitmap = try {
            segmentationSampler.sample(frame)
        } catch (error: Throwable) {
            segmentationEngine.cancelSample()
            Log.w(TAG, "BlurDiagnostics: GPU segmentation sampling failed", error)
            return
        }
        val preprocessingMs = (System.nanoTime() - startedAtNs) / 1_000_000L
        segmentationEngine.processSample(bitmap, preprocessingMs)
    }

    private fun recordFrameGap() {
        val nowNs = System.nanoTime()
        if (previousFrameArrivalNs != 0L) {
            val gapMs = (nowNs - previousFrameArrivalNs) / 1_000_000f
            maxFrameGapMs = maxOf(maxFrameGapMs, gapMs)
            if (gapMs >= FRAME_GAP_SPIKE_THRESHOLD_MS) {
                frameGapSpikes++
            }
        }
        previousFrameArrivalNs = nowNs
    }

    private fun maybeLogStats() {
        val now = System.currentTimeMillis()
        val elapsedMs = now - lastStatsLogMs
        if (elapsedMs < STATS_INTERVAL_MS) return

        val seconds = elapsedMs.toFloat() / 1000f
        val segmentationStats = segmentationEngine.consumeStats()
        val avgRenderMs =
            if (outputFrames > 0) totalRenderMs.toFloat() / outputFrames.toFloat() else 0f
        Log.i(
            TAG,
            "BlurPerformance: inputFps=${inputFrames / seconds}, " +
                "outputFps=${outputFrames / seconds}, " +
                "segmentationFps=${segmentationStats.completedCount / seconds}, " +
                "avgSegmentationMs=${segmentationStats.averageDurationMs}, " +
                "avgPreprocessMs=${segmentationStats.averagePreprocessingMs}, " +
                "maxPreprocessMs=${segmentationStats.maxPreprocessingMs}, " +
                "avgRenderMs=$avgRenderMs, droppedFrames=$droppedFrames, " +
                "maxFrameGapMs=$maxFrameGapMs, frameGapSpikes=$frameGapSpikes, " +
                "thread=${Thread.currentThread().name}",
        )

        inputFrames = 0
        outputFrames = 0
        droppedFrames = 0
        totalRenderMs = 0
        maxFrameGapMs = 0f
        frameGapSpikes = 0
        lastStatsLogMs = now
    }

    companion object {
        private const val TAG = "SystemCall.BackgroundBlur"
        private const val STATS_INTERVAL_MS = 4_000L
        private const val FRAME_GAP_SPIKE_THRESHOLD_MS = 50f
    }
}
