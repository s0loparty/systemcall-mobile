package com.systemcallmobile.video.blur

import android.graphics.Bitmap
import android.opengl.GLES20
import android.util.Log
import org.webrtc.GlRectDrawer
import org.webrtc.GlTextureFrameBuffer
import org.webrtc.GlUtil
import org.webrtc.VideoFrame
import org.webrtc.VideoFrameDrawer
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Creates the small ML Kit segmentation input directly from the current GL frame.
 *
 * The previous path called TextureBuffer.toI420(), which can marshal work back to
 * the capture texture handler and contend with camera frame delivery. This path
 * renders only a tiny RGBA thumbnail in the already-current EGL context and reads
 * that thumbnail back directly, avoiding TextureBuffer -> I420 conversion and the
 * CPU I420 -> RGB loop.
 */
class GpuSegmentationSampler {
    private var resources: GlResources? = null
    private var currentWidth = 0
    private var currentHeight = 0
    private var firstSampleLogged = false

    fun sample(frame: VideoFrame): Bitmap {
        val gl = getOrCreateResources()
        val sourceWidth = frame.rotatedWidth
        val sourceHeight = frame.rotatedHeight
        val longestSide = maxOf(sourceWidth, sourceHeight)
        val scale = SEGMENTATION_MAX_SIDE.toFloat() / longestSide.toFloat()
        val width = maxOf(2, (sourceWidth * scale).toInt())
        val height = maxOf(2, (sourceHeight * scale).toInt())

        if (width != currentWidth || height != currentHeight) {
            gl.frameBuffer.setSize(width, height)
            currentWidth = width
            currentHeight = height
        }

        val rgba = ByteBuffer.allocateDirect(width * height * 4)
            .order(ByteOrder.nativeOrder())

        try {
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, gl.frameBuffer.frameBufferId)
            GLES20.glViewport(0, 0, width, height)
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
            gl.frameDrawer.drawFrame(
                frame,
                gl.drawer,
                gl.textureMatrix,
                0,
                0,
                width,
                height,
            )
            GLES20.glReadPixels(
                0,
                0,
                width,
                height,
                GLES20.GL_RGBA,
                GLES20.GL_UNSIGNED_BYTE,
                rgba,
            )
            GlUtil.checkNoGLES2Error("GpuSegmentationSampler.sample")
        } finally {
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
        }

        val pixels = IntArray(width * height)
        for (y in 0 until height) {
            // OpenGL readback starts at the bottom-left; Bitmap starts at top-left.
            val sourceY = height - 1 - y
            for (x in 0 until width) {
                val offset = (sourceY * width + x) * 4
                val r = rgba.get(offset).toInt() and 0xff
                val g = rgba.get(offset + 1).toInt() and 0xff
                val b = rgba.get(offset + 2).toInt() and 0xff
                val a = rgba.get(offset + 3).toInt() and 0xff
                pixels[y * width + x] =
                    (a shl 24) or (r shl 16) or (g shl 8) or b
            }
        }

        if (!firstSampleLogged) {
            firstSampleLogged = true
            Log.i(
                TAG,
                "SegmentationInput: path=gpu-rgba-readback, size=${width}x$height, " +
                    "thread=${Thread.currentThread().name}",
            )
        }

        return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
    }

    private fun getOrCreateResources(): GlResources {
        resources?.let { return it }
        return GlResources().also { resources = it }
    }

    private class GlResources {
        val frameDrawer = VideoFrameDrawer()
        val drawer = GlRectDrawer()
        val frameBuffer = GlTextureFrameBuffer(GLES20.GL_RGBA)
        val textureMatrix = android.graphics.Matrix()
    }

    companion object {
        private const val TAG = "SystemCall.Segmentation"
        private const val SEGMENTATION_MAX_SIDE = 192
    }
}
