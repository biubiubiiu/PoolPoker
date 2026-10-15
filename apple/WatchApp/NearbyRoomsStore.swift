import Foundation
import Combine
import CoreLocation

@MainActor
final class NearbyRoomsStore: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
    @Published private(set) var rooms: [NearbyRoom] = []
    @Published private(set) var message = WatchStrings.nearbyLocating
    private let location = CLLocationManager()
    private var socket: SocketTransport?
    private var deadline: Task<Void, Never>?
    private var expiry: Task<Void, Never>?
    private(set) var position: DiscoveryPosition?
    private var server = ""
    private var running = false

    override init() { super.init(); location.delegate = self; location.desiredAccuracy = kCLLocationAccuracyHundredMeters }

    func start(server: String) {
        stop()
        self.server = server
        guard SocketTransport.endpoint(server) != nil else { message = WatchStrings.nearbyFillServerFirst; return }
        running = true
        switch location.authorizationStatus {
        case .notDetermined: location.requestWhenInUseAuthorization()
        case .denied, .restricted: message = WatchStrings.nearbyPermissionDenied
        default: locate()
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard running else { return }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways: locate()
        case .denied, .restricted: message = WatchStrings.nearbyPermissionOff
        default: break
        }
    }

    private func locate() {
        guard running else { return }
        message = WatchStrings.nearbyLocating
        deadline?.cancel()
        location.startUpdatingLocation()
        deadline = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 30_000_000_000)
            guard !Task.isCancelled, let self else { return }
            self.location.stopUpdatingLocation()
            self.message = WatchStrings.nearbyLocatingTimeout
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard running, position == nil else { return }
        guard let sample = locations.reversed().first(where: {
            $0.horizontalAccuracy >= 0 && $0.horizontalAccuracy <= 300
                && Date().timeIntervalSince($0.timestamp) >= -5 && Date().timeIntervalSince($0.timestamp) < 60
        }) else { message = WatchStrings.nearbyWaitingAccurate; return }
        position = DiscoveryPosition(accuracy: sample.horizontalAccuracy, latitude: sample.coordinate.latitude,
                                     longitude: sample.coordinate.longitude, mode: .browse,
                                     timestamp: sample.timestamp.timeIntervalSince1970 * 1000)
        deadline?.cancel()
        location.stopUpdatingLocation()
        browse()
        expiry = Task { [weak self] in
            let remaining = max(0, 60 - Date().timeIntervalSince(sample.timestamp))
            try? await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000))
            guard !Task.isCancelled, let self, self.running else { return }
            self.start(server: self.server)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard running, position == nil else { return }
        if (error as? CLError)?.code == .locationUnknown { return }
        location.stopUpdatingLocation(); deadline?.cancel()
        message = WatchStrings.nearbyLocationFailed
    }

    private func browse() {
        socket?.close()
        let active = SocketTransport()
        socket = active
        active.onConnect = { [weak self, weak active] in
            guard let self, let active, self.socket === active, let position = self.position,
                  let data = try? JSONEncoder().encode(position),
                  let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
            active.emit("discovery_update", payload) { [weak self, weak active] response in
                guard let self, let active, self.socket === active else { return }
                self.message = response["success"] as? Bool == true
                    ? (self.rooms.isEmpty ? WatchStrings.nearbyEmpty : WatchStrings.nearbyChooseGame)
                    : response["message"] as? String ?? WatchStrings.nearbyDiscoveryFailed
            }
        }
        active.onEvent = { [weak self, weak active] event, value in
            guard let self, let active, self.socket === active, event == "nearby_rooms" else { return }
            do {
                self.rooms = try JSONDecoder().decode([NearbyRoom].self, from: JSONSerialization.data(withJSONObject: value))
                self.message = self.rooms.isEmpty ? WatchStrings.nearbyNoAvailable : WatchStrings.nearbyChooseGame
            } catch { self.message = WatchStrings.nearbyListDecodeError }
        }
        active.onDisconnect = { [weak self] _ in self?.rooms = []; self?.message = WatchStrings.nearbyNetworkFailed }
        message = WatchStrings.nearbySearching
        active.connect(server: server)
    }

    func stop() {
        running = false
        deadline?.cancel(); expiry?.cancel(); location.stopUpdatingLocation()
        socket?.emit("discovery_stop", [:]); socket?.close(); socket = nil
        position = nil; rooms = []
    }
}
