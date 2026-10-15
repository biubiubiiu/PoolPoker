import Foundation

/// PoolPoker uses only JSON events in the default Socket.IO namespace over Engine.IO v4 HTTP polling.
/// No action is buffered or replayed across connections. All callbacks run on the main actor.
@MainActor
final class SocketTransport {
    var onConnect: (() -> Void)?
    var onEvent: ((String, Any) -> Void)?
    var onDisconnect: ((String) -> Void)?
    private var sessionId: String?
    private var generation = 0
    private var server = ""
    private var sendTask: Task<Void, Never>?
    private var outgoing: [String] = []
    private var receiveTask: Task<Void, Never>?
    private var heartbeat: Task<Void, Never>?
    private var acknowledgements: [Int: (Task<Void, Never>, ([String: Any]) -> Void)] = [:]
    private var sequence = 0
    private var heartbeatSeconds = 45.0
    private(set) var connected = false

    static func endpoint(_ server: String, sessionId: String? = nil) -> URL? {
        guard var parts = URLComponents(string: server),
              ["http", "https"].contains(parts.scheme?.lowercased() ?? ""),
              parts.host?.isEmpty == false, parts.user == nil, parts.password == nil else { return nil }
        parts.path = "/socket.io/"
        parts.queryItems = [URLQueryItem(name: "EIO", value: "4"), URLQueryItem(name: "transport", value: "polling")]
        if let sessionId { parts.queryItems?.append(URLQueryItem(name: "sid", value: sessionId)) }
        parts.fragment = nil
        return parts.url
    }

    func connect(server: String) {
        close()
        guard Self.endpoint(server) != nil else { onDisconnect?(WatchStrings.invalidServerUrl); return }
        self.server = server
        let current = generation
        armHeartbeat(seconds: 15)
        receiveTask = Task { [weak self] in
            do {
                while !Task.isCancelled {
                    guard let self, self.generation == current,
                          let url = Self.endpoint(server, sessionId: self.sessionId) else { return }
                    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
                    request.timeoutInterval = max(30, self.heartbeatSeconds + 5)
                    let (data, response) = try await URLSession.shared.data(for: request)
                    guard self.generation == current else { return }
                    guard (response as? HTTPURLResponse)?.statusCode == 200,
                          let text = String(data: data, encoding: .utf8) else {
                        self.fail(WatchStrings.disconnectedRetry); return
                    }
                    for packet in text.split(separator: "\u{1e}") {
                        guard self.generation == current else { return }
                        self.receive(String(packet))
                    }
                }
            } catch {
                guard let self, self.generation == current else { return }
                self.fail(WatchStrings.disconnectedRetry)
            }
        }
    }

    func emit(_ event: String, _ payload: [String: Any], timeout: Double = 15,
              completion: (([String: Any]) -> Void)? = nil) {
        guard connected else { completion?(["success": false, "message": WatchStrings.reconnectingRetry]); return }
        sequence += 1
        let id = sequence
        if let completion {
            let timer = Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                guard !Task.isCancelled, let entry = self?.acknowledgements.removeValue(forKey: id) else { return }
                entry.1(["success": false, "timeout": true, "message": WatchStrings.serverTimeout])
            }
            acknowledgements[id] = (timer, completion)
        }
        guard let data = try? JSONSerialization.data(withJSONObject: [event, payload]),
              let json = String(data: data, encoding: .utf8) else { return }
        send("42\(completion == nil ? "" : String(id))\(json)")
    }

    private func receive(_ packet: String) {
        if packet.hasPrefix("0") {
            if let data = packet.dropFirst().data(using: .utf8),
               let info = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
               let interval = info["pingInterval"] as? Double, let timeout = info["pingTimeout"] as? Double,
               let sid = info["sid"] as? String {
                sessionId = sid
                heartbeatSeconds = (interval + timeout) / 1000
            }
            armHeartbeat(seconds: heartbeatSeconds)
            send("40")
        } else if packet.hasPrefix("2") {
            armHeartbeat(seconds: heartbeatSeconds)
            send("3" + packet.dropFirst())
        } else if packet.hasPrefix("40") {
            connected = true
            onConnect?()
        } else if packet.hasPrefix("42"), let start = packet.firstIndex(of: "["),
                  let data = String(packet[start...]).data(using: .utf8),
                  let values = (try? JSONSerialization.jsonObject(with: data)) as? [Any],
                  let event = values.first as? String, values.count > 1 {
            onEvent?(event, values[1])
        } else if packet.hasPrefix("43"), let start = packet.firstIndex(of: "["),
                  let id = Int(packet[packet.index(packet.startIndex, offsetBy: 2)..<start]),
                  let data = String(packet[start...]).data(using: .utf8),
                  let values = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]],
                  let response = values.first, let pending = acknowledgements.removeValue(forKey: id) {
            pending.0.cancel()
            pending.1(response)
        } else if packet == "1" || packet.hasPrefix("41") || packet.hasPrefix("44") {
            fail(WatchStrings.serverClosedConnection)
        }
    }

    private func send(_ packet: String) {
        guard sessionId != nil else { return }
        outgoing.append(packet)
        guard sendTask == nil else { return }
        let current = generation
        sendTask = Task { [weak self] in
            guard let self else { return }
            do {
                while self.generation == current && !Task.isCancelled && !self.outgoing.isEmpty {
                    guard let url = Self.endpoint(self.server, sessionId: self.sessionId) else { return }
                    let packets = self.outgoing.joined(separator: "\u{1e}")
                    self.outgoing.removeAll()
                    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
                    request.httpMethod = "POST"
                    request.setValue("text/plain;charset=UTF-8", forHTTPHeaderField: "Content-Type")
                    request.httpBody = Data(packets.utf8)
                    request.timeoutInterval = 15
                    let (_, response) = try await URLSession.shared.data(for: request)
                    guard self.generation == current else { return }
                    guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                        self.fail(WatchStrings.sendFailed); return
                    }
                }
                if self.generation == current { self.sendTask = nil }
            } catch {
                if self.generation == current { self.fail(WatchStrings.sendFailed) }
            }
        }
    }

    /// Flush a deliberate leave before closing; routine disconnects never replay actions.
    func leaveRoom(_ code: String) {
        emit("leave_room", ["roomCode": code])
        let flushing = sendTask
        Task { [self] in
            await flushing?.value
            close()
        }
    }

    private func armHeartbeat(seconds: Double) {
        heartbeat?.cancel()
        heartbeat = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            if !Task.isCancelled { self?.fail(WatchStrings.heartbeatTimeout) }
        }
    }

    private func fail(_ message: String) {
        close()
        onDisconnect?(message)
    }

    func close() {
        connected = false
        receiveTask?.cancel()
        heartbeat?.cancel()
        generation += 1
        sessionId = nil
        sendTask?.cancel()
        sendTask = nil
        outgoing.removeAll()
        for entry in acknowledgements.values { entry.0.cancel() }
        acknowledgements.removeAll()
    }
}
