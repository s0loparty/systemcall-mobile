package com.systemcallmobile.video.blur

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import org.webrtc.VideoFrame
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.max

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

    fun currentMask(): SegmentationMask? = cachedMask.get()

    fun maybeStart(frame: VideoFrame) {
        val now = System.currentTimeMillis()
        if (now - lastStartMs.get() < SEGMENTATION_INTERVAL_MS) return
        if (!running.compareAndSet(false, true)) return
        lastStartMs.set(now)

        val bitmap = try {
            createSegmentationBitmap(frame)
        } catch (error: Throwable) {
            running.set(false)
            Log.w(TAG, "Unable to create segmentation input", error)
            return
        }

        val startedAtNs = System.nanoTime()
        segmenter.process(InputImage.fromBitmap(bitmap, 0))
            .addOnSuccessListener { result ->
                try {
                    val values = ByteArray(result.width * result.height)
                    val buffer = result.buffer
                    buffer.rewind()
                    val floatBuffer = buffer.asFloatBuffer()
                    for (index in values.indices) {
                        val confidence = floatBuffer.get().coerceIn(0f, 1f)
                        values[index] = (confidence * 255f).toInt().coerceIn(0, 255).toByte()
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
                totalDurationMs.addAndGet((System.nanoTime() - startedAtNs) / 1_000_000L)
                completedCount.incrementAndGet()
                running.set(false)
            }
    }

    fun consumeStats(): SegmentationStats {
        val count = completedCount.getAndSet(0)
        val duration = totalDurationMs.getAndSet(0)
        return SegmentationStats(
            completedCount = count,
            averageDurationMs = if (count > 0) duration.toFloat() / count.toFloat() else 0f,
        )
    }

    private fun createSegmentationBitmap(frame: VideoFrame): Bitmap {
        val buffer = frame.buffer
        val sourceWidth = buffer.width
        val sourceHeight = buffer.height
        val maxSide = max(sourceWidth, sourceHeight)
        val scale = SEGMENTATION_MAX_SIDE.toFloat() / maxSide.toFloat()
        val targetWidth = max(2, (sourceWidth * scale).toInt())
        val targetHeight = max(2, (sourceHeight * scale).toInt())
        val scaled = buffer.cropAndScale(
            0,
            0,
            sourceWidth,
            sourceHeight,
            targetWidth,
            targetHeight,
        )
        val i420 = scaled.toI420()
        scaled.release()
        if (i420 == null) {
            throw IllegalStateException("Unable to convert segmentation frame to I420")
        }

        try {
            val bitmap = smallI420ToBitmap(i420)
            return rotateBitmap(bitmap, frame.rotation)
        } finally {
            i420.release()
        }
    }

    private fun rotateBitmap(source: Bitmap, rotation: Int): Bitmap {
        if (rotation == 0) return source
        val matrix = Matrix().apply { postRotate(rotation.toFloat()) }
        return Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
    }

    private fun smallI420ToBitmap(buffer: VideoFrame.I420Buffer): Bitmap {
        val width = buffer.width
        val height = buffer.height
        val pixels = IntArray(width * height)

        for (y in 0 until height) {
            for (x in 0 until width) {
                val yy = buffer.dataY.get(y * buffer.strideY + x).toInt() and 0xff
                val uvX = x / 2
                val uvY = y / 2
                val u = (buffer.dataU.get(uvY * buffer.strideU + uvX).toInt() and 0xff) - 128
                val v = (buffer.dataV.get(uvY * buffer.strideV + uvX).toInt() and 0xff) - 128
                val r = (yy + 1.402f * v).toInt().coerceIn(0, 255)
                val g = (yy - 0.344136f * u - 0.714136f * v).toInt().coerceIn(0, 255)
                val b = (yy + 1.772f * u).toInt().coerceIn(0, 255)
                pixels[y * width + x] = Color.rgb(r, g, b)
            }
        }

        return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
    }

    companion object {
        private const val TAG = "SystemCall.Segmentation"
        private const val SEGMENTATION_MAX_SIDE = 256
        private const val SEGMENTATION_INTERVAL_MS = 125L
    }
}

data class SegmentationStats(
    val completedCount: Long,
    val averageDurationMs: Float,
)
