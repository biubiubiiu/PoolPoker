package com.poolpoker.app

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothServerSocket
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.util.Log
import java.io.IOException
import java.util.UUID
import java.util.concurrent.Executors

import androidx.annotation.Keep

@Keep
object BluetoothServerRelay {
    private const val TAG = "BluetoothServerRelay"
    val SERVICE_UUID: UUID = UUID.fromString("8ce255c0-200a-11e0-ac64-0800200c9a66")
    private const val SERVICE_NAME = "PoolPokerBluetoothSync"

    private var serverSocket: BluetoothServerSocket? = null
    private val activeSockets = mutableListOf<BluetoothSocket>()
    private val executor = Executors.newCachedThreadPool()
    @Volatile private var isListening = false
    @Volatile var lastCredentialsPayload: String? = null
    private var appContext: Context? = null

    fun startListening(context: Context? = null) {
        if (context != null) {
            appContext = context.applicationContext
        }
        if (isListening) return
        val bluetoothManager = appContext?.getSystemService(BluetoothManager::class.java)
        @Suppress("DEPRECATION")
        val adapter = bluetoothManager?.adapter ?: BluetoothAdapter.getDefaultAdapter() ?: return
        if (!adapter.isEnabled) return

        isListening = true
        executor.execute {
            try {
                serverSocket = try {
                    adapter.listenUsingInsecureRfcommWithServiceRecord(SERVICE_NAME, SERVICE_UUID)
                } catch (e: Exception) {
                    try {
                        adapter.listenUsingRfcommWithServiceRecord(SERVICE_NAME, SERVICE_UUID)
                    } catch (secErr: SecurityException) {
                        Log.w(TAG, "BLUETOOTH_CONNECT permission missing on phone: ${secErr.message}")
                        null
                    }
                }
                if (serverSocket == null) return@execute

                Log.d(TAG, "Bluetooth RFCOMM ServerSocket started listening...")

                while (isListening) {
                    val socket = serverSocket?.accept() ?: break
                    val deviceName = try { socket.remoteDevice?.name } catch (_: SecurityException) { "Device" }
                    Log.d(TAG, "Watch connected via Bluetooth RFCOMM: $deviceName")
                    synchronized(activeSockets) {
                        activeSockets.add(socket)
                    }

                    // Send cached room credentials immediately if phone is currently in a room
                    val cachedPayload = lastCredentialsPayload
                    if (!cachedPayload.isNullOrBlank()) {
                        try {
                            val bytes = (cachedPayload.trim() + "\n").toByteArray(Charsets.UTF_8)
                            socket.outputStream.write(bytes)
                            socket.outputStream.flush()
                            Log.d(TAG, "Immediately sent cached room credentials to newly connected watch: $deviceName")
                        } catch (e: Exception) {
                            Log.w(TAG, "Failed to send cached room credentials to watch", e)
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Bluetooth ServerSocket closed/listener error: ${e.message}")
            } finally {
                isListening = false
            }
        }
    }

    @JvmStatic
    @Keep
    fun broadcastCredentials(jsonPayload: String) {
        if (jsonPayload.contains("leave_room")) {
            lastCredentialsPayload = null
        } else {
            lastCredentialsPayload = jsonPayload
        }
        startListening()
        executor.execute {
            val bytes = (jsonPayload.trim() + "\n").toByteArray(Charsets.UTF_8)
            synchronized(activeSockets) {
                Log.d(TAG, "broadcastCredentials called. Active RFCOMM sockets count: ${activeSockets.size}")
                if (activeSockets.isEmpty()) {
                    Log.w(TAG, "No watch connected via Bluetooth RFCOMM yet. Credentials cached for auto-send on connection.")
                    return@execute
                }
                val iterator = activeSockets.iterator()
                while (iterator.hasNext()) {
                    val socket = iterator.next()
                    try {
                        socket.outputStream.write(bytes)
                        socket.outputStream.flush()
                        Log.d(TAG, "Successfully sent room credentials via Bluetooth RFCOMM to ${socket.remoteDevice?.name}")
                    } catch (e: IOException) {
                        Log.w(TAG, "Bluetooth device disconnected, removing socket", e)
                        try { socket.close() } catch (_: Exception) {}
                        iterator.remove()
                    }
                }
            }
        }
    }
}
