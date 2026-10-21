import SwiftUI

@main
struct PoolPokerWatchApp: App {
    @StateObject private var store: WatchRoomStore
    private let receiver: WatchConnectivityReceiver
    @Environment(\.scenePhase) private var scenePhase

    init() {
        let store = WatchRoomStore()
        _store = StateObject(wrappedValue: store)
        receiver = WatchConnectivityReceiver(store: store)
    }

    var body: some Scene {
        WindowGroup {
            WatchRootView().environmentObject(store).tint(.yellow)
                .onChange(of: scenePhase) { _, phase in
                    store.setActive(phase == .active)
                    if phase == .active { receiver.refresh() }
                }
                .onAppear { store.setActive(true); receiver.refresh() }
        }
    }
}

struct WatchRootView: View {
    @EnvironmentObject private var store: WatchRoomStore
    @State private var confirmLeave = false
    var body: some View {
        NavigationStack {
            Group {
                if let room = store.room {
                    ScrollView {
                        VStack(spacing: 12) {
                            Text(WatchStrings.roomTitle(room.code)).font(.headline)
                            if !store.ready { Text(store.message).foregroundStyle(.orange) }
                            switch room.status {
                            case .waiting, .lobby:
                                Text(store.me?.name ?? "").font(.caption)
                                Text(WatchStrings.waitingForHost).foregroundStyle(.yellow)
                                ForEach(room.players, id: \.userId) { Text($0.name) }
                            case .ended, .finished: SettlementView(room: room)
                            case .playing: WatchGameView(room: room)
                            }
                            Text(store.message).font(.caption2).foregroundStyle(.secondary)
                            Button(WatchStrings.leaveRoomButton, role: .destructive) { confirmLeave = true }
                        }.padding(.horizontal, 8)
                    }
                } else { WatchConnectView() }
            }
            .confirmationDialog(WatchStrings.confirmLeaveRoomTitle, isPresented: $confirmLeave) {
                Button(WatchStrings.leaveButton, role: .destructive) { store.leave() }
                Button(WatchStrings.cancelButton, role: .cancel) {}
            }
        }
    }
}
