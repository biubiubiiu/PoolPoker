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

    private var appContext: Context? = null
    private var bluetoothManager: BluetoothManager? = null
    private var bluetoothAdapter: BluetoothAdapter? = null

    // 房主 (Peripheral) 组件
    private var advertiser: BluetoothLeAdvertiser? = null
    private var gattServer: BluetoothGattServer? = null
    private var stateCharacteristic: BluetoothGattCharacteristic? = null
    private val connectedCentrals = mutableSetOf<BluetoothDevice>()

    // 客端 (Central) 组件
    private var scanner: BluetoothLeScanner? = null
    private var clientGatt: BluetoothGatt? = null
    private var commandCharacteristic: BluetoothGattCharacteristic? = null

    @JvmStatic
    fun init(context: Context) {
        appContext = context.applicationContext
        bluetoothManager = appContext?.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothAdapter = bluetoothManager?.adapter
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
                }
                if (wasConnected) {
                    notifyNativeClientDisconnected(device.address)
                }
            }
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
    }

    @JvmStatic
    @Keep
    fun startAdvertising(roomCode: String, hostName: String) {
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

        // 2. 构造并发送广播包 (携带房间码)
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setConnectable(true)
            .setTimeout(0)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .build()

        val serviceDataPayload = roomCode.toByteArray(Charsets.UTF_8)
        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .addServiceData(ParcelUuid(SERVICE_UUID), serviceDataPayload)
            .build()

        advertiser?.startAdvertising(settings, data, advertiseCallback)
        Log.d(TAG, "Started BLE Advertising for room: $roomCode ($hostName)")
    }

    @JvmStatic
    @Keep
    fun stopAdvertising() {
        try {
            advertiser?.stopAdvertising(advertiseCallback)
            advertiser = null
            gattServer?.close()
            gattServer = null
            synchronized(connectedCentrals) {
                connectedCentrals.clear()
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
        val server = gattServer ?: return
        val characteristic = stateCharacteristic ?: return

        characteristic.value = payload
        synchronized(connectedCentrals) {
            for (device in connectedCentrals) {
                if (targetAddress == null || device.address.equals(targetAddress, ignoreCase = true)) {
                    server.notifyCharacteristicChanged(device, characteristic, false)
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
            val roomCode = if (serviceData != null && serviceData.isNotEmpty()) {
                String(serviceData, Charsets.UTF_8)
            } else {
                "8848"
            }

            val deviceName = record.deviceName ?: result.device.name ?: "台球桌台"
            notifyNativeDiscoveredRoom(result.device.address, roomCode, deviceName, result.rssi)
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
                gatt.requestMtu(256)
                notifyNativePeripheralConnected(gatt.device.address)
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                Log.d(TAG, "Disconnected from Host peripheral.")
                clientGatt?.close()
                clientGatt = null
                notifyNativePeripheralDisconnected(gatt.device.address)
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            Log.d(TAG, "GATT MTU negotiated: $mtu bytes. Discovering services...")
            gatt.discoverServices()
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                val service = gatt.getService(SERVICE_UUID)
                if (service != null) {
                    commandCharacteristic = service.getCharacteristic(CHAR_COMMAND_UUID)
                    val stateChar = service.getCharacteristic(CHAR_STATE_UUID)
                    if (stateChar != null) {
                        gatt.setCharacteristicNotification(stateChar, true)
                        val cccd = stateChar.getDescriptor(CCCD_UUID)
                        if (cccd != null) {
                            cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                            gatt.writeDescriptor(cccd)
                            Log.d(TAG, "Successfully subscribed to State updates from Host.")
                        }
                    }
                }
            }
        }

        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            if (characteristic.uuid == CHAR_STATE_UUID) {
                val data = characteristic.value ?: return
                notifyNativeStateReceived(data)
            }
        }
    }

    @JvmStatic
    @Keep
    fun startScanning() {
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
        Log.d(TAG, "Connecting to Host device: $address")
        clientGatt = device.connectGatt(appContext, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
    }

    @JvmStatic
    @Keep
    fun disconnectPeripheral() {
        try {
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
        val gatt = clientGatt ?: return
        val characteristic = commandCharacteristic ?: return

        characteristic.value = payload
        characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
        gatt.writeCharacteristic(characteristic)
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
