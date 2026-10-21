import Foundation
import CoreBluetooth

// PoolPoker 面对面专用 GATT UUIDs
public let POOLPOKER_SERVICE_UUID = CBUUID(string: "0000a848-0000-1000-8000-00805f9b34fb")
public let POOLPOKER_CHAR_COMMAND_UUID = CBUUID(string: "0000a849-0000-1000-8000-00805f9b34fb")
public let POOLPOKER_CHAR_STATE_UUID = CBUUID(string: "0000a84a-0000-1000-8000-00805f9b34fb")

private let BLE_PROTOCOL_VERSION: UInt8 = 0x01
private let MSG_HOST_STATE_CHUNK: UInt8 = 0x12
private let CHUNK_HEADER_SIZE = 5

// Rust C-ABI 接收桥接声明
@_silgen_name("poolpoker_on_ble_discovered_room")
func poolpoker_on_ble_discovered_room(_ deviceId: UnsafePointer<CChar>, _ roomCode: UnsafePointer<CChar>, _ name: UnsafePointer<CChar>, _ rssi: Int32)

@_silgen_name("poolpoker_on_ble_command_received")
func poolpoker_on_ble_command_received(_ peerId: UnsafePointer<CChar>, _ bytes: UnsafePointer<UInt8>, _ len: Int)

@_silgen_name("poolpoker_on_ble_state_received")
func poolpoker_on_ble_state_received(_ bytes: UnsafePointer<UInt8>, _ len: Int)

@_silgen_name("poolpoker_on_ble_peripheral_connected")
func poolpoker_on_ble_peripheral_connected(_ deviceId: UnsafePointer<CChar>)

@_silgen_name("poolpoker_on_ble_peripheral_disconnected")
func poolpoker_on_ble_peripheral_disconnected(_ deviceId: UnsafePointer<CChar>)

@_silgen_name("poolpoker_on_ble_client_connected")
func poolpoker_on_ble_client_connected(_ peerId: UnsafePointer<CChar>)

@_silgen_name("poolpoker_on_ble_client_disconnected")
func poolpoker_on_ble_client_disconnected(_ peerId: UnsafePointer<CChar>)

@MainActor
final class BleMeshController: NSObject, CBPeripheralManagerDelegate, CBCentralManagerDelegate, CBPeripheralDelegate {
    static let shared = BleMeshController()

    private struct PendingNotification {
        let data: Data
        let targetCentralIds: [UUID]?
    }

    // 房主外设模式
    private var peripheralManager: CBPeripheralManager?
    private var stateCharacteristic: CBMutableCharacteristic?
    private var subscribedCentrals: [UUID: CBCentral] = [:]
    private var pendingNotifications: [PendingNotification] = []
    private var currentRoomCode = "8848"
    private var currentHostName = "房主"
    private var isAdvertising = false

    // 客端中心模式
    private var centralManager: CBCentralManager?
    private var isScanning = false
    private var discoveredPeripherals: [UUID: CBPeripheral] = [:]
    private var lastDiscoveryReport: [UUID: (timestamp: TimeInterval, roomCode: String, displayName: String)] = [:]
    private var connectedPeripheral: CBPeripheral?
    private var commandCharacteristic: CBCharacteristic?
    private var isClientReadyToWrite = false
    private var pendingConnectIdentifier: String?
    private var pendingClientCommands: [Data] = []

    override init() {
        super.init()
    }

    private func truncateUtf8(_ input: String, maxBytes: Int) -> String {
        if input.utf8.count <= maxBytes { return input }
        var result = ""
        var byteCount = 0
        for ch in input {
            let chBytes = String(ch).utf8.count
            if byteCount + chBytes > maxBytes { break }
            result.append(ch)
            byteCount += chBytes
        }
        return result
    }

    func setupManagers() {
        if peripheralManager == nil {
            peripheralManager = CBPeripheralManager(delegate: self, queue: nil)
        }
        if centralManager == nil {
            centralManager = CBCentralManager(delegate: self, queue: nil)
        }
    }

    // -------------------------------------------------------------
    // 房主 (Peripheral) 操作
    // -------------------------------------------------------------

    func startAdvertising(roomCode: String, hostName: String) {
        setupManagers()
        currentRoomCode = roomCode
        currentHostName = hostName
        isAdvertising = true
        guard let pm = peripheralManager, pm.state == .poweredOn else { return }

        pm.stopAdvertising()
        pm.removeAllServices()
        pendingNotifications.removeAll()

        // 配置 GATT 服务与特征值
        let commandChar = CBMutableCharacteristic(
            type: POOLPOKER_CHAR_COMMAND_UUID,
            properties: [.write, .writeWithoutResponse],
            value: nil,
            permissions: [.writeable]
        )
        let stateChar = CBMutableCharacteristic(
            type: POOLPOKER_CHAR_STATE_UUID,
            properties: [.notify, .read],
            value: nil,
            permissions: [.readable]
        )
        self.stateCharacteristic = stateChar

        let service = CBMutableService(type: POOLPOKER_SERVICE_UUID, primary: true)
        service.characteristics = [commandChar, stateChar]
        pm.add(service)

        let shortHostName = truncateUtf8(hostName.replacingOccurrences(of: "_", with: ""), maxBytes: 8)
        let localName = shortHostName.isEmpty ? "PoolPoker_\(roomCode)" : "PoolPoker_\(roomCode)_\(shortHostName)"
        let advertisementData: [String: Any] = [
            CBAdvertisementDataServiceUUIDsKey: [POOLPOKER_SERVICE_UUID],
            CBAdvertisementDataLocalNameKey: localName
        ]
        pm.startAdvertising(advertisementData)
        NSLog("[BleMeshController] iOS Started Advertising for room: %@ (%@)", roomCode, localName)
    }

    func stopAdvertising() {
        isAdvertising = false
        peripheralManager?.stopAdvertising()
        peripheralManager?.removeAllServices()
        subscribedCentrals.removeAll()
        pendingNotifications.removeAll()
        stateCharacteristic = nil
        NSLog("[BleMeshController] iOS Stopped Advertising.")
    }

    private var nextTransferId: UInt8 = 0

    func notifyClients(data: Data, targetPeerId: String? = nil) {
        if let targetId = targetPeerId {
            guard let targetUuid = UUID(uuidString: targetId), let central = subscribedCentrals[targetUuid] else {
                // 指定目标不存在（例如客机刚刚断开或注销）时立即返回，严禁回退全员广播泄露手牌
                return
            }
            enqueueNotification(data: data, for: central)
        } else {
            guard !subscribedCentrals.isEmpty else { return }
            for central in subscribedCentrals.values {
                enqueueNotification(data: data, for: central)
            }
        }
        drainPendingNotifications()
    }

    private func enqueueNotification(data: Data, for central: CBCentral) {
        let maxLen = central.maximumUpdateValueLength
        if data.count <= maxLen {
            pendingNotifications.append(PendingNotification(data: data, targetCentralIds: [central.identifier]))
            return
        }

        // 依据该连接的 actual maximumUpdateValueLength 动态切片，并计入 5 字节分包头
        // [version(1B), msgType=HOST_STATE_CHUNK(1B), transferId(1B), chunkIndex(1B), totalChunks(1B)]
        let maxSliceLen = max(1, maxLen - CHUNK_HEADER_SIZE)
        let totalChunks = (data.count + maxSliceLen - 1) / maxSliceLen
        let transferId = nextTransferId
        nextTransferId = nextTransferId &+ 1

        for i in 0..<totalChunks {
            let start = i * maxSliceLen
            let end = min(start + maxSliceLen, data.count)
            let slice = data.subdata(in: start..<end)
            var chunkData = Data([BLE_PROTOCOL_VERSION, MSG_HOST_STATE_CHUNK, transferId, UInt8(i), UInt8(totalChunks)])
            chunkData.append(slice)
            pendingNotifications.append(PendingNotification(data: chunkData, targetCentralIds: [central.identifier]))
        }
    }

    private func drainPendingNotifications() {
        guard let pm = peripheralManager, let char = stateCharacteristic else { return }
        while !pendingNotifications.isEmpty {
            let item = pendingNotifications[0]
            let targets: [CBCentral]
            if let ids = item.targetCentralIds {
                targets = ids.compactMap { subscribedCentrals[$0] }
            } else {
                targets = Array(subscribedCentrals.values)
            }
            if targets.isEmpty {
                pendingNotifications.removeFirst()
                continue
            }
            let sent = pm.updateValue(item.data, for: char, onSubscribedCentrals: targets)
            if sent {
                pendingNotifications.removeFirst()
            } else {
                // 底层发送队列已满，等待 peripheralManagerIsReady(toUpdateSubscribers:) 回调重发
                return
            }
        }
    }

    // CBPeripheralManagerDelegate
    nonisolated func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        Task { @MainActor in
            if peripheral.state == .poweredOn && self.isAdvertising {
                self.startAdvertising(roomCode: self.currentRoomCode, hostName: self.currentHostName)
            }
        }
    }

    nonisolated func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
        Task { @MainActor in
            self.drainPendingNotifications()
        }
    }

    nonisolated func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo characteristic: CBCharacteristic) {
        let peerId = central.identifier.uuidString
        Task { @MainActor in
            self.subscribedCentrals[central.identifier] = central
            peerId.withCString { cPeerId in
                poolpoker_on_ble_client_connected(cPeerId)
            }
        }
    }

    nonisolated func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom characteristic: CBCharacteristic) {
        let peerId = central.identifier.uuidString
        Task { @MainActor in
            self.subscribedCentrals.removeValue(forKey: central.identifier)
            peerId.withCString { cPeerId in
                poolpoker_on_ble_client_disconnected(cPeerId)
            }
        }
    }

    nonisolated func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        for request in requests {
            if request.characteristic.uuid == POOLPOKER_CHAR_COMMAND_UUID, let data = request.value {
                let peerId = request.central.identifier.uuidString
                data.withUnsafeBytes { rawBuffer in
                    if let ptr = rawBuffer.baseAddress?.assumingMemoryBound(to: UInt8.self) {
                        peerId.withCString { cPeerId in
                            poolpoker_on_ble_command_received(cPeerId, ptr, data.count)
                        }
                    }
                }
                peripheral.respond(to: request, withResult: .success)
            }
        }
    }

    // -------------------------------------------------------------
    // 客端 (Central) 操作
    // -------------------------------------------------------------

    func startScanning() {
        setupManagers()
        isScanning = true
        guard let cm = centralManager, cm.state == .poweredOn else { return }
        discoveredPeripherals.removeAll()
        lastDiscoveryReport.removeAll()
        cm.scanForPeripherals(withServices: [POOLPOKER_SERVICE_UUID], options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
        NSLog("[BleMeshController] iOS Started Scanning for rooms...")
    }

    func stopScanning() {
        isScanning = false
        centralManager?.stopScan()
        NSLog("[BleMeshController] iOS Stopped Scanning.")
    }

    func connectPeripheral(identifier: String) {
        setupManagers()
        pendingConnectIdentifier = identifier
        guard let cm = centralManager else { return }
        if cm.state != .poweredOn {
            NSLog("[BleMeshController] centralManager not powered on yet (%ld). Pending connect: %@", cm.state.rawValue, identifier)
            return
        }
        performConnect(identifier: identifier)
    }

    private func performConnect(identifier: String) {
        guard let uuid = UUID(uuidString: identifier), let cm = centralManager else { return }

        // 如果已经连接或正在连接该外设，避免重复发起
        if let p = connectedPeripheral, p.identifier == uuid && (p.state == .connected || p.state == .connecting) {
            NSLog("[BleMeshController] Already connected or connecting to peripheral: %@", identifier)
            pendingConnectIdentifier = nil
            return
        }

        commandCharacteristic = nil
        isClientReadyToWrite = false
        pendingClientCommands.removeAll()

        // 1. 优先从内存缓存查找
        if let peripheral = discoveredPeripherals[uuid] {
            pendingConnectIdentifier = nil
            connectedPeripheral = peripheral
            peripheral.delegate = self
            cm.connect(peripheral, options: nil)
            NSLog("[BleMeshController] Connecting to memory-cached peripheral: %@", identifier)
            return
        }

        // 2. 尝试从 iOS 系统已知外设恢复（冷启动重连关键路径）
        let retrieved = cm.retrievePeripherals(withIdentifiers: [uuid])
        if let peripheral = retrieved.first {
            pendingConnectIdentifier = nil
            discoveredPeripherals[uuid] = peripheral
            connectedPeripheral = peripheral
            peripheral.delegate = self
            cm.connect(peripheral, options: nil)
            NSLog("[BleMeshController] Connecting to retrieved system peripheral: %@", identifier)
            return
        }

        // 3. 既未在内存也未在系统已知列表，启动扫描寻找指定目标并自动连接
        NSLog("[BleMeshController] Peripheral not found in cache/system, starting scan to reconnect: %@", identifier)
        startScanning()
    }

    func disconnectPeripheral() {
        pendingConnectIdentifier = nil
        commandCharacteristic = nil
        isClientReadyToWrite = false
        pendingClientCommands.removeAll()
        if let p = connectedPeripheral {
            centralManager?.cancelPeripheralConnection(p)
            connectedPeripheral = nil
        }
    }

    func sendCommand(data: Data) {
        pendingClientCommands.append(data)
        flushPendingClientCommands()
    }

    private func flushPendingClientCommands() {
        guard isClientReadyToWrite, let p = connectedPeripheral, let char = commandCharacteristic else { return }
        while !pendingClientCommands.isEmpty {
            if !p.canSendWriteWithoutResponse {
                return
            }
            let cmd = pendingClientCommands.removeFirst()
            p.writeValue(cmd, for: char, type: .withoutResponse)
        }
    }

    // CBCentralManagerDelegate
    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Task { @MainActor in
            if central.state == .poweredOn {
                NSLog("[BleMeshController] CBCentralManager powered on.")
                if let pendingId = self.pendingConnectIdentifier {
                    self.performConnect(identifier: pendingId)
                } else if self.isScanning {
                    self.startScanning()
                }
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        Task { @MainActor in
            self.discoveredPeripherals[peripheral.identifier] = peripheral

            // 如果存在待重连的外设，匹配即连
            if let pendingId = self.pendingConnectIdentifier,
               peripheral.identifier.uuidString.caseInsensitiveCompare(pendingId) == .orderedSame {
                NSLog("[BleMeshController] Found pending reconnect peripheral during scan: %@", pendingId)
                self.pendingConnectIdentifier = nil
                self.stopScanning()
                self.connectedPeripheral = peripheral
                peripheral.delegate = self
                central.connect(peripheral, options: nil)
                return
            }

            let rawLocalName = (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? peripheral.name
            var roomCode = "8848"
            var displayName = rawLocalName ?? "台球桌台"

            // 1. 优先解析 Android 端广播的 ServiceData ("8848|房主昵称")
            if let serviceDataMap = advertisementData[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data],
               let rawData = serviceDataMap[POOLPOKER_SERVICE_UUID] ?? serviceDataMap.values.first,
               let decoded = String(data: rawData, encoding: .utf8), !decoded.isEmpty {
                let parts = decoded.split(separator: "|", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
                if !parts[0].isEmpty {
                    roomCode = parts[0]
                }
                if parts.count > 1 && !parts[1].isEmpty {
                    displayName = "\(parts[1])的球桌"
                } else {
                    displayName = "房间 \(roomCode)"
                }
            } else if let localName = rawLocalName, localName.hasPrefix("PoolPoker_") {
                // 2. 解析 iOS 端广播的 LocalName ("PoolPoker_8848_房主昵称" 或 "PoolPoker_8848")
                let rest = String(localName.dropFirst("PoolPoker_".count))
                let parts = rest.split(separator: "_", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
                if !parts[0].isEmpty {
                    roomCode = parts[0]
                }
                if parts.count > 1 && !parts[1].isEmpty {
                    displayName = "\(parts[1])的球桌"
                } else {
                    displayName = "房间 \(roomCode)"
                }
            }

            let now = Date().timeIntervalSince1970
            if let prev = self.lastDiscoveryReport[peripheral.identifier],
               now - prev.timestamp < 1.5 && prev.roomCode == roomCode && prev.displayName == displayName {
                return
            }
            self.lastDiscoveryReport[peripheral.identifier] = (now, roomCode, displayName)

            let idStr = peripheral.identifier.uuidString
            idStr.withCString { cId in
                roomCode.withCString { cCode in
                    displayName.withCString { cName in
                        poolpoker_on_ble_discovered_room(cId, cCode, cName, RSSI.int32Value)
                    }
                }
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        Task { @MainActor in
            NSLog("[BleMeshController] Peripheral connected: %@", peripheral.identifier.uuidString)
            self.pendingConnectIdentifier = nil
            peripheral.discoverServices([POOLPOKER_SERVICE_UUID])
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        Task { @MainActor in
            NSLog("[BleMeshController] Peripheral failed to connect: %@", error?.localizedDescription ?? "unknown")
            let idStr = peripheral.identifier.uuidString
            idStr.withCString { cId in
                poolpoker_on_ble_peripheral_disconnected(cId)
            }
            if self.connectedPeripheral == peripheral {
                self.connectedPeripheral = nil
                self.commandCharacteristic = nil
                self.isClientReadyToWrite = false
                self.pendingClientCommands.removeAll()
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        Task { @MainActor in
            NSLog("[BleMeshController] Peripheral disconnected.")
            let idStr = peripheral.identifier.uuidString
            idStr.withCString { cId in
                poolpoker_on_ble_peripheral_disconnected(cId)
            }
            if self.connectedPeripheral == peripheral {
                self.connectedPeripheral = nil
                self.commandCharacteristic = nil
                self.isClientReadyToWrite = false
                self.pendingClientCommands.removeAll()
            }
        }
    }

    // CBPeripheralDelegate
    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let services = peripheral.services else { return }
        for service in services where service.uuid == POOLPOKER_SERVICE_UUID {
            peripheral.discoverCharacteristics([POOLPOKER_CHAR_COMMAND_UUID, POOLPOKER_CHAR_STATE_UUID], for: service)
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard let characteristics = service.characteristics else { return }
        Task { @MainActor in
            var hasStateChar = false
            for char in characteristics {
                if char.uuid == POOLPOKER_CHAR_COMMAND_UUID {
                    self.commandCharacteristic = char
                } else if char.uuid == POOLPOKER_CHAR_STATE_UUID {
                    hasStateChar = true
                    peripheral.setNotifyValue(true, for: char)
                    NSLog("[BleMeshController] Subscribing to State updates from Host...")
                }
            }
            if !hasStateChar {
                self.isClientReadyToWrite = true
                let idStr = peripheral.identifier.uuidString
                idStr.withCString { cId in
                    poolpoker_on_ble_peripheral_connected(cId)
                }
                self.flushPendingClientCommands()
            }
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        guard characteristic.uuid == POOLPOKER_CHAR_STATE_UUID else { return }
        Task { @MainActor in
            NSLog("[BleMeshController] Notification state updated for State char (isNotifying=%d, error=%@).", characteristic.isNotifying ? 1 : 0, error?.localizedDescription ?? "nil")
            self.isClientReadyToWrite = true
            let idStr = peripheral.identifier.uuidString
            idStr.withCString { cId in
                poolpoker_on_ble_peripheral_connected(cId)
            }
            self.flushPendingClientCommands()
        }
    }

    nonisolated func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
        Task { @MainActor in
            self.flushPendingClientCommands()
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if characteristic.uuid == POOLPOKER_CHAR_STATE_UUID, let data = characteristic.value {
            data.withUnsafeBytes { rawBuffer in
                if let ptr = rawBuffer.baseAddress?.assumingMemoryBound(to: UInt8.self) {
                    poolpoker_on_ble_state_received(ptr, data.count)
                }
            }
        }
    }
}

// -------------------------------------------------------------
// C-ABI 导出供 Rust 调用
// -------------------------------------------------------------

@_cdecl("poolpoker_ble_start_advertising")
public func poolpoker_ble_start_advertising(_ codePtr: UnsafePointer<CChar>, _ namePtr: UnsafePointer<CChar>) {
    let roomCode = String(cString: codePtr)
    let hostName = String(cString: namePtr)
    Task { @MainActor in
        BleMeshController.shared.startAdvertising(roomCode: roomCode, hostName: hostName)
    }
}

@_cdecl("poolpoker_ble_stop_advertising")
public func poolpoker_ble_stop_advertising() {
    Task { @MainActor in
        BleMeshController.shared.stopAdvertising()
    }
}

@_cdecl("poolpoker_ble_start_scanning")
public func poolpoker_ble_start_scanning() {
    Task { @MainActor in
        BleMeshController.shared.startScanning()
    }
}

@_cdecl("poolpoker_ble_stop_scanning")
public func poolpoker_ble_stop_scanning() {
    Task { @MainActor in
        BleMeshController.shared.stopScanning()
    }
}

@_cdecl("poolpoker_ble_connect")
public func poolpoker_ble_connect(_ deviceIdPtr: UnsafePointer<CChar>) {
    let deviceId = String(cString: deviceIdPtr)
    Task { @MainActor in
        BleMeshController.shared.connectPeripheral(identifier: deviceId)
    }
}

@_cdecl("poolpoker_ble_disconnect")
public func poolpoker_ble_disconnect() {
    Task { @MainActor in
        BleMeshController.shared.disconnectPeripheral()
    }
}

@_cdecl("poolpoker_ble_send_command")
public func poolpoker_ble_send_command(_ bytesPtr: UnsafePointer<UInt8>, _ length: Int) {
    let data = Data(bytes: bytesPtr, count: length)
    Task { @MainActor in
        BleMeshController.shared.sendCommand(data: data)
    }
}

@_cdecl("poolpoker_ble_notify_clients")
public func poolpoker_ble_notify_clients(_ bytesPtr: UnsafePointer<UInt8>, _ length: Int, _ targetPeerIdPtr: UnsafePointer<CChar>?) {
    let data = Data(bytes: bytesPtr, count: length)
    let targetPeerId = targetPeerIdPtr.map { String(cString: $0) }
    Task { @MainActor in
        BleMeshController.shared.notifyClients(data: data, targetPeerId: targetPeerId)
    }
}
