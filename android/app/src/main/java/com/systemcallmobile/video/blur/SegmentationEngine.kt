package com.systemcallmobile.video.blur

import android.graphics.Bitmap
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

class SegmentationEngine {
    private val segmenter = Segmentation.getClient(
        SelfieSegmenterOptions.Builder()
            .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)
            .enableRawSizeMask()
            .build(),
    )
    private val running = AtomicBoolean(false)
    private val cachedMask = AtomicReference<SegmentationMask?>(null)
    private val lastStartMs = AtomicLong(0)
    private val version = AtomicLong(0)
    private val completedCount = AtomicLong(0)
    private val totalDurationMs = AtomicLong(0)
    private val preprocessingCount = AtomicLong(0)
    private val totalPreprocessingMs = AtomicLong(0)
    private val maxPreprocessingMs = AtomicLong(0)

    fun currentMask(): SegmentationMask? = cachedMask.get()

    /**
     * Returns true only when this frame should be sampled for segmentation.
     * Sampling itself stays in the processor's current EGL context; ML Kit remains
     * asynchronous and only one segmentation request can be in flight at a time.
     */
    fun shouldSample(): Boolean {
        val now = System.currentTimeMillis()
        if (now - lastStartMs.get() < SEGMENTATION_INTERVAL_MS) return false
        if (!running.compareAndSet(false, true)) return false
        lastStartMs.set(now)
        return true
    }

    fun processSample(bitmap: Bitmap, preprocessingMs: Long) {
        preprocessingCount.incrementAndGet()
        totalPreprocessingMs.addAndGet(preprocessingMs)
        updateMax(maxPreprocessingMs, preprocessingMs)

        val startedAtNs = System.nanoTime()
        try {
            segmenter.process(InputImage.fromBitmap(bitmap, 0))
                .addOnSuccessListener { result ->
                    try {
                        val values = ByteArray(result.width * result.height)
                        val buffer = result.buffer
                        buffer.rewind()
                        val floatBuffer = buffer.asFloatBuffer()
                        for (index in values.indices) {
                            val confidence = floatBuffer.get().coerceIn(0f, 1f)
                            values[index] =
                                (confidence * 255f).toInt().coerceIn(0, 255).toByte()
                        }
                        cachedMask.set(
                            SegmentationMask(
                                width = result.width,
                                height = result.height,
                                pixels = values,
                                version = version.incrementAndGet(),
                            ),
                        )
                    } catch (error: Throwable) {
                        Log.w(TAG, "Unable to cache segmentation mask", error)
                    }
                }
                .addOnFailureListener { error ->
                    Log.w(TAG, "Segmentation failed", error)
                }
                .addOnCompleteListener {
                    totalDurationMs.addAndGet(
                        (System.nanoTime() - startedAtNs) / 1_000_000L,
                    )
                    completedCount.incrementAndGet()
                    bitmap.recycle()
                    running.set(false)
                }
        } catch (error: Throwable) {
            bitmap.recycle()
            running.set(false)
            Log.w(TAG, "Unable to start segmentation", error)
        }
    }

    fun cancelSample() {
        running.set(false)
    }

    fun consumeStats(): SegmentationStats {
        val count = completedCount.getAndSet(0)
        val duration = totalDurationMs.getAndSet(0)
        val preprocessCount = preprocessingCount.getAndSet(0)
        val preprocessDuration = totalPreprocessingMs.getAndSet(0)
        val preprocessMax = maxPreprocessingMs.getAndSet(0)
        return SegmentationStats(
            completedCount = count,
            averageDurationMs = if (count > 0) duration.toFloat() / count.toFloat() else 0f,
            averagePreprocessingMs = if (preprocessCount > 0) {
                preprocessDuration.toFloat() / preprocessCount.toFloat()
            } else {
                0f
            },
            maxPreprocessingMs = preprocessMax,
        )
    }

    private fun updateMax(target: AtomicLong, value: Long) {
        while (true) {
            val current = target.get()
            if (value <= current || target.compareAndSet(current, value)) return
        }
    }

    companion object {
        private const val TAG = "SystemCall.Segmentation"
        private const val SEGMENTATION_INTERVAL_MS = 160L
    }
}

data class SegmentationStats(
    val completedCount: Long,
    val averageDurationMs: Float,
    val averagePreprocessingMs: Float,
    val maxPreprocessingMs: Long,
)
