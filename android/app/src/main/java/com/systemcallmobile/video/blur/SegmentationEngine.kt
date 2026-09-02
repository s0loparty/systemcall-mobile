package com.systemcallmobile.video.blur

import android.graphics.Bitmap
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import java.nio.ByteBuffer
import java.util.concurrent.Executors
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
    private val preprocessingExecutor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "SystemCall-SegmentationPreprocess").apply {
            priority = Thread.NORM_PRIORITY - 1
            isDaemon = true
        }
    }
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

    fun shouldSample(): Boolean {
        val now = System.currentTimeMillis()
        if (now - lastStartMs.get() < SEGMENTATION_INTERVAL_MS) return false
        if (!running.compareAndSet(false, true)) return false
        lastStartMs.set(now)
        return true
    }

    /**
     * CaptureThread has already copied the tiny ready PBO into owned RGBA memory.
     * Everything that does not require the current EGL context happens here:
     * vertical flip/color conversion, Bitmap allocation and ML Kit submission.
     */
    fun processSample(sample: SegmentationRgbaSample, capturePreprocessingUs: Long) {
        try {
            preprocessingExecutor.execute {
                val workerStartedAtNs = System.nanoTime()
                val bitmap = try {
                    rgbaToBitmap(sample)
                } catch (error: Throwable) {
                    running.set(false)
                    Log.w(TAG, "Unable to convert segmentation RGBA sample", error)
                    return@execute
                }

                val totalPreprocessingUs = capturePreprocessingUs +
                    ((System.nanoTime() - workerStartedAtNs) / 1_000L)
                recordPreprocessing(totalPreprocessingUs)
                submitBitmap(bitmap)
            }
        } catch (error: Throwable) {
            running.set(false)
            Log.w(TAG, "Unable to schedule segmentation preprocessing", error)
        }
    }

    private fun submitBitmap(bitmap: Bitmap) {
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

    private fun rgbaToBitmap(sample: SegmentationRgbaSample): Bitmap {
        val width = sample.width
        val height = sample.height
        val rgba: ByteBuffer = sample.rgba
        val pixels = IntArray(width * height)
        for (y in 0 until height) {
            val sourceY = height - 1 - y
            for (x in 0 until width) {
                val offset = (sourceY * width + x) * RGBA_BYTES_PER_PIXEL
                val r = rgba.get(offset).toInt() and 0xff
                val g = rgba.get(offset + 1).toInt() and 0xff
                val b = rgba.get(offset + 2).toInt() and 0xff
                val a = rgba.get(offset + 3).toInt() and 0xff
                pixels[y * width + x] =
                    (a shl 24) or (r shl 16) or (g shl 8) or b
            }
        }
        return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
    }

    private fun recordPreprocessing(totalUs: Long) {
        val durationMs = (totalUs / 1_000L).coerceAtLeast(0L)
        preprocessingCount.incrementAndGet()
        totalPreprocessingMs.addAndGet(durationMs)
        updateMax(maxPreprocessingMs, durationMs)
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
        private const val RGBA_BYTES_PER_PIXEL = 4
    }
}

data class SegmentationStats(
    val completedCount: Long,
    val averageDurationMs: Float,
    val averagePreprocessingMs: Float,
    val maxPreprocessingMs: Long,
)
