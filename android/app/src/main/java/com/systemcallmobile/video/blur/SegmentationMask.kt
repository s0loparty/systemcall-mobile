package com.systemcallmobile.video.blur

data class SegmentationMask(
    val width: Int,
    val height: Int,
    val pixels: ByteArray,
    val version: Long,
) {
    override fun equals(other: Any?): Boolean =
        other is SegmentationMask &&
            width == other.width &&
            height == other.height &&
            version == other.version &&
            pixels.contentEquals(other.pixels)

    override fun hashCode(): Int {
        var result = width
        result = 31 * result + height
        result = 31 * result + pixels.contentHashCode()
        result = 31 * result + version.hashCode()
        return result
    }
}
