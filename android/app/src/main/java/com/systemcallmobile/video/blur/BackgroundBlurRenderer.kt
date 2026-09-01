package com.systemcallmobile.video.blur

import android.content.Context
import android.graphics.Matrix
import android.opengl.GLES20
import android.os.Build
import android.util.Log
import org.webrtc.GlRectDrawer
import org.webrtc.GlShader
import org.webrtc.GlTextureFrameBuffer
import org.webrtc.GlUtil
import org.webrtc.SurfaceTextureHelper
import org.webrtc.TextureBufferImpl
import org.webrtc.VideoFrame
import org.webrtc.VideoFrameDrawer
import org.webrtc.YuvConverter
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.util.concurrent.atomic.AtomicBoolean

class BackgroundBlurRenderer(
    private val appContext: Context,
) {
    private var resources: GlResources? = null
    private var maskTextureId = 0
    private var uploadedMaskVersion = -1L
    private var currentWidth = 0
    private var currentHeight = 0
    private var currentBlurDownsample = 0
    private var slotAcquireAttempts = 0
    private var slotAcquireMisses = 0
    private var maxBusySlots = 0
    private var lastSlotStatsLogMs = System.currentTimeMillis()

    fun render(
        frame: VideoFrame,
        mask: SegmentationMask,
        textureHelper: SurfaceTextureHelper,
    ): VideoFrame? {
        val gl = getOrCreateResources()
        val width = frame.rotatedWidth
        val height = frame.rotatedHeight
        val blurDownsample = blurDownsample(width, height)
        if (!ensureSize(gl, width, height, blurDownsample)) return null
        uploadMask(mask)

        val outputSlot = acquireOutputSlot(gl) ?: return null
        val blurWidth = blurDimension(width, blurDownsample)
        val blurHeight = blurDimension(height, blurDownsample)
        val blurRadiusMultiplier = blurRadiusMultiplier(blurDownsample)

        return try {
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, gl.sourceBuffer.frameBufferId)
            GLES20.glViewport(0, 0, width, height)
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
            gl.frameDrawer.drawFrame(frame, gl.inputDrawer, gl.textureMatrix, 0, 0, width, height)

            // Keep the published/output frame at the selected camera resolution, but
            // make the expensive blur passes progressively smaller as capture
            // resolution grows. The radius is compensated so 360p/720p/1080p keep
            // approximately the same visible blur strength.
            drawBlurPass(
                gl = gl,
                sourceTextureId = gl.sourceBuffer.textureId,
                targetFrameBufferId = gl.horizontalBlurBuffer.frameBufferId,
                width = blurWidth,
                height = blurHeight,
                stepX = blurRadiusMultiplier / blurWidth.toFloat(),
                stepY = 0f,
            )
            drawBlurPass(
                gl = gl,
                sourceTextureId = gl.horizontalBlurBuffer.textureId,
                targetFrameBufferId = gl.verticalBlurBuffer.frameBufferId,
                width = blurWidth,
                height = blurHeight,
                stepX = 0f,
                stepY = blurRadiusMultiplier / blurHeight.toFloat(),
            )
            drawComposite(gl, outputSlot.buffer.frameBufferId, width, height)

            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
            GlUtil.checkNoGLES2Error("BackgroundBlurRenderer.render")

            val textureBuffer = TextureBufferImpl(
                width,
                height,
                VideoFrame.TextureBuffer.Type.RGB,
                outputSlot.buffer.textureId,
                Matrix(),
                textureHelper.handler,
                gl.yuvConverter,
            ) {
                outputSlot.release()
            }

            VideoFrame(textureBuffer, 0, frame.timestampNs)
        } catch (error: Throwable) {
            outputSlot.release()
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
            throw error
        }
    }

    fun release() {
        val gl = resources ?: return

        if (maskTextureId != 0) {
            GLES20.glDeleteTextures(1, intArrayOf(maskTextureId), 0)
            maskTextureId = 0
        }
        gl.release()
        resources = null
        uploadedMaskVersion = -1L
        currentWidth = 0
        currentHeight = 0
        currentBlurDownsample = 0
    }

    private fun getOrCreateResources(): GlResources {
        resources?.let { return it }

        GlUtil.checkNoGLES2Error("BackgroundBlurRenderer.beforeInit")
        return GlResources().also {
            resources = it
            GlUtil.checkNoGLES2Error("BackgroundBlurRenderer.afterInit")
        }
    }

    private fun ensureSize(
        gl: GlResources,
        width: Int,
        height: Int,
        blurDownsample: Int,
    ): Boolean {
        if (
            width == currentWidth &&
            height == currentHeight &&
            blurDownsample == currentBlurDownsample
        ) return true

        if (gl.outputSlots.any { it.isInUse() }) return false

        val blurWidth = blurDimension(width, blurDownsample)
        val blurHeight = blurDimension(height, blurDownsample)
        gl.sourceBuffer.setSize(width, height)
        gl.horizontalBlurBuffer.setSize(blurWidth, blurHeight)
        gl.verticalBlurBuffer.setSize(blurWidth, blurHeight)
        gl.outputSlots.forEach { it.buffer.setSize(width, height) }
        currentWidth = width
        currentHeight = height
        currentBlurDownsample = blurDownsample

        Log.i(
            TAG,
            "BlurResolution: input=${width}x$height, blur=${blurWidth}x$blurHeight, " +
                "downsample=${blurDownsample}x",
        )
        return true
    }

    private fun blurDownsample(width: Int, height: Int): Int {
        val longestSide = maxOf(width, height)
        return when {
            longestSide >= 1_600 -> 4 // 1080p class
            longestSide >= 1_000 -> 3 // 720p class
            else -> 2 // 360p/480p class
        }
    }

    private fun blurDimension(value: Int, downsample: Int): Int =
        (value / downsample).coerceAtLeast(1)

    private fun blurRadiusMultiplier(downsample: Int): Float =
        BLUR_RADIUS_MULTIPLIER * BASE_BLUR_DOWNSAMPLE / downsample.toFloat()

    private fun acquireOutputSlot(gl: GlResources): OutputTextureSlot? {
        slotAcquireAttempts++
        val busyBeforeAcquire = gl.outputSlots.count { it.isInUse() }
        maxBusySlots = maxOf(maxBusySlots, busyBeforeAcquire)

        for (slot in gl.outputSlots) {
            if (slot.tryAcquire()) {
                maxBusySlots = maxOf(maxBusySlots, busyBeforeAcquire + 1)
                maybeLogSlotStats()
                return slot
            }
        }

        slotAcquireMisses++
        maybeLogSlotStats()
        return null
    }

    private fun maybeLogSlotStats() {
        val now = System.currentTimeMillis()
        if (now - lastSlotStatsLogMs < SLOT_STATS_INTERVAL_MS) return

        Log.i(
            TAG,
            "BlurTexturePool: size=$OUTPUT_POOL_SIZE, attempts=$slotAcquireAttempts, " +
                "misses=$slotAcquireMisses, maxBusy=$maxBusySlots",
        )
        slotAcquireAttempts = 0
        slotAcquireMisses = 0
        maxBusySlots = 0
        lastSlotStatsLogMs = now
    }

    private fun uploadMask(mask: SegmentationMask) {
        if (uploadedMaskVersion == mask.version) return

        if (maskTextureId == 0) {
            maskTextureId = GlUtil.generateTexture(GLES20.GL_TEXTURE_2D)
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, maskTextureId)
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
        } else {
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, maskTextureId)
        }

        val data = ByteBuffer.allocateDirect(mask.pixels.size)
            .order(ByteOrder.nativeOrder())
            .put(mask.pixels)
        data.position(0)
        GLES20.glTexImage2D(
            GLES20.GL_TEXTURE_2D,
            0,
            GLES20.GL_LUMINANCE,
            mask.width,
            mask.height,
            0,
            GLES20.GL_LUMINANCE,
            GLES20.GL_UNSIGNED_BYTE,
            data,
        )
        uploadedMaskVersion = mask.version
    }

    private fun drawBlurPass(
        gl: GlResources,
        sourceTextureId: Int,
        targetFrameBufferId: Int,
        width: Int,
        height: Int,
        stepX: Float,
        stepY: Float,
    ) {
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, targetFrameBufferId)
        GLES20.glViewport(0, 0, width, height)
        gl.blurProgram.use()
        gl.blurProgram.setTexture("uTexture", 0, sourceTextureId)
        GLES20.glUniform2f(gl.blurProgram.uniform("uTexelStep"), stepX, stepY)
        gl.blurProgram.draw()
    }

    private fun drawComposite(
        gl: GlResources,
        targetFrameBufferId: Int,
        width: Int,
        height: Int,
    ) {
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, targetFrameBufferId)
        GLES20.glViewport(0, 0, width, height)
        gl.compositeProgram.use()
        gl.compositeProgram.setTexture("uOriginalTexture", 0, gl.sourceBuffer.textureId)
        gl.compositeProgram.setTexture("uBlurredTexture", 1, gl.verticalBlurBuffer.textureId)
        gl.compositeProgram.setTexture("uMaskTexture", 2, maskTextureId)
        gl.compositeProgram.draw()
    }

    @Suppress("unused")
    private fun supportsGpuBlur(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && appContext.packageName.isNotBlank()

    private class GlResources {
        val frameDrawer = VideoFrameDrawer()
        val inputDrawer = GlRectDrawer()
        val yuvConverter = YuvConverter()
        val sourceBuffer = GlTextureFrameBuffer(GLES20.GL_RGBA)
        val horizontalBlurBuffer = GlTextureFrameBuffer(GLES20.GL_RGBA)
        val verticalBlurBuffer = GlTextureFrameBuffer(GLES20.GL_RGBA)
        val outputSlots = List(OUTPUT_POOL_SIZE) { OutputTextureSlot() }
        val blurProgram = FullscreenProgram(BLUR_FRAGMENT_SHADER)
        val compositeProgram = FullscreenProgram(COMPOSITE_FRAGMENT_SHADER)
        val textureMatrix = Matrix()

        fun release() {
            sourceBuffer.release()
            horizontalBlurBuffer.release()
            verticalBlurBuffer.release()
            outputSlots.forEach { it.buffer.release() }
            blurProgram.release()
            compositeProgram.release()
            inputDrawer.release()
            frameDrawer.release()
            yuvConverter.release()
        }
    }

    private class OutputTextureSlot {
        val buffer = GlTextureFrameBuffer(GLES20.GL_RGBA)
        private val inUse = AtomicBoolean(false)

        fun tryAcquire(): Boolean = inUse.compareAndSet(false, true)
        fun isInUse(): Boolean = inUse.get()
        fun release() {
            inUse.set(false)
        }
    }

    companion object {
        private const val TAG = "SystemCall.BackgroundBlur"
        private const val OUTPUT_POOL_SIZE = 6
        private const val SLOT_STATS_INTERVAL_MS = 4_000L
        private const val BASE_BLUR_DOWNSAMPLE = 2f
        private const val BLUR_RADIUS_MULTIPLIER = 3.4f

        private const val VERTEX_SHADER = """
            attribute vec4 aPosition;
            attribute vec2 aTexCoord;
            varying vec2 vTexCoord;
            void main() {
                gl_Position = aPosition;
                vTexCoord = aTexCoord;
            }
        """

        private const val BLUR_FRAGMENT_SHADER = """
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uTexture;
            uniform vec2 uTexelStep;
            void main() {
                vec4 color = texture2D(uTexture, vTexCoord) * 0.2270270270;
                color += texture2D(uTexture, vTexCoord + uTexelStep * 1.3846153846) * 0.3162162162;
                color += texture2D(uTexture, vTexCoord - uTexelStep * 1.3846153846) * 0.3162162162;
                color += texture2D(uTexture, vTexCoord + uTexelStep * 3.2307692308) * 0.0702702703;
                color += texture2D(uTexture, vTexCoord - uTexelStep * 3.2307692308) * 0.0702702703;
                gl_FragColor = color;
            }
        """

        private const val COMPOSITE_FRAGMENT_SHADER = """
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uOriginalTexture;
            uniform sampler2D uBlurredTexture;
            uniform sampler2D uMaskTexture;
            void main() {
                vec4 original = texture2D(uOriginalTexture, vTexCoord);
                vec4 blurred = texture2D(uBlurredTexture, vTexCoord);
                float confidence = texture2D(uMaskTexture, vec2(vTexCoord.x, 1.0 - vTexCoord.y)).r;
                float person = smoothstep(0.36, 0.76, confidence);
                gl_FragColor = mix(blurred, original, person);
            }
        """

        private val FULL_RECTANGLE_COORDS = floatArrayOf(
            -1f, -1f,
            1f, -1f,
            -1f, 1f,
            1f, 1f,
        )
        private val FULL_RECTANGLE_TEX_COORDS = floatArrayOf(
            0f, 0f,
            1f, 0f,
            0f, 1f,
            1f, 1f,
        )
    }

    private class FullscreenProgram(fragmentShader: String) {
        private val shader = GlShader(VERTEX_SHADER, fragmentShader)
        private val vertexBuffer: FloatBuffer = GlUtil.createFloatBuffer(FULL_RECTANGLE_COORDS)
        private val texCoordBuffer: FloatBuffer = GlUtil.createFloatBuffer(FULL_RECTANGLE_TEX_COORDS)

        fun use() {
            shader.useProgram()
            shader.setVertexAttribArray("aPosition", 2, vertexBuffer)
            shader.setVertexAttribArray("aTexCoord", 2, texCoordBuffer)
        }

        fun setTexture(name: String, unit: Int, textureId: Int) {
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0 + unit)
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, textureId)
            GLES20.glUniform1i(uniform(name), unit)
        }

        fun uniform(name: String): Int = shader.getUniformLocation(name)
        fun draw() {
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        }
        fun release() {
            shader.release()
        }
    }
}
