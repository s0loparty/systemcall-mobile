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
    private var totalProcessUs = 0L
    private var processSamples = 0
    private var maxProcessMs = 0f
    private var processSpikes = 0
    private var totalNormalProcessUs = 0L
    private var normalProcessSamples = 0
    private var maxNormalProcessMs = 0f
    private var totalSegmentationProcessUs = 0L
    private var segmentationProcessSamples = 0
    private var maxSegmentationProcessMs = 0f
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
        val processStartedAtNs = System.nanoTime()
        var sampledSegmentation = false
        var output: VideoFrame? = null

        try {
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

            sampledSegmentation = maybeSampleSegmentation(frame)
            val mask = segmentationEngine.currentMask()
            if (mask == null) {
                droppedFrames++
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
            output = renderer.render(frame, mask, textureHelper)
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

            return output
        } catch (error: Throwable) {
            droppedFrames++
            Log.e(TAG, "BlurDiagnostics: background blur processing failed", error)
            return null
        } finally {
            recordProcessDuration(processStartedAtNs, sampledSegmentation)
            maybeLogStats()
        }
    }

    private fun maybeSampleSegmentation(frame: VideoFrame): Boolean {
        if (!segmentationEngine.shouldSample()) return false

        val startedAtNs = System.nanoTime()
        val bitmap = try {
            segmentationSampler.sample(frame)
        } catch (error: Throwable) {
            segmentationEngine.cancelSample()
            Log.w(TAG, "BlurDiagnostics: GPU segmentation sampling failed", error)
            return true
        }
        val preprocessingMs = (System.nanoTime() - startedAtNs) / 1_000_000L

        if (bitmap == null) {
            // Async PBO path queued this frame but the previous GPU readback is not
            // ready yet. Release the segmentation gate so a later frame can poll
            // the fence without blocking CaptureThread.
            segmentationEngine.cancelSample()
            return true
        }

        segmentationEngine.processSample(bitmap, preprocessingMs)
        return true
    }

    private fun recordProcessDuration(startedAtNs: Long, sampledSegmentation: Boolean) {
        val durationUs = (System.nanoTime() - startedAtNs) / 1_000L
        val durationMs = durationUs / 1_000f

        totalProcessUs += durationUs
        processSamples++
        maxProcessMs = maxOf(maxProcessMs, durationMs)
        if (durationMs >= PROCESS_SPIKE_THRESHOLD_MS) {
            processSpikes++
        }

        if (sampledSegmentation) {
            totalSegmentationProcessUs += durationUs
            segmentationProcessSamples++
            maxSegmentationProcessMs = maxOf(maxSegmentationProcessMs, durationMs)
        } else {
            totalNormalProcessUs += durationUs
            normalProcessSamples++
            maxNormalProcessMs = maxOf(maxNormalProcessMs, durationMs)
        }
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
        val avgProcessMs = averageMs(totalProcessUs, processSamples)
        val avgNormalProcessMs = averageMs(totalNormalProcessUs, normalProcessSamples)
        val avgSegmentationProcessMs =
            averageMs(totalSegmentationProcessUs, segmentationProcessSamples)

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
                "avgProcessMs=$avgProcessMs, maxProcessMs=$maxProcessMs, " +
                "processSpikes=$processSpikes, " +
                "avgNormalProcessMs=$avgNormalProcessMs, " +
                "maxNormalProcessMs=$maxNormalProcessMs, " +
                "avgSegmentationProcessMs=$avgSegmentationProcessMs, " +
                "maxSegmentationProcessMs=$maxSegmentationProcessMs, " +
                "thread=${Thread.currentThread().name}",
        )

        inputFrames = 0
        outputFrames = 0
        droppedFrames = 0
        totalRenderMs = 0
        totalProcessUs = 0
        processSamples = 0
        maxProcessMs = 0f
        processSpikes = 0
        totalNormalProcessUs = 0
        normalProcessSamples = 0
        maxNormalProcessMs = 0f
        totalSegmentationProcessUs = 0
        segmentationProcessSamples = 0
        maxSegmentationProcessMs = 0f
        maxFrameGapMs = 0f
        frameGapSpikes = 0
        lastStatsLogMs = now
    }

    private fun averageMs(totalUs: Long, samples: Int): Float =
        if (samples > 0) totalUs.toFloat() / samples.toFloat() / 1_000f else 0f

    companion object {
        private const val TAG = "SystemCall.BackgroundBlur"
        private const val STATS_INTERVAL_MS = 4_000L
        private const val FRAME_GAP_SPIKE_THRESHOLD_MS = 50f
        private const val PROCESS_SPIKE_THRESHOLD_MS = 8f
    }
}
