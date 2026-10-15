import Foundation
import WatchConnectivity

@MainActor
final class WatchConnectivityReceiver: NSObject, WCSessionDelegate {
    private let store: WatchRoomStore
    init(store: WatchRoomStore) {
        self.store = store
        super.init()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    private func receive(_ context: [String: Any]) {
        let updatedAt = context["updatedAt"] as? Double ?? 0
        guard updatedAt.isFinite, updatedAt > UserDefaults.standard.double(forKey: "phoneContextUpdatedAt") else { return }
        if let data = context["credential"] as? Data,
           let value = try? JSONDecoder().decode(RoomCredential.self, from: data) {
            guard store.adopt(value) else { return }
        }
        else if let identity = context["leftRoom"] as? [String: String] { store.phoneLeft(identity: identity) }
        else { return }
        UserDefaults.standard.set(updatedAt, forKey: "phoneContextUpdatedAt")
    }

    func refresh() {
        let session = WCSession.default
        guard session.activationState == .activated, session.isReachable else { return }
        session.sendMessage(["request": "room_credentials"], replyHandler: { [weak self] value in
            Task { @MainActor in self?.receive(value) }
        }, errorHandler: { _ in })
    }

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in self.receive(session.receivedApplicationContext); self.refresh() }
    }
    nonisolated func sessionReachabilityDidChange(_ session: WCSession) { Task { @MainActor in self.refresh() } }
    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in self.receive(applicationContext) }
    }
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in self.receive(message) }
    }
}
