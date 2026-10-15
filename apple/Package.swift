// swift-tools-version: 5.9
import PackageDescription

// Host-side protocol tests exercise the same transport and generated models as watchOS.
let package = Package(
    name: "PoolPokerWatchCore",
    platforms: [.macOS(.v13)],
    targets: [
        .target(name: "WatchCore", path: ".",
                exclude: ["Shared/Simulator.entitlements", "Sources", "WatchTests", "Assets.xcassets", "WatchApp/Assets.xcassets", "poolpoker_iOS", "poolpoker.xcodeproj", "ExportOptions.plist", "project.yml", "WatchApp/Info.plist", "WatchApp/NearbyRoomsStore.swift", "WatchApp/PoolPokerWatchApp.swift", "WatchApp/SettlementView.swift", "WatchApp/WatchConnectView.swift", "WatchApp/WatchConnectivityReceiver.swift", "WatchApp/WatchGameView.swift", "WatchApp/WatchRoomStore.swift"],
                sources: ["Shared", "WatchApp/Localization.swift", "WatchApp/SocketTransport.swift"],
                resources: [.process("WatchApp/Localizable.xcstrings")]),
        .testTarget(name: "WatchCoreTests", dependencies: ["WatchCore"], path: "WatchTests"),
    ]
)
