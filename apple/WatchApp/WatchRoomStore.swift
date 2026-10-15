import Foundation
import Combine
import WatchKit

@MainActor
final class WatchRoomStore: ObservableObject {
    @Published private(set) var room: Room?
    @Published private(set) var ready = false
    @Published private(set) var pending = false
    @Published var message = WatchStrings.enterCodePrompt
    @Published var serverUrl = UserDefaults.standard.string(forKey: "serverUrl") ?? ""
    @Published var playerName = UserDefaults.standard.string(forKey: "playerName") ?? WatchStrings.defaultPlayerName
    private(set) var userId: String
    private var credential: RoomCredential?
    private var transport: SocketTransport?
    private var retry: Task<Void, Never>?
    private var joinCode: String?
    private var nearbyPosition: DiscoveryPosition?
    private var active = false

    init() {
        userId = UserDefaults.standard.string(forKey: "userId") ?? UUID().uuidString
        UserDefaults.standard.set(userId, forKey: "userId")
        credential = CredentialStore.load()
        if let credential { serverUrl = credential.serverUrl; userId = credential.userId; joinCode = credential.roomCode }
    }

    var hasSession: Bool { joinCode != nil }
    func retryConnection() { connect() }

    var me: Player? { room?.players.first { $0.userId == userId } }
    var currentTurn: String? {
        guard let room, room.turnOrder.indices.contains(room.currentTurnIndex ?? 0) else { return nil }
        return room.turnOrder[room.currentTurnIndex ?? 0]
    }

    func setActive(_ value: Bool) {
        active = value
        if value { if joinCode != nil && !ready { connect() } }
        else { retry?.cancel(); transport?.close(); transport = nil; ready = false; pending = false }
    }

    func join(code: String, position: DiscoveryPosition? = nil) {
        guard code.count == 4, code.allSatisfy({ $0.isASCII && $0.isNumber }),
              SocketTransport.endpoint(serverUrl) != nil, !playerName.trimmingCharacters(in: .whitespaces).isEmpty else {
            message = WatchStrings.fillRequiredFields; return
        }
        if let credential, credential.roomCode != code || credential.serverUrl != serverUrl {
            message = WatchStrings.leaveBeforeNewJoin; return
        }
        joinCode = code
        nearbyPosition = position
        UserDefaults.standard.set(serverUrl, forKey: "serverUrl")
        UserDefaults.standard.set(playerName, forKey: "playerName")
        connect()
    }

    @discardableResult func adopt(_ value: RoomCredential) -> Bool {
        guard value.isValid else { return false }
        if credential == value && joinCode == value.roomCode { return true }
        guard CredentialStore.save(value) else { message = WatchStrings.unlockWatchSaveSession; return false }
        credential = value
        serverUrl = value.serverUrl
        userId = value.userId
        joinCode = value.roomCode
        nearbyPosition = nil
        room = nil
        if active { connect() }
        return true
    }

    func phoneLeft(identity: [String: String]) {
        if let saved = credential, identity["roomCode"] == saved.roomCode,
           identity["serverUrl"] == saved.serverUrl, identity["userId"] == saved.userId { leave(notify: false) }
    }

    private func connect() {
        retry?.cancel()
        transport?.close()
        guard let code = joinCode, active else { return }
        ready = false
        pending = false
        message = WatchStrings.connectingRoom
        let socket = SocketTransport()
        transport = socket
        socket.onConnect = { [weak self, weak socket] in
            guard let self, let socket, self.transport === socket else { return }
            let submit = {
                var payload: [String: Any] = ["roomCode": code, "userId": self.userId]
                let event: String
                if let saved = self.credential {
                    event = "rejoin_room"; payload["sessionToken"] = saved.sessionToken
                } else {
                    event = "join_room"; payload["name"] = self.playerName; payload["avatar"] = "⌚"
                    if self.nearbyPosition != nil { payload["discoverySource"] = "geolocation" }
                }
                socket.emit(event, payload) { [weak self, weak socket] response in
                    guard let self, let socket, self.transport === socket else { return }
                    guard response["success"] as? Bool == true, let token = response["sessionToken"] as? String, !token.isEmpty else {
                        self.message = response["message"] as? String ?? WatchStrings.joinFailed
                        self.ready = false; self.room = nil; socket.close()
                        if response["timeout"] as? Bool == true { self.scheduleRetry() }
                        return
                    }
                    let saved = RoomCredential(serverUrl: self.serverUrl, roomCode: code, userId: self.userId, sessionToken: token)
                    self.credential = saved
                    self.ready = true
                    self.message = CredentialStore.save(saved) ? WatchStrings.connected : WatchStrings.connectedSessionSaveFailed
                    self.nearbyPosition = nil
                    socket.emit("discovery_stop", [:])
                }
            }
            if self.credential == nil, let position = self.nearbyPosition {
                guard let data = try? JSONEncoder().encode(position),
                      let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
                socket.emit("discovery_update", payload) { [weak self, weak socket] response in
                    guard let self, let socket, self.transport === socket else { return }
                    if response["success"] as? Bool == true { submit() }
                    else { self.message = response["message"] as? String ?? WatchStrings.nearbyRoomExpired; socket.close() }
                }
            } else { submit() }
        }
        socket.onEvent = { [weak self, weak socket] event, value in
            guard let self, let socket, self.transport === socket else { return }
            if event == "room_updated" {
                do {
                    let next = try JSONDecoder().decode(Room.self, from: JSONSerialization.data(withJSONObject: value))
                    guard next.code == code, next.players.contains(where: { $0.userId == self.userId }) else { return }
                    if let old = self.room, old.code == next.code, (old.revision ?? 0) > (next.revision ?? 0) { return }
                    let changed = self.room?.revision != next.revision
                    self.room = next
                    if changed { WKInterfaceDevice.current().play(.click) }
                } catch { self.message = WatchStrings.gameDataDecodeError }
            } else if event == "error_message" { self.message = value as? String ?? WatchStrings.operationFailed }
            else if event == "room_kicked", let payload = value as? [String: Any], payload["roomCode"] as? String == code {
                self.leave(notify: false); self.message = WatchStrings.roomKicked
            }
        }
        socket.onDisconnect = { [weak self, weak socket] message in
            guard let self, let socket, self.transport === socket else { return }
            self.ready = false; self.pending = false; self.message = message; self.scheduleRetry()
        }
        socket.connect(server: serverUrl)
    }

    private func scheduleRetry() {
        retry?.cancel()
        guard active else { return }
        retry = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            if !Task.isCancelled { self?.connect() }
        }
    }

    func action(_ event: String, fields: [String: Any] = [:]) {
        guard ready, let socket = transport, socket.connected, let room, room.status == .playing else {
            message = WatchStrings.reconnectingRetry; return
        }
        guard !pending else { return }
        var payload = fields
        payload["roomCode"] = room.code
        pending = true
        socket.emit(event, payload, timeout: 5) { [weak self, weak socket] response in
            guard let self, let socket, self.transport === socket else { return }
            self.pending = false
            self.message = response["success"] as? Bool == true ? WatchStrings.actionRecorded : response["message"] as? String ?? WatchStrings.operationFailed
            if response["timeout"] as? Bool == true { self.connect() }
        }
    }

    func cancelNearbyJoin() {
        guard nearbyPosition != nil && !ready else { return }
        retry?.cancel(); transport?.close(); transport = nil
        joinCode = credential?.roomCode; nearbyPosition = nil
    }

    func leave(notify: Bool = true) {
        if notify, ready, let code = joinCode { transport?.leaveRoom(code) }
        else { transport?.close() }
        retry?.cancel(); transport = nil
        ready = false; pending = false; room = nil; joinCode = nil; credential = nil; nearbyPosition = nil
        CredentialStore.clear()
        userId = UserDefaults.standard.string(forKey: "userId") ?? UUID().uuidString
        message = WatchStrings.leftRoom
    }
}
