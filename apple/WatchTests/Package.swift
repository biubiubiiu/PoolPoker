// swift-tools-version: 5.9
import PackageDescription

// Host-side protocol tests exercise the same transport and generated models as watchOS.
let package = Package(
    name: "PoolPokerWatchCore",
    defaultLocalization: "en",
    platforms: [.macOS(.v13)],
    targets: [
        .target(
            name: "WatchCore",
            path: "WatchCore",
            exclude: ["Shared/Simulator.entitlements"],
            sources: ["Shared", "Localization.swift", "SocketTransport.swift"],
            resources: [.process("Localizable.xcstrings")]
        ),
        .testTarget(
            name: "WatchCoreTests",
            dependencies: ["WatchCore"],
            path: ".",
            exclude: ["WatchCore"],
            sources: ["WatchCoreTests.swift"]
        ),
    ]
)
