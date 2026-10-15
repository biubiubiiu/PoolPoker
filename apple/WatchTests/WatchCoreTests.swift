import XCTest
@testable import WatchCore

final class WatchCoreTests: XCTestCase {
    func testGeneratedWireEnumsDecodeActualSchemaValues() throws {
        let json = #"{"id":"joker","ballNumber":15,"suit":"🃏","rank":"大王","color":"gold","suitType":"joker-big"}"#
        let card = try JSONDecoder().decode(Card.self, from: Data(json.utf8))
        XCTAssertEqual(card.suitType, .jokerBig)
        let action = WearActionPayload(action: .refereePocketBall, ballNumber: 15, cardId: nil, roomCode: "1234", targetUserId: "u")
        let value = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(action)) as? [String: Any])
        XCTAssertEqual(value["action"] as? String, "REFEREE_POCKET_BALL")
        XCTAssertEqual(value["targetUserId"] as? String, "u")
    }

    func testCredentialRejectsMissingTokenAndNonASCIICode() {
        XCTAssertFalse(RoomCredential(serverUrl: "https://example.com", roomCode: "１２３４", userId: "u", sessionToken: "token").isValid)
        XCTAssertFalse(RoomCredential(serverUrl: "https://example.com", roomCode: "1234", userId: "u", sessionToken: "").isValid)
    }

    @MainActor func testTransportDoesNotQueueDisconnectedActions() {
        let socket = SocketTransport()
        var rejected = false
        socket.emit("pocket_ball", ["cardId": "c"]) { response in rejected = response["success"] as? Bool == false }
        XCTAssertTrue(rejected)
        XCTAssertNil(SocketTransport.endpoint("file:///tmp/server"))
        XCTAssertEqual(SocketTransport.endpoint("https://example.com:3000")?.absoluteString,
                       "https://example.com:3000/socket.io/?EIO=4&transport=polling")
    }

    func testLocalizationAndAppName() {
        XCTAssertEqual(WatchStrings.appName, "PoolPoker")
        XCTAssertEqual(WatchStrings.directConnectTitle, "PoolPoker")
        XCTAssertFalse(WatchStrings.recordPocketButton.isEmpty)
        XCTAssertFalse(WatchStrings.recordFoulButton.isEmpty)
        XCTAssertFalse(WatchStrings.retractLastActionButton.isEmpty)
        XCTAssertEqual(WatchStrings.ballBadgeAccessibility(8), "\(8) 号球" == WatchStrings.ballBadgeAccessibility(8) || "8 號球" == WatchStrings.ballBadgeAccessibility(8) ? WatchStrings.ballBadgeAccessibility(8) : "Ball 8")
        XCTAssertTrue(WatchStrings.turnOrderPrefix("A → B").contains("A → B"))
    }

    @MainActor func testBackendSessionGameplayAndPrivacy() async throws {
        guard let server = ProcessInfo.processInfo.environment["POOLPOKER_WATCH_TEST_SERVER"] else {
            throw XCTSkip("Run node scripts/test-watch.mjs for the live backend integration test")
        }
        let host = SocketTransport(), watch = SocketTransport(), restored = SocketTransport()
        defer { host.close(); watch.close(); restored.close() }
        try await connect(host, server: server)
        let hostId = UUID().uuidString, watchId = UUID().uuidString
        let created = await emit(host, "create_room", ["userId": hostId, "name": "Host", "avatar": "🎱"])
        XCTAssertEqual(created["success"] as? Bool, true)
        let code = try XCTUnwrap(created["roomCode"] as? String)
        try await connect(watch, server: server)
        let position: [String: Any] = ["latitude": 31.2, "longitude": 121.5, "accuracy": 20,
                                       "timestamp": Date().timeIntervalSince1970 * 1000, "mode": "advertise"]
        let advertised = await emit(host, "discovery_update", position)
        XCTAssertEqual(advertised["success"] as? Bool, true)
        var nearby: [NearbyRoom] = []
        var snapshot: Room?
        var decodeError: Error?
        watch.onEvent = { event, value in
            if event == "nearby_rooms", let data = try? JSONSerialization.data(withJSONObject: value) {
                nearby = (try? JSONDecoder().decode([NearbyRoom].self, from: data)) ?? []
            }
            if event == "room_updated" {
                do { snapshot = try JSONDecoder().decode(Room.self, from: JSONSerialization.data(withJSONObject: value)) }
                catch { decodeError = error }
            }
        }
        var browsing = position
        browsing["mode"] = "browse"
        let discovered = await emit(watch, "discovery_update", browsing)
        XCTAssertEqual(discovered["success"] as? Bool, true)
        try await wait { nearby.contains { $0.roomCode == code } }
        let joined = await emit(watch, "join_room", ["roomCode": code, "userId": watchId, "name": "Watch", "avatar": "⌚", "discoverySource": "geolocation"])
        XCTAssertEqual(joined["success"] as? Bool, true)
        let token = try XCTUnwrap(joined["sessionToken"] as? String)
        host.emit("start_game", ["roomCode": code])
        try await wait { snapshot?.status == .playing || decodeError != nil }
        XCTAssertNil(decodeError)
        let room = try XCTUnwrap(snapshot)
        XCTAssertTrue(try XCTUnwrap(room.players.first { $0.userId == hostId }).cards.isEmpty)
        let me = try XCTUnwrap(room.players.first { $0.userId == watchId })
        XCTAssertFalse(me.cards.isEmpty)
        let ball = try XCTUnwrap(me.cards.first).ballNumber
        let result = await emit(watch, "referee_pocket_ball", ["roomCode": code, "targetUserId": watchId, "ballNumber": ball])
        XCTAssertEqual(result["success"] as? Bool, true)
        try await wait { snapshot?.pocketedBallNumbers.contains(ball) == true }
        let revision = try XCTUnwrap(snapshot?.revision)
        let foul = await emit(watch, "referee_draw_penalty", ["roomCode": code, "targetUserId": hostId])
        XCTAssertEqual(foul["success"] as? Bool, true)
        let staleUndo = await emit(watch, "retract_ball", ["roomCode": code, "expectedRevision": revision])
        XCTAssertEqual(staleUndo["success"] as? Bool, false)
        let current = try XCTUnwrap(snapshot?.revision)
        let undo = await emit(watch, "retract_ball", ["roomCode": code, "expectedRevision": current])
        XCTAssertEqual(undo["success"] as? Bool, true)
        // Same user can restore on a second socket; a wrong token must remain rejected.
        try await connect(restored, server: server)
        let rejected = await emit(restored, "rejoin_room", ["roomCode": code, "userId": watchId, "sessionToken": "invalid"])
        XCTAssertEqual(rejected["success"] as? Bool, false)
        let rejoined = await emit(restored, "rejoin_room", ["roomCode": code, "userId": watchId, "sessionToken": token])
        XCTAssertEqual(rejoined["success"] as? Bool, true)
        // Survive several real Engine.IO heartbeat intervals, then still receive an ACK.
        try await Task.sleep(nanoseconds: 700_000_000)
        XCTAssertTrue(restored.connected)
        let again = await emit(restored, "rejoin_room", ["roomCode": code, "userId": watchId, "sessionToken": token])
        XCTAssertEqual(again["success"] as? Bool, true)
        let ownCard = try XCTUnwrap(snapshot?.players.first { $0.userId == watchId }?.cards.first { card in
            snapshot?.pocketedBallNumbers.contains(card.ballNumber) == false
        })
        let pocket = await emit(restored, "pocket_ball", ["roomCode": code, "cardId": ownCard.id])
        XCTAssertEqual(pocket["success"] as? Bool, true)
        restored.leaveRoom(code)
        try await wait { !restored.connected }
    }

    @MainActor private func connect(_ socket: SocketTransport, server: String) async throws {
        socket.connect(server: server)
        try await wait { socket.connected }
    }
    @MainActor private func emit(_ socket: SocketTransport, _ event: String, _ payload: [String: Any]) async -> [String: Any] {
        await withCheckedContinuation { continuation in
            socket.emit(event, payload, timeout: 3) { continuation.resume(returning: $0) }
        }
    }
    @MainActor private func wait(_ predicate: () -> Bool) async throws {
        let deadline = Date().addingTimeInterval(5)
        while !predicate() {
            if Date() > deadline { throw NSError(domain: "WatchTestTimeout", code: 1) }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
    }
}
