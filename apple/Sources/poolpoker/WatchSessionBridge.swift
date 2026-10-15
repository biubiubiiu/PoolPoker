import Foundation
import WatchConnectivity

/// Tauri's existing sync_wear_state command forwards room credentials here on iOS.
@MainActor
final class PhoneWatchSession: NSObject, WCSessionDelegate {
    static let shared = PhoneWatchSession()
    private var context: [String: Any] = [:]

    func start() {
        guard WCSession.isSupported() else { return }
        if let saved = CredentialStore.load(), let data = try? JSONEncoder().encode(saved) { context = ["credential": data] }
        else if let identity = UserDefaults.standard.dictionary(forKey: "watchLeftRoom") { context = ["leftRoom": identity] }
        context["updatedAt"] = Date().timeIntervalSince1970
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func accept(_ data: Data) {
        guard let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
        if payload["event"] as? String == "room_credentials",
           let server = payload["serverUrl"] as? String,
           let code = payload["roomCode"] as? String,
           let user = payload["userId"] as? String,
           let token = payload["sessionToken"] as? String {
            let value = RoomCredential(serverUrl: server, roomCode: code, userId: user, sessionToken: token)
            guard value.isValid, CredentialStore.save(value), let encoded = try? JSONEncoder().encode(value) else { return }
            context = ["credential": encoded]
            UserDefaults.standard.removeObject(forKey: "watchLeftRoom")
        } else if payload["event"] as? String == "leave_room" {
            guard let saved = CredentialStore.load() else { return }
            let identity = ["roomCode": saved.roomCode, "serverUrl": saved.serverUrl, "userId": saved.userId]
            context = ["leftRoom": identity]
            UserDefaults.standard.set(identity, forKey: "watchLeftRoom")
            CredentialStore.clear()
        } else { return }
        context["updatedAt"] = Date().timeIntervalSince1970
        publish()
    }

    private func publish() {
        let session = WCSession.default
        guard session.activationState == .activated, !context.isEmpty else { return }
        do { try session.updateApplicationContext(context) }
        catch { return } // Retain the latest context for activation/reachability retry.
        if session.isReachable { session.sendMessage(context, replyHandler: nil, errorHandler: nil) }
    }

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in self.publish() }
    }
    nonisolated func sessionReachabilityDidChange(_ session: WCSession) { Task { @MainActor in self.publish() } }
    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}
    nonisolated func sessionDidDeactivate(_ session: WCSession) { session.activate() }
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        Task { @MainActor in replyHandler(self.context) }
    }
}

@_cdecl("poolpoker_watch_start")
public func poolpokerWatchStart() {
    DispatchQueue.main.async { PhoneWatchSession.shared.start() }
}

@_cdecl("poolpoker_watch_sync")
public func poolpokerWatchSync(_ bytes: UnsafePointer<UInt8>, _ length: Int) {
    let data = Data(bytes: bytes, count: length)
    DispatchQueue.main.async { PhoneWatchSession.shared.accept(data) }
}
