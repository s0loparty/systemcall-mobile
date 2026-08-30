package com.systemcallmobile.video.blur

import android.content.Context
import android.graphics.Matrix
import android.opengl.GLES20
import android.os.Build
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

class BackgroundBlurRenderer(
    private val appContext: Context,
) {
    private val frameDrawer = VideoFrameDrawer()
    private val inputDrawer = GlRectDrawer()
    private val yuvConverter = YuvConverter()
    private val sourceBuffer = GlTextureFrameBuffer(GLES20.GL_RGBA)
    private val horizontalBlurBuffer = GlTextureFrameBuffer(GLES20.GL_RGBA)
    private val verticalBlurBuffer = GlTextureFrameBuffer(GLES20.GL_RGBA)
    private val outputBuffer = GlTextureFrameBuffer(GLES20.GL_RGBA)
    private val blurProgram = FullscreenProgram(BLUR_FRAGMENT_SHADER)
    private val compositeProgram = FullscreenProgram(COMPOSITE_FRAGMENT_SHADER)
    private val textureMatrix = Matrix()
    private var maskTextureId = 0
    private var uploadedMaskVersion = -1L

    fun render(
        frame: VideoFrame,
        mask: SegmentationMask,
        textureHelper: SurfaceTextureHelper,
    ): VideoFrame {
        val width = frame.rotatedWidth
        val height = frame.rotatedHeight

        sourceBuffer.setSize(width, height)
        horizontalBlurBuffer.setSize(width, height)
        verticalBlurBuffer.setSize(width, height)
        outputBuffer.setSize(width, height)
        uploadMask(mask)

        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, sourceBuffer.frameBufferId)
        GLES20.glViewport(0, 0, width, height)
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
        frameDrawer.drawFrame(frame, inputDrawer, textureMatrix, 0, 0, width, height)

        drawBlurPass(
            sourceTextureId = sourceBuffer.textureId,
            targetFrameBufferId = horizontalBlurBuffer.frameBufferId,
            width = width,
            height = height,
            stepX = 1f / width.toFloat(),
            stepY = 0f,
        )
        drawBlurPass(
            sourceTextureId = horizontalBlurBuffer.textureId,
            targetFrameBufferId = verticalBlurBuffer.frameBufferId,
            width = width,
            height = height,
            stepX = 0f,
            stepY = 1f / height.toFloat(),
        )
        drawComposite(width, height)

        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
        GlUtil.checkNoGLES2Error("BackgroundBlurRenderer.render")

        val textureBuffer = TextureBufferImpl(
            width,
            height,
            VideoFrame.TextureBuffer.Type.RGB,
            outputBuffer.textureId,
            Matrix(),
            textureHelper.handler,
            yuvConverter,
        ) {}
        val output = textureBuffer.toI420()
        textureBuffer.release()
        return VideoFrame(output, 0, frame.timestampNs)
    }

    fun release() {
        if (maskTextureId != 0) {
            GLES20.glDeleteTextures(1, intArrayOf(maskTextureId), 0)
            maskTextureId = 0
        }
        sourceBuffer.release()
        horizontalBlurBuffer.release()
        verticalBlurBuffer.release()
        outputBuffer.release()
        blurProgram.release()
        compositeProgram.release()
        inputDrawer.release()
        frameDrawer.release()
        yuvConverter.release()
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
        sourceTextureId: Int,
        targetFrameBufferId: Int,
        width: Int,
        height: Int,
        stepX: Float,
        stepY: Float,
    ) {
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, targetFrameBufferId)
        GLES20.glViewport(0, 0, width, height)
        blurProgram.use()
        blurProgram.setTexture("uTexture", 0, sourceTextureId)
        GLES20.glUniform2f(blurProgram.uniform("uTexelStep"), stepX, stepY)
        blurProgram.draw()
    }

    private fun drawComposite(width: Int, height: Int) {
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, outputBuffer.frameBufferId)
        GLES20.glViewport(0, 0, width, height)
        compositeProgram.use()
        compositeProgram.setTexture("uOriginalTexture", 0, sourceBuffer.textureId)
        compositeProgram.setTexture("uBlurredTexture", 1, verticalBlurBuffer.textureId)
        compositeProgram.setTexture("uMaskTexture", 2, maskTextureId)
        compositeProgram.draw()
    }

    @Suppress("unused")
    private fun supportsGpuBlur(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && appContext.packageName.isNotBlank()

    companion object {
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
                float person = smoothstep(0.42, 0.72, confidence);
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
