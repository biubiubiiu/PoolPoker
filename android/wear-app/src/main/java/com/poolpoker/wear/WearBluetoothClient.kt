package com.poolpoker.wear

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.util.Log
import com.poolpoker.shared.WearSyncRoomPayload
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.UUID
import java.util.concurrent.Executors

object WearBluetoothClient {
    private const val TAG = "WearBluetoothClient"
    val SERVICE_UUID: UUID = UUID.fromString("8ce255c0-200a-11e0-ac64-0800200c9a66")

    private var socket: BluetoothSocket? = null
    private val executor = Executors.newSingleThreadExecutor()
    @Volatile private var isRunning = false
    @Volatile private var isConnected = false

    fun startListeningForPhoneCredentials(context: Context) {
        if (isRunning) return
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: return
        if (!adapter.isEnabled) return

        isRunning = true
        executor.execute {
            while (isRunning) {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                    if (androidx.core.app.ActivityCompat.checkSelfPermission(context, android.Manifest.permission.BLUETOOTH_CONNECT) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                        Log.w(TAG, "BLUETOOTH_CONNECT permission not granted on Android 12+")
                        try { Thread.sleep(3000L) } catch (_: InterruptedException) {}
                        continue
                    }
                }

                val pairedDevices: Set<BluetoothDevice> = try {
                    adapter.bondedDevices ?: emptySet()
                } catch (e: SecurityException) {
                    Log.w(TAG, "SecurityException checking bonded devices: ${e.message}")
                    emptySet()
                }

                var connectedThisRound = false
                for (device in pairedDevices) {
                    if (!isRunning) break
                    val deviceName = try { device.name } catch (_: SecurityException) { "Device" }
                    Log.d(TAG, "Attempting Bluetooth RFCOMM connection to paired device: $deviceName")

                    var clientSocket: BluetoothSocket? = null
                    // Strategy 1: Insecure RFCOMM with Service UUID
                    try {
                        val s = device.createInsecureRfcommSocketToServiceRecord(SERVICE_UUID)
                        s.connect()
                        clientSocket = s
                    } catch (e1: Exception) {
                        Log.d(TAG, "Insecure RFCOMM failed for $deviceName: ${e1.message}, trying Secure RFCOMM...")
                        // Strategy 2: Secure RFCOMM with Service UUID
                        try {
                            val s = device.createRfcommSocketToServiceRecord(SERVICE_UUID)
                            s.connect()
                            clientSocket = s
                        } catch (e2: Exception) {
                            Log.d(TAG, "Secure RFCOMM failed for $deviceName: ${e2.message}, trying reflection channel 1...")
                            // Strategy 3: Reflection fallback (channel 1)
                            try {
                                val m = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
                                val s = m.invoke(device, 1) as BluetoothSocket
                                s.connect()
                                clientSocket = s
                            } catch (e3: Exception) {
                                Log.d(TAG, "Reflection RFCOMM failed for $deviceName: ${e3.message}")
                            }
                        }
                    }

                    if (clientSocket == null) {
                        continue
                    }

                    try {
                        socket = clientSocket
                        isConnected = true
                        connectedThisRound = true
                        Log.d(TAG, "Successfully connected to phone Bluetooth RFCOMM: $deviceName")

                        val reader = BufferedReader(InputStreamReader(clientSocket.inputStream, Charsets.UTF_8))
                        while (isRunning && isConnected) {
                            val line = reader.readLine() ?: break
                            if (line.isNotBlank()) {
                                Log.d(TAG, "Received Bluetooth credentials from phone: $line")
                                try {
                                    val jsonObj = org.json.JSONObject(line)
                                    val event = jsonObj.optString("event")
                                    if (event == "leave_room") {
                                        Log.d(TAG, "Received leave_room event over Bluetooth. Disconnecting watch socket...")
                                        WearDirectSocketManager.disconnect()
                                    } else if (event == "room_credentials" || jsonObj.has("roomCode")) {
                                        val roomCode = jsonObj.optString("roomCode")
                                        val userId = if (jsonObj.has("userId")) jsonObj.optString("userId") else jsonObj.optString("myUserId")
                                        val rawUrl = jsonObj.optString("serverUrl")
                                        val targetUrl = if (rawUrl.isNotBlank()) rawUrl else BuildConfig.SERVER_URL

                                        if (roomCode.isNotBlank()) {
                                            Log.d(TAG, "Connecting watch direct socket to room $roomCode at $targetUrl")
                                            WearDirectSocketManager.connect(
                                                context = context,
                                                roomCode = roomCode,
                                                url = targetUrl,
                                                customUserId = if (userId.isNotBlank()) userId else null
                                            )
                                        }
                                    } else {
                                        val payload = WearSyncRoomPayload.fromJson(line)
                                        if (payload != null) {
                                            WearDataLayerListenerService.updateStateManually(payload)
                                            val targetUrl = payload.serverUrl?.ifBlank { null } ?: BuildConfig.SERVER_URL
                                            if (!WearDirectSocketManager.isConnected && payload.roomCode.isNotBlank()) {
                                                WearDirectSocketManager.connect(
                                                    context = context,
                                                    roomCode = payload.roomCode,
                                                    url = targetUrl,
                                                    customUserId = payload.myUserId
                                                )
                                            }
                                        }
                                    }
                                } catch (e: Exception) {
                                    Log.w(TAG, "Error parsing bluetooth payload line", e)
                                }
                            }
                        }
                    } catch (e: Exception) {
                        Log.d(TAG, "RFCOMM communication error with device $deviceName: ${e.message}")
                    } finally {
                        isConnected = false
                        try { socket?.close() } catch (_: Exception) {}
                        socket = null
                    }
                }

                if (!connectedThisRound && isRunning) {
                    try { Thread.sleep(3000L) } catch (_: InterruptedException) {}
                }
            }
        }
    }

    fun stop() {
        isRunning = false
        isConnected = false
        try {
            socket?.close()
        } catch (_: Exception) {}
        socket = null
    }
}
