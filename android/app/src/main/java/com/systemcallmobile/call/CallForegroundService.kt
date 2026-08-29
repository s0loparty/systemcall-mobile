package com.systemcallmobile.call

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class CallForegroundService : Service() {
    companion object {
        const val CHANNEL_ID = "systemcall_active_call"
        const val NOTIFICATION_ID = 9001
        const val EXTRA_CAMERA_ENABLED = "cameraEnabled"
        const val EXTRA_MICROPHONE_ENABLED = "microphoneEnabled"
    }

    private var cameraEnabled = true
    private var microphoneEnabled = true

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        cameraEnabled = intent?.getBooleanExtra(EXTRA_CAMERA_ENABLED, cameraEnabled) ?: cameraEnabled
        microphoneEnabled =
            intent?.getBooleanExtra(EXTRA_MICROPHONE_ENABLED, microphoneEnabled)
                ?: microphoneEnabled

        promoteToForeground(buildNotification())
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        val channel = NotificationChannel(
            CHANNEL_ID,
            "Активный звонок",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Уведомление активного звонка SystemCall"
            setShowBadge(false)
        }

        getSystemService(NotificationManager::class.java)
            .createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SystemCall")
            .setContentText("Идёт видеозвонок")
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

    private fun promoteToForeground(notification: Notification) {
        val foregroundTypes =
            buildList {
                if (cameraEnabled) {
                    add(ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA)
                }
                if (microphoneEnabled) {
                    add(ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
                }
            }.fold(0) { acc, type -> acc or type }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && foregroundTypes != 0) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                foregroundTypes,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }
}
