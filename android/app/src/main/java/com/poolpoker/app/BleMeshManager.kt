package com.poolpoker.app

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import androidx.annotation.Keep
import java.util.UUID

@Keep
@SuppressLint("MissingPermission")
object BleMeshManager {
    private const val TAG = "BleMeshManager"

    // PoolPoker 面对面专用 GATT UUIDs
    val SERVICE_UUID: UUID = UUID.fromString("0000a848-0000-1000-8000-00805f9b34fb")
    val CHAR_COMMAND_UUID: UUID = UUID.fromString("0000a849-0000-1000-8000-00805f9b34fb")
    val CHAR_STATE_UUID: UUID = UUID.fromString("0000a84a-0000-1000-8000-00805f9b34fb")
    val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    private const val BLE_PROTOCOL_VERSION: Byte = 0x01
    private const val MSG_HOST_STATE_CHUNK: Byte = 0x12
    private const val CHUNK_HEADER_SIZE = 5

    private var appContext: Context? = null
    private var bluetoothManager: BluetoothManager? = null
    private var bluetoothAdapter: BluetoothAdapter? = null

    private data class PendingNotification(
        val device: BluetoothDevice,
        val payload: ByteArray
    )

    // 房主 (Peripheral) 组件
    private var advertiser: BluetoothLeAdvertiser? = null
    private var gattServer: BluetoothGattServer? = null
    private var stateCharacteristic: BluetoothGattCharacteristic? = null
    private val connectedCentrals = mutableSetOf<BluetoothDevice>()
    private val clientMtuMap = java.util.concurrent.ConcurrentHashMap<String, Int>()
    private val notificationQueue = ArrayDeque<PendingNotification>()
    private var inFlightNotificationDevice: BluetoothDevice? = null
    private var nextTransferId: Int = 0

    // 客端 (Central) 组件
    private var scanner: BluetoothLeScanner? = null
    private var clientGatt: BluetoothGatt? = null
    private var commandCharacteristic: BluetoothGattCharacteristic? = null
    private val clientCommandQueue = ArrayDeque<ByteArray>()
    private var isClientReadyToWrite = false
    private var isClientWriteInFlight = false

    @JvmStatic
    fun init(context: Context) {
        appContext = context.applicationContext
        bluetoothManager = appContext?.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothAdapter = bluetoothManager?.adapter
    }

    private fun truncateUtf8(input: String, maxBytes: Int): String {
        val bytes = input.toByteArray(Charsets.UTF_8)
        if (bytes.size <= maxBytes) return input
        var count = 0
        val sb = StringBuilder()
        for (ch in input) {
            val chBytes = ch.toString().toByteArray(Charsets.UTF_8).size
            if (count + chBytes > maxBytes) break
            sb.append(ch)
            count += chBytes
        }
        return sb.toString()
    }

    // -------------------------------------------------------------
    // 房主外设 (Peripheral / GATT Server)
    // -------------------------------------------------------------

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            Log.d(TAG, "BLE Peripheral Advertising started successfully.")
        }

        override fun onStartFailure(errorCode: Int) {
            Log.e(TAG, "BLE Peripheral Advertising failed with error code: $errorCode")
        }
    }

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            super.onConnectionStateChange(device, status, newState)
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                Log.d(TAG, "Central client ACL connected: ${device.address}")
                // 等待 CCCD 描述符写入完成订阅后，再通知 native client connected，确保下行状态帧不会丢失
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                Log.d(TAG, "Central client disconnected: ${device.address}")
                val wasConnected: Boolean
                synchronized(connectedCentrals) {
                    wasConnected = connectedCentrals.remove(device)
                    notificationQueue.removeAll { it.device.address.equals(device.address, ignoreCase = true) }
                    if (inFlightNotificationDevice?.address.equals(device.address, ignoreCase = true)) {
                        inFlightNotificationDevice = null
                    }
                    clientMtuMap.remove(device.address)
                }
                drainNotificationQueue()
                if (wasConnected) {
                    notifyNativeClientDisconnected(device.address)
                }
            }
        }

        override fun onMtuChanged(device: BluetoothDevice, mtu: Int) {
            super.onMtuChanged(device, mtu)
            Log.d(TAG, "GATT Server MTU changed for ${device.address}: $mtu bytes")
            clientMtuMap[device.address] = mtu
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            super.onCharacteristicWriteRequest(device, requestId, characteristic, preparedWrite, responseNeeded, offset, value)
            if (responseNeeded) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value)
            }

            if (characteristic.uuid == CHAR_COMMAND_UUID && value != null) {
                Log.d(TAG, "Received client command from ${device.address}: ${value.size} bytes")
                notifyNativeCommandReceived(device.address, value)
            }
        }

        override fun onDescriptorWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            descriptor: BluetoothGattDescriptor,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            super.onDescriptorWriteRequest(device, requestId, descriptor, preparedWrite, responseNeeded, offset, value)
            if (responseNeeded) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value)
            }
            if (descriptor.uuid == CCCD_UUID && value != null) {
                val isSubscribed = value.contentEquals(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                Log.d(TAG, "Descriptor write from ${device.address}: CCCD updated (subscribed=$isSubscribed).")
                if (isSubscribed) {
                    synchronized(connectedCentrals) {
                        connectedCentrals.add(device)
                    }
                    notifyNativeClientConnected(device.address)
                } else {
                    val wasSubscribed: Boolean
                    synchronized(connectedCentrals) {
                        wasSubscribed = connectedCentrals.remove(device)
                    }
                    if (wasSubscribed) {
                        notifyNativeClientDisconnected(device.address)
                    }
                }
            }
        }

        override fun onNotificationSent(device: BluetoothDevice, status: Int) {
            super.onNotificationSent(device, status)
            synchronized(connectedCentrals) {
                if (inFlightNotificationDevice?.address.equals(device.address, ignoreCase = true)) {
                    inFlightNotificationDevice = null
                }
            }
            drainNotificationQueue()
        }
    }

    @JvmStatic
    @Keep
    fun startAdvertising(roomCode: String, hostName: String) {
        stopAdvertising()

        val adapter = bluetoothAdapter ?: return
        if (!adapter.isEnabled) return

        advertiser = adapter.bluetoothLeAdvertiser
        if (advertiser == null) {
            Log.e(TAG, "BluetoothLeAdvertiser not supported on this device.")
            return
        }

        // 1. 初始化并开启 GATT Server
        gattServer = bluetoothManager?.openGattServer(appContext, gattServerCallback)
        val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)

        // 客户端写入指令 Characteristic
        val commandChar = BluetoothGattCharacteristic(
            CHAR_COMMAND_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )

        // 房主推送状态 Characteristic (支持 Notify)
        val stateChar = BluetoothGattCharacteristic(
            CHAR_STATE_UUID,
            BluetoothGattCharacteristic.PROPERTY_NOTIFY or BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_READ
        )
        val cccd = BluetoothGattDescriptor(CCCD_UUID, BluetoothGattDescriptor.PERMISSION_WRITE or BluetoothGattDescriptor.PERMISSION_READ)
        stateChar.addDescriptor(cccd)

        service.addCharacteristic(commandChar)
        service.addCharacteristic(stateChar)
        gattServer?.addService(service)
        stateCharacteristic = stateChar

        // 2. 构造广播包与扫描响应包（分离 ServiceUUID 与 ServiceData，严格控制在 31 字节以内）
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setConnectable(true)
            .setTimeout(0)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .build()

        val shortHostName = truncateUtf8(hostName.replace("|", ""), 8)
        val serviceDataPayload = "$roomCode|$shortHostName".toByteArray(Charsets.UTF_8)

        val advertiseData = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()

        val scanResponse = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .addServiceData(ParcelUuid(SERVICE_UUID), serviceDataPayload)
            .build()

        advertiser?.startAdvertising(settings, advertiseData, scanResponse, advertiseCallback)
        Log.d(TAG, "Started BLE Advertising for room: $roomCode ($shortHostName)")
    }

    @JvmStatic
    @Keep
    fun stopAdvertising() {
        try {
            advertiser?.stopAdvertising(advertiseCallback)
            advertiser = null
            gattServer?.close()
            gattServer = null
            stateCharacteristic = null
            synchronized(connectedCentrals) {
                connectedCentrals.clear()
                notificationQueue.clear()
                inFlightNotificationDevice = null
                clientMtuMap.clear()
            }
            Log.d(TAG, "Stopped BLE Advertising & closed GATT server.")
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping advertising: ${e.message}")
        }
    }

    @JvmStatic
    @JvmOverloads
    @Keep
    fun notifyClients(payload: ByteArray, targetAddress: String? = null) {
        synchronized(connectedCentrals) {
            for (device in connectedCentrals) {
                if (targetAddress == null || device.address.equals(targetAddress, ignoreCase = true)) {
                    // 读取该连接实际协商的 MTU，若未协商或请求失败则采用标准 BLE 默认 MTU 23 字节 (载荷 20 字节)
                    val mtu = clientMtuMap[device.address] ?: 23
                    val maxNotificationLen = (mtu - 3).coerceAtLeast(20)

                    if (payload.size <= maxNotificationLen) {
                        notificationQueue.addLast(PendingNotification(device, payload.copyOf()))
                    } else {
                        // 依据该连接的实际上限分包，计入 5 字节协议头
                        // [version(1B), msgType=HOST_STATE_CHUNK(1B), transferId(1B), chunkIndex(1B), totalChunks(1B)]
                        val maxSliceLen = (maxNotificationLen - CHUNK_HEADER_SIZE).coerceAtLeast(1)
                        val totalChunks = (payload.size + maxSliceLen - 1) / maxSliceLen
                        val transferId = (nextTransferId++ and 0xff).toByte()

                        for (i in 0 until totalChunks) {
                            val start = i * maxSliceLen
                            val end = minOf(start + maxSliceLen, payload.size)
                            val chunkData = ByteArray(CHUNK_HEADER_SIZE + (end - start))
                            chunkData[0] = BLE_PROTOCOL_VERSION
                            chunkData[1] = MSG_HOST_STATE_CHUNK
                            chunkData[2] = transferId
                            chunkData[3] = i.toByte()
                            chunkData[4] = totalChunks.toByte()
                            System.arraycopy(payload, start, chunkData, CHUNK_HEADER_SIZE, end - start)
                            notificationQueue.addLast(PendingNotification(device, chunkData))
                        }
                    }
                }
            }
        }
        drainNotificationQueue()
    }

    private fun drainNotificationQueue() {
        val server = gattServer ?: return
        val characteristic = stateCharacteristic ?: return

        while (true) {
            val next: PendingNotification = synchronized(connectedCentrals) {
                if (inFlightNotificationDevice != null) return
                var candidate: PendingNotification? = null
                while (notificationQueue.isNotEmpty()) {
                    val item = notificationQueue.removeFirst()
                    if (connectedCentrals.any { it.address.equals(item.device.address, ignoreCase = true) }) {
                        candidate = item
                        break
                    }
                }
                if (candidate != null) {
                    inFlightNotificationDevice = candidate.device
                }
                candidate
            } ?: return

            val sent = try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    server.notifyCharacteristicChanged(
                        next.device,
                        characteristic,
                        false,
                        next.payload
                    ) == BluetoothStatusCodes.SUCCESS
                } else {
                    @Suppress("DEPRECATION")
                    characteristic.value = next.payload
                    @Suppress("DEPRECATION")
                    server.notifyCharacteristicChanged(next.device, characteristic, false)
                }
            } catch (e: Exception) {
                Log.w(TAG, "notifyCharacteristicChanged failed for ${next.device.address}: ${e.message}")
                false
            }
            if (sent) {
                return
            } else {
                synchronized(connectedCentrals) {
                    if (inFlightNotificationDevice?.address.equals(next.device.address, ignoreCase = true)) {
                        inFlightNotificationDevice = null
                    }
                }
            }
        }
    }

    // -------------------------------------------------------------
    // 客端中心 (Central / GATT Client)
    // -------------------------------------------------------------

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val record = result.scanRecord ?: return
            val serviceData = record.getServiceData(ParcelUuid(SERVICE_UUID))
            val rawName = record.deviceName ?: result.device.name

            var roomCode = "8848"
            var displayName = rawName ?: "台球桌台"

            if (serviceData != null && serviceData.isNotEmpty()) {
                val decoded = String(serviceData, Charsets.UTF_8)
                val parts = decoded.split("|", limit = 2)
                if (parts[0].isNotBlank()) {
                    roomCode = parts[0]
                }
                if (parts.size > 1 && parts[1].isNotBlank()) {
                    displayName = "${parts[1]}的球桌"
                }
            } else if (rawName != null && rawName.startsWith("PoolPoker_")) {
                val rest = rawName.removePrefix("PoolPoker_")
                val parts = rest.split("_", limit = 2)
                if (parts[0].isNotBlank()) {
                    roomCode = parts[0]
                }
                displayName = if (parts.size > 1 && parts[1].isNotBlank()) {
                    "${parts[1]}的球桌"
                } else {
                    "房间 $roomCode"
                }
            }

            notifyNativeDiscoveredRoom(result.device.address, roomCode, displayName, result.rssi)
        }

        override fun onScanFailed(errorCode: Int) {
            Log.e(TAG, "BLE Scan failed with error code: $errorCode")
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                Log.d(TAG, "Connected to Host peripheral. Requesting MTU 256...")
                clientGatt = gatt
                synchronized(clientCommandQueue) {
                    isClientReadyToWrite = false
                    isClientWriteInFlight = false
                }
                val requested = try {
                    gatt.requestMtu(256)
                } catch (e: Exception) {
                    Log.w(TAG, "requestMtu exception: ${e.message}")
                    false
                }
                if (!requested) {
                    Log.w(TAG, "requestMtu(256) failed to initiate, continuing with default MTU 23")
                    gatt.discoverServices()
                }
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                Log.d(TAG, "Disconnected from Host peripheral.")
                synchronized(clientCommandQueue) {
                    clientCommandQueue.clear()
                    isClientReadyToWrite = false
                    isClientWriteInFlight = false
                    commandCharacteristic = null
                }
                clientGatt?.close()
                clientGatt = null
                notifyNativePeripheralDisconnected(gatt.device.address)
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "GATT MTU negotiated successfully: $mtu bytes. Discovering services...")
            } else {
                Log.w(TAG, "GATT MTU negotiation returned status $status, proceeding with current MTU. Discovering services...")
            }
            gatt.discoverServices()
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                val service = gatt.getService(SERVICE_UUID)
                if (service != null) {
                    commandCharacteristic = service.getCharacteristic(CHAR_COMMAND_UUID)
                    val stateChar = service.getCharacteristic(CHAR_STATE_UUID)
                    var wroteDescriptor = false
                    if (stateChar != null) {
                        gatt.setCharacteristicNotification(stateChar, true)
                        val cccd = stateChar.getDescriptor(CCCD_UUID)
                        if (cccd != null) {
                            wroteDescriptor = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                gatt.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) == BluetoothStatusCodes.SUCCESS
                            } else {
                                @Suppress("DEPRECATION")
                                cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                                @Suppress("DEPRECATION")
                                gatt.writeDescriptor(cccd)
                            }
                            Log.d(TAG, "Subscribing to State updates from Host (wroteDescriptor=$wroteDescriptor).")
                        }
                    }
                    if (!wroteDescriptor) {
                        synchronized(clientCommandQueue) {
                            isClientReadyToWrite = true
                        }
                        notifyNativePeripheralConnected(gatt.device.address)
                        drainClientCommandQueue()
                    }
                }
            }
        }

        override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
            super.onDescriptorWrite(gatt, descriptor, status)
            if (descriptor.uuid == CCCD_UUID) {
                Log.d(TAG, "CCCD write completed (status=$status). Ready to notify connected & flush client commands.")
                synchronized(clientCommandQueue) {
                    isClientReadyToWrite = true
                }
                notifyNativePeripheralConnected(gatt.device.address)
                drainClientCommandQueue()
            }
        }

        override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
            super.onCharacteristicWrite(gatt, characteristic, status)
            if (characteristic.uuid == CHAR_COMMAND_UUID) {
                synchronized(clientCommandQueue) {
                    isClientWriteInFlight = false
                }
                drainClientCommandQueue()
            }
        }

        @Deprecated("Deprecated in Java")
        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                if (characteristic.uuid == CHAR_STATE_UUID) {
                    val data = characteristic.value ?: return
                    notifyNativeStateReceived(data)
                }
            }
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            if (characteristic.uuid == CHAR_STATE_UUID) {
                notifyNativeStateReceived(value)
            }
        }
    }

    @JvmStatic
    @Keep
    fun startScanning() {
        stopScanning()

        val adapter = bluetoothAdapter ?: return
        if (!adapter.isEnabled) return

        scanner = adapter.bluetoothLeScanner
        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        scanner?.startScan(listOf(filter), settings, scanCallback)
        Log.d(TAG, "Started BLE Scanning for PoolPoker rooms...")
    }

    @JvmStatic
    @Keep
    fun stopScanning() {
        try {
            scanner?.stopScan(scanCallback)
            scanner = null
            Log.d(TAG, "Stopped BLE Scanning.")
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping scan: ${e.message}")
        }
    }

    @JvmStatic
    @Keep
    fun connectPeripheral(address: String) {
        val adapter = bluetoothAdapter ?: return
        val device = adapter.getRemoteDevice(address) ?: return
        if (clientGatt != null && clientGatt?.device?.address.equals(address, ignoreCase = true)) {
            Log.d(TAG, "Already connected or connecting to Host device: $address, skipping duplicate connectGatt.")
            return
        }
        clientGatt?.close()
        clientGatt = null
        synchronized(clientCommandQueue) {
            clientCommandQueue.clear()
            isClientReadyToWrite = false
            isClientWriteInFlight = false
            commandCharacteristic = null
        }
        Log.d(TAG, "Connecting to Host device: $address")
        clientGatt = device.connectGatt(appContext, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
    }

    @JvmStatic
    @Keep
    fun disconnectPeripheral() {
        try {
            synchronized(clientCommandQueue) {
                clientCommandQueue.clear()
                isClientReadyToWrite = false
                isClientWriteInFlight = false
                commandCharacteristic = null
            }
            clientGatt?.disconnect()
            clientGatt?.close()
            clientGatt = null
            Log.d(TAG, "Disconnected from Host peripheral.")
        } catch (e: Exception) {
            Log.w(TAG, "Error disconnecting: ${e.message}")
        }
    }

    @JvmStatic
    @Keep
    fun sendCommandToHost(payload: ByteArray) {
        synchronized(clientCommandQueue) {
            clientCommandQueue.addLast(payload.copyOf())
        }
        drainClientCommandQueue()
    }

    private fun drainClientCommandQueue() {
        val gatt = clientGatt ?: return
        val characteristic = commandCharacteristic ?: return

        while (true) {
            val nextPayload: ByteArray = synchronized(clientCommandQueue) {
                if (!isClientReadyToWrite || isClientWriteInFlight || clientCommandQueue.isEmpty()) {
                    return
                }
                isClientWriteInFlight = true
                clientCommandQueue.removeFirst()
            }

            val initiated = try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    gatt.writeCharacteristic(
                        characteristic,
                        nextPayload,
                        BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                    ) == BluetoothStatusCodes.SUCCESS
                } else {
                    @Suppress("DEPRECATION")
                    characteristic.value = nextPayload
                    characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                    @Suppress("DEPRECATION")
                    gatt.writeCharacteristic(characteristic)
                }
            } catch (e: Exception) {
                Log.w(TAG, "writeCharacteristic failed: ${e.message}")
                false
            }
            if (initiated) {
                return
            } else {
                synchronized(clientCommandQueue) {
                    isClientWriteInFlight = false
                }
            }
        }
    }

    // -------------------------------------------------------------
    // JNI Native 回调桥接
    // -------------------------------------------------------------

    private external fun nativeOnDiscoveredRoom(deviceId: String, roomCode: String, name: String, rssi: Int)
    private external fun nativeOnClientConnected(peerId: String)
    private external fun nativeOnClientDisconnected(peerId: String)
    private external fun nativeOnCommandReceived(peerId: String, payload: ByteArray)
    private external fun nativeOnStateReceived(payload: ByteArray)
    private external fun nativeOnPeripheralConnected(deviceId: String)
    private external fun nativeOnPeripheralDisconnected(deviceId: String)

    private fun notifyNativeDiscoveredRoom(deviceId: String, roomCode: String, name: String, rssi: Int) {
        try { nativeOnDiscoveredRoom(deviceId, roomCode, name, rssi) } catch (_: Throwable) {}
    }
    private fun notifyNativeClientConnected(peerId: String) {
        try { nativeOnClientConnected(peerId) } catch (_: Throwable) {}
    }
    private fun notifyNativeClientDisconnected(peerId: String) {
        try { nativeOnClientDisconnected(peerId) } catch (_: Throwable) {}
    }
    private fun notifyNativeCommandReceived(peerId: String, payload: ByteArray) {
        try { nativeOnCommandReceived(peerId, payload) } catch (_: Throwable) {}
    }
    private fun notifyNativeStateReceived(payload: ByteArray) {
        try { nativeOnStateReceived(payload) } catch (_: Throwable) {}
    }
    private fun notifyNativePeripheralConnected(deviceId: String) {
        try { nativeOnPeripheralConnected(deviceId) } catch (_: Throwable) {}
    }
    private fun notifyNativePeripheralDisconnected(deviceId: String) {
        try { nativeOnPeripheralDisconnected(deviceId) } catch (_: Throwable) {}
    }
}
