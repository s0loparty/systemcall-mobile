package com.systemcallmobile.video

import android.graphics.Bitmap
import android.graphics.Color
import android.renderscript.Allocation
import android.renderscript.Element
import android.renderscript.RenderScript
import android.renderscript.ScriptIntrinsicBlur
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface
import org.webrtc.JavaI420Buffer
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoFrame
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.min

class BackgroundBlurProcessorFactory(
    private val appContext: android.content.Context,
) : VideoFrameProcessorFactoryInterface {
    override fun build(): VideoFrameProcessor = BackgroundBlurProcessor(appContext)
}

@Suppress("DEPRECATION")
private class BackgroundBlurProcessor(
    context: android.content.Context,
) : VideoFrameProcessor {
    private val appContext = context.applicationContext
    private val segmenter = Segmentation.getClient(
        SelfieSegmenterOptions.Builder()
            .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)
            .enableRawSizeMask()
            .build(),
    )
    private val renderScript = RenderScript.create(appContext)
    private val blurScript = ScriptIntrinsicBlur.create(renderScript, Element.U8_4(renderScript)).apply {
        setRadius(18f)
    }
    private var lastMask: FloatArray? = null
    private var lastMaskWidth = 0
    private var lastMaskHeight = 0

    override fun process(frame: VideoFrame, textureHelper: SurfaceTextureHelper): VideoFrame? {
        val i420 = try {
            frame.buffer.toI420()
        } catch (error: Throwable) {
            Log.w(TAG, "Unable to convert camera frame to I420", error)
            return null
        } ?: run {
            Log.w(TAG, "Camera frame conversion returned null I420 buffer")
            return null
        }

        try {
            val bitmap = i420ToBitmap(i420)
            updateMask(bitmap, frame.rotation)
            val mask = lastMask ?: return null
            val blurred = blur(bitmap)
            val composed = composite(bitmap, blurred, mask, lastMaskWidth, lastMaskHeight)
            val output = bitmapToI420(composed)
            return VideoFrame(output, frame.rotation, frame.timestampNs)
        } catch (error: Throwable) {
            Log.w(TAG, "Background blur frame processing failed", error)
            return null
        } finally {
            i420.release()
        }
    }

    private fun updateMask(bitmap: Bitmap, rotation: Int) {
        try {
            val result = Tasks.await(
                segmenter.process(InputImage.fromBitmap(bitmap, rotation)),
                45,
                TimeUnit.MILLISECONDS,
            )
            val buffer = result.buffer
            buffer.rewind()
            val values = FloatArray(result.width * result.height)
            buffer.asFloatBuffer().get(values)
            lastMask = values
            lastMaskWidth = result.width
            lastMaskHeight = result.height
        } catch (_: Throwable) {
            // Reuse the last mask if ML Kit misses the frame deadline. This keeps
            // camera capture smooth instead of blocking WebRTC's video thread.
        }
    }

    private fun blur(source: Bitmap): Bitmap {
        val input = Allocation.createFromBitmap(renderScript, source)
        val outputBitmap = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888)
        val output = Allocation.createFromBitmap(renderScript, outputBitmap)
        blurScript.setInput(input)
        blurScript.forEach(output)
        output.copyTo(outputBitmap)
        input.destroy()
        output.destroy()
        return outputBitmap
    }

    private fun composite(
        foreground: Bitmap,
        blurred: Bitmap,
        mask: FloatArray,
        maskWidth: Int,
        maskHeight: Int,
    ): Bitmap {
        val width = foreground.width
        val height = foreground.height
        val fg = IntArray(width * height)
        val bg = IntArray(width * height)
        val out = IntArray(width * height)
        foreground.getPixels(fg, 0, width, 0, 0, width, height)
        blurred.getPixels(bg, 0, width, 0, 0, width, height)

        for (y in 0 until height) {
            val maskY = min(maskHeight - 1, max(0, y * maskHeight / height))
            for (x in 0 until width) {
                val maskX = min(maskWidth - 1, max(0, x * maskWidth / width))
                val confidence = mask[maskY * maskWidth + maskX]
                val alpha = smoothstep(0.42f, 0.72f, confidence)
                val index = y * width + x
                out[index] = mix(bg[index], fg[index], alpha)
            }
        }

        return Bitmap.createBitmap(out, width, height, Bitmap.Config.ARGB_8888)
    }

    private fun smoothstep(edge0: Float, edge1: Float, value: Float): Float {
        val t = ((value - edge0) / (edge1 - edge0)).coerceIn(0f, 1f)
        return t * t * (3f - 2f * t)
    }

    private fun mix(background: Int, foreground: Int, alpha: Float): Int {
        val inverse = 1f - alpha
        return Color.rgb(
            (Color.red(foreground) * alpha + Color.red(background) * inverse).toInt(),
            (Color.green(foreground) * alpha + Color.green(background) * inverse).toInt(),
            (Color.blue(foreground) * alpha + Color.blue(background) * inverse).toInt(),
        )
    }

    private fun i420ToBitmap(buffer: VideoFrame.I420Buffer): Bitmap {
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

    private fun bitmapToI420(bitmap: Bitmap): VideoFrame.I420Buffer {
        val width = bitmap.width
        val height = bitmap.height
        val output = JavaI420Buffer.allocate(width, height)
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

        for (y in 0 until height) {
            for (x in 0 until width) {
                val color = pixels[y * width + x]
                val r = Color.red(color)
                val g = Color.green(color)
                val b = Color.blue(color)
                val yy = ((66 * r + 129 * g + 25 * b + 128) shr 8) + 16
                output.dataY.put(y * output.strideY + x, yy.coerceIn(0, 255).toByte())

                if (x % 2 == 0 && y % 2 == 0) {
                    val u = ((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128
                    val v = ((112 * r - 94 * g - 18 * b + 128) shr 8) + 128
                    output.dataU.put((y / 2) * output.strideU + x / 2, u.coerceIn(0, 255).toByte())
                    output.dataV.put((y / 2) * output.strideV + x / 2, v.coerceIn(0, 255).toByte())
                }
            }
        }

        return output
    }

    companion object {
        private const val TAG = "SystemCall.BackgroundBlur"
    }
}
