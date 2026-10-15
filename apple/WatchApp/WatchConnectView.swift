import SwiftUI

struct WatchConnectView: View {
    @EnvironmentObject private var store: WatchRoomStore
    @State private var code = ""
    @State private var nearby = false
    @State private var clearSession = false
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 3)
    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text(WatchStrings.appName).font(.headline)
                TextField(WatchStrings.serverUrlPlaceholder, text: $store.serverUrl).textContentType(.URL)
                    .autocorrectionDisabled()
                TextField(WatchStrings.playerNamePlaceholder, text: $store.playerName)
                Button(WatchStrings.nearbyJoinButton) { nearby = true }
                Text(code.padding(toLength: 4, withPad: "·", startingAt: 0))
                    .font(.system(size: 28, weight: .bold, design: .monospaced))
                    .accessibilityLabel(WatchStrings.roomCodeAccessibility(code))
                LazyVGrid(columns: columns, spacing: 4) {
                    ForEach(1...9, id: \.self) { digit in digitButton(String(digit)) }
                    Button(WatchStrings.clearButton) { code = "" }.font(.caption)
                    digitButton("0")
                    Button("⌫") { if !code.isEmpty { code.removeLast() } }.accessibilityLabel(WatchStrings.deleteDigitAccessibility)
                }
                Button(WatchStrings.joinRoomButton) { store.join(code: code) }.disabled(code.count != 4)
                if store.hasSession {
                    Button(WatchStrings.retryConnectionButton) { store.retryConnection() }
                    Button(WatchStrings.leaveCurrentRoomButton, role: .destructive) { clearSession = true }
                }
                Text(store.message).font(.caption2).foregroundStyle(.secondary)
                Text(WatchStrings.phoneCompanionSyncHint).font(.caption2).foregroundStyle(.secondary)
            }.padding(.horizontal, 8)
        }
        .confirmationDialog(WatchStrings.leaveCurrentRoomConfirmTitle, isPresented: $clearSession) {
            Button(WatchStrings.leaveButton, role: .destructive) { store.leave() }
            Button(WatchStrings.cancelButton, role: .cancel) {}
        }
        .sheet(isPresented: $nearby) { NearbyRoomsView().environmentObject(store) }
    }
    private func digitButton(_ value: String) -> some View {
        Button(value) { if code.count < 4 { code += value } }.frame(minHeight: 32)
    }
}

struct NearbyRoomsView: View {
    @EnvironmentObject private var store: WatchRoomStore
    @StateObject private var discovery = NearbyRoomsStore()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 8) {
                    Text(discovery.message).font(.caption)
                    ForEach(discovery.rooms, id: \.roomCode) { room in
                        Button {
                            guard let position = discovery.position else { return }
                            discovery.stop()
                            store.join(code: room.roomCode, position: position)
                        } label: {
                            VStack(alignment: .leading) {
                                Text(room.hostName)
                                Text(WatchStrings.nearbyRoomSummary(code: room.roomCode, count: room.playerCount, max: room.maxPlayers)).font(.caption2)
                            }
                        }
                    }
                    Text(store.message).font(.caption2)
                    Button(WatchStrings.nearbyRediscover) { store.cancelNearbyJoin(); discovery.start(server: store.serverUrl) }
                    Button(WatchStrings.backButton) { dismiss() }
                }
            }.navigationTitle(WatchStrings.nearbyTitle)
        }
        .onAppear { discovery.start(server: store.serverUrl) }
        .onDisappear { discovery.stop(); store.cancelNearbyJoin() }
        .onChange(of: store.ready) { _, ready in if ready { dismiss() } }
        .onChange(of: phase) { _, value in
            if value == .active { discovery.start(server: store.serverUrl) }
            else { discovery.stop(); store.cancelNearbyJoin() }
        }
    }
}
