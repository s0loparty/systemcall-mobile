package com.systemcallmobile.video.blur

import android.opengl.GLES20
import android.opengl.GLES30
import android.util.Log
import org.webrtc.GlRectDrawer
import org.webrtc.GlTextureFrameBuffer
import org.webrtc.GlUtil
import org.webrtc.VideoFrame
import org.webrtc.VideoFrameDrawer
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Creates a tiny RGBA segmentation sample directly from the current GL frame.
 *
 * On OpenGL ES 3 contexts, pixel readback is pipelined through two PBOs. We only
 * map a previous readback after its fence is already signaled, so CaptureThread
 * never waits for the GPU. This class deliberately stops at a raw RGBA copy:
 * RGBA -> Bitmap conversion is done later on the segmentation worker.
 */
class GpuSegmentationSampler {
    private var resources: GlResources? = null
    private var currentWidth = 0
    private var currentHeight = 0
    private var firstSampleLogged = false
    private var pboSupported: Boolean? = null
    private var pboSlots: List<PboSlot> = emptyList()
    private var nextWriteSlot = 0

    /**
     * Returns a raw RGBA sample only when one is ready. With the async PBO path
     * the first call normally only queues GPU readback, so null is expected.
     */
    fun sample(frame: VideoFrame): SegmentationRgbaSample? {
        val gl = getOrCreateResources()
        val sourceWidth = frame.rotatedWidth
        val sourceHeight = frame.rotatedHeight
        val longestSide = maxOf(sourceWidth, sourceHeight)
        val scale = SEGMENTATION_MAX_SIDE.toFloat() / longestSide.toFloat()
        val width = maxOf(2, (sourceWidth * scale).toInt())
        val height = maxOf(2, (sourceHeight * scale).toInt())
        val byteCount = width * height * RGBA_BYTES_PER_PIXEL

        if (width != currentWidth || height != currentHeight) {
            gl.frameBuffer.setSize(width, height)
            resetPbos()
            currentWidth = width
            currentHeight = height
        }

        if (supportsPboReadback()) {
            ensurePbos(byteCount)

            // Consume an older readback only when its fence says the GPU is done.
            // Mapping/copying this already-completed tiny PBO is the only CPU work
            // kept on CaptureThread; color conversion and Bitmap allocation happen
            // on the segmentation worker.
            val ready = consumeReadyPbo(width, height, byteCount)

            renderThumbnail(frame, gl, width, height)
            enqueuePboReadback(byteCount)

            logFirstSample("gpu-pbo-async-raw", width, height)
            return ready
        }

        val rgba = ByteBuffer.allocateDirect(byteCount).order(ByteOrder.nativeOrder())
        renderThumbnail(frame, gl, width, height)
        try {
            GLES20.glReadPixels(
                0,
                0,
                width,
                height,
                GLES20.GL_RGBA,
                GLES20.GL_UNSIGNED_BYTE,
                rgba,
            )
            GlUtil.checkNoGLES2Error("GpuSegmentationSampler.sampleSync")
        } finally {
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
        }
        rgba.position(0)

        logFirstSample("gpu-rgba-readback-sync-raw-fallback", width, height)
        return SegmentationRgbaSample(width = width, height = height, rgba = rgba)
    }

    private fun renderThumbnail(
        frame: VideoFrame,
        gl: GlResources,
        width: Int,
        height: Int,
    ) {
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
        GlUtil.checkNoGLES2Error("GpuSegmentationSampler.renderThumbnail")
    }

    private fun supportsPboReadback(): Boolean {
        pboSupported?.let { return it }
        val version = GLES20.glGetString(GLES20.GL_VERSION).orEmpty()
        val supported = version.contains("OpenGL ES 3")
        pboSupported = supported
        Log.i(TAG, "SegmentationPbo: supported=$supported, glVersion=$version")
        return supported
    }

    private fun ensurePbos(byteCount: Int) {
        if (pboSlots.size == PBO_COUNT && pboSlots.all { it.byteCount == byteCount }) return
        resetPbos()

        val ids = IntArray(PBO_COUNT)
        GLES30.glGenBuffers(PBO_COUNT, ids, 0)
        pboSlots = ids.map { id ->
            GLES30.glBindBuffer(GLES30.GL_PIXEL_PACK_BUFFER, id)
            GLES30.glBufferData(
                GLES30.GL_PIXEL_PACK_BUFFER,
                byteCount,
                null,
                GLES30.GL_STREAM_READ,
            )
            PboSlot(id = id, byteCount = byteCount)
        }
        GLES30.glBindBuffer(GLES30.GL_PIXEL_PACK_BUFFER, 0)
        GlUtil.checkNoGLES2Error("GpuSegmentationSampler.ensurePbos")
        nextWriteSlot = 0
    }

    private fun enqueuePboReadback(byteCount: Int) {
        if (pboSlots.isEmpty()) {
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
            return
        }

        val slot = pboSlots[nextWriteSlot]
        if (slot.sync != 0L && !isFenceReady(slot.sync)) {
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
            return
        }
        clearFence(slot)

        GLES30.glBindBuffer(GLES30.GL_PIXEL_PACK_BUFFER, slot.id)
        GLES30.glBufferData(
            GLES30.GL_PIXEL_PACK_BUFFER,
            byteCount,
            null,
            GLES30.GL_STREAM_READ,
        )
        GLES30.glReadPixels(
            0,
            0,
            currentWidth,
            currentHeight,
            GLES30.GL_RGBA,
            GLES30.GL_UNSIGNED_BYTE,
            0,
        )
        slot.sync = GLES30.glFenceSync(GLES30.GL_SYNC_GPU_COMMANDS_COMPLETE, 0)
        GLES30.glBindBuffer(GLES30.GL_PIXEL_PACK_BUFFER, 0)
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
        GlUtil.checkNoGLES2Error("GpuSegmentationSampler.enqueuePboReadback")
        nextWriteSlot = (nextWriteSlot + 1) % pboSlots.size
    }

    private fun consumeReadyPbo(
        width: Int,
        height: Int,
        byteCount: Int,
    ): SegmentationRgbaSample? {
        for (slot in pboSlots) {
            val sync = slot.sync
            if (sync == 0L || !isFenceReady(sync)) continue

            GLES30.glBindBuffer(GLES30.GL_PIXEL_PACK_BUFFER, slot.id)
            val mapped = GLES30.glMapBufferRange(
                GLES30.GL_PIXEL_PACK_BUFFER,
                0,
                byteCount,
                GLES30.GL_MAP_READ_BIT,
            ) as? ByteBuffer

            if (mapped == null) {
                GLES30.glBindBuffer(GLES30.GL_PIXEL_PACK_BUFFER, 0)
                clearFence(slot)
                continue
            }

            val copy = ByteBuffer.allocateDirect(byteCount).order(ByteOrder.nativeOrder())
            mapped.position(0)
            mapped.limit(byteCount)
            copy.put(mapped)
            copy.position(0)
            GLES30.glUnmapBuffer(GLES30.GL_PIXEL_PACK_BUFFER)
            GLES30.glBindBuffer(GLES30.GL_PIXEL_PACK_BUFFER, 0)
            clearFence(slot)
            return SegmentationRgbaSample(width = width, height = height, rgba = copy)
        }
        return null
    }

    private fun isFenceReady(sync: Long): Boolean {
        val result = GLES30.glClientWaitSync(sync, 0, 0L)
        return result == GLES30.GL_ALREADY_SIGNALED || result == GLES30.GL_CONDITION_SATISFIED
    }

    private fun clearFence(slot: PboSlot) {
        if (slot.sync != 0L) {
            GLES30.glDeleteSync(slot.sync)
            slot.sync = 0L
        }
    }

    private fun resetPbos() {
        if (pboSlots.isNotEmpty()) {
            pboSlots.forEach { clearFence(it) }
            GLES30.glDeleteBuffers(
                pboSlots.size,
                pboSlots.map { it.id }.toIntArray(),
                0,
            )
            GLES30.glBindBuffer(GLES30.GL_PIXEL_PACK_BUFFER, 0)
        }
        pboSlots = emptyList()
        nextWriteSlot = 0
    }

    private fun logFirstSample(path: String, width: Int, height: Int) {
        if (firstSampleLogged) return
        firstSampleLogged = true
        Log.i(
            TAG,
            "SegmentationInput: path=$path, size=${width}x$height, " +
                "thread=${Thread.currentThread().name}",
        )
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

    private data class PboSlot(
        val id: Int,
        val byteCount: Int,
        var sync: Long = 0L,
    )

    companion object {
        private const val TAG = "SystemCall.Segmentation"
        private const val SEGMENTATION_MAX_SIDE = 192
        private const val RGBA_BYTES_PER_PIXEL = 4
        private const val PBO_COUNT = 2
    }
}

data class SegmentationRgbaSample(
    val width: Int,
    val height: Int,
    val rgba: ByteBuffer,
)
