import Foundation

public enum WatchStrings {
    /// Bundle used for localization lookup.
    /// In SPM test / package targets, `Bundle.module` is used if available; otherwise `Bundle.main`.
    public static var bundle: Bundle {
        #if SWIFT_PACKAGE
        return Bundle.module
        #else
        return Bundle.main
        #endif
    }

    /// Helper for looking up a localized string by key with a fallback value.
    public static func localized(_ key: String, default defaultValue: String) -> String {
        bundle.localizedString(forKey: key, value: defaultValue, table: nil)
    }

    /// Helper for looking up a formatted localized string by key with arguments.
    public static func localizedFormat(_ key: String, default defaultValue: String, _ args: CVarArg...) -> String {
        let format = bundle.localizedString(forKey: key, value: defaultValue, table: nil)
        return String(format: format, locale: Locale.current, arguments: args)
    }

    // App & Connection
    public static var appName: String { localized("appName", default: "PoolPoker") }
    public static var directConnectTitle: String { localized("directConnectTitle", default: "PoolPoker") }
    public static var serverUrlPlaceholder: String { localized("serverUrlPlaceholder", default: "Server https://…") }
    public static var playerNamePlaceholder: String { localized("playerNamePlaceholder", default: "Player Name") }
    public static var defaultPlayerName: String { localized("defaultPlayerName", default: "Apple Watch Player") }
    public static var nearbyJoinButton: String { localized("nearbyJoinButton", default: "Join Nearby") }
    public static func roomCodeAccessibility(_ code: String) -> String {
        localizedFormat("roomCodeAccessibility", default: "Room code %@", code)
    }
    public static var clearButton: String { localized("clearButton", default: "Clear") }
    public static var deleteDigitAccessibility: String { localized("deleteDigitAccessibility", default: "Delete a digit") }
    public static var joinRoomButton: String { localized("joinRoomButton", default: "Join Room") }
    public static var retryConnectionButton: String { localized("retryConnectionButton", default: "Retry Connection") }
    public static var leaveCurrentRoomButton: String { localized("leaveCurrentRoomButton", default: "Leave Current Room") }
    public static var leaveCurrentRoomConfirmTitle: String { localized("leaveCurrentRoomConfirmTitle", default: "Leave current room and clear watch session?") }
    public static var leaveButton: String { localized("leaveButton", default: "Leave") }
    public static var cancelButton: String { localized("cancelButton", default: "Cancel") }
    public static var phoneCompanionSyncHint: String { localized("phoneCompanionSyncHint", default: "When joined on iPhone, your identity will sync automatically") }
    public static var enterCodePrompt: String { localized("enterCodePrompt", default: "Enter room code, or join on iPhone") }
    public static var fillRequiredFields: String { localized("fillRequiredFields", default: "Please fill in server address, nickname, and 4-digit room code") }
    public static var leaveBeforeNewJoin: String { localized("leaveBeforeNewJoin", default: "Please leave the current room before joining a new one") }
    public static var unlockWatchSaveSession: String { localized("unlockWatchSaveSession", default: "Cannot save phone session; please unlock watch and retry") }

    // Statuses & Errors
    public static var connectingRoom: String { localized("connectingRoom", default: "Connecting to room…") }
    public static var joinFailed: String { localized("joinFailed", default: "Failed to join room") }
    public static var connected: String { localized("connected", default: "Connected") }
    public static var connectedSessionSaveFailed: String { localized("connectedSessionSaveFailed", default: "Connected, but session save failed; need to rejoin after exit") }
    public static var nearbyRoomExpired: String { localized("nearbyRoomExpired", default: "Nearby room expired; please rediscover") }
    public static var gameDataDecodeError: String { localized("gameDataDecodeError", default: "Failed to read game data; please retry") }
    public static var operationFailed: String { localized("operationFailed", default: "Operation failed") }
    public static var roomKicked: String { localized("roomKicked", default: "You were removed from the room") }
    public static var reconnectingRetry: String { localized("reconnectingRetry", default: "Connection lost. Reconnecting, please retry once connected") }
    public static var actionRecorded: String { localized("actionRecorded", default: "Recorded") }
    public static var leftRoom: String { localized("leftRoom", default: "Left the room") }

    // Socket Transport
    public static var invalidServerUrl: String { localized("invalidServerUrl", default: "Please enter a valid http(s) server address") }
    public static var disconnectedRetry: String { localized("disconnectedRetry", default: "Connection lost, please retry") }
    public static var serverTimeout: String { localized("serverTimeout", default: "Server response timed out; check latest game state and retry") }
    public static var serverClosedConnection: String { localized("serverClosedConnection", default: "Server closed connection") }
    public static var sendFailed: String { localized("sendFailed", default: "Send failed, please retry after reconnecting") }
    public static var heartbeatTimeout: String { localized("heartbeatTimeout", default: "Connection timed out, reconnecting") }

    // Nearby
    public static var nearbyTitle: String { localized("nearbyTitle", default: "Nearby Games") }
    public static var nearbyLocating: String { localized("nearbyLocating", default: "Getting location…") }
    public static var nearbyFillServerFirst: String { localized("nearbyFillServerFirst", default: "Please enter server address first") }
    public static var nearbyPermissionDenied: String { localized("nearbyPermissionDenied", default: "Allow location in Settings, or use room code to join") }
    public static var nearbyPermissionOff: String { localized("nearbyPermissionOff", default: "Location permission disabled; you can use room code to join") }
    public static var nearbyLocatingTimeout: String { localized("nearbyLocatingTimeout", default: "Location timed out; please retry or use room code") }
    public static var nearbyWaitingAccurate: String { localized("nearbyWaitingAccurate", default: "Waiting for a more accurate location…") }
    public static var nearbyLocationFailed: String { localized("nearbyLocationFailed", default: "Cannot get location; please retry or use room code") }
    public static var nearbyEmpty: String { localized("nearbyEmpty", default: "No nearby games; wait for host to enable discovery") }
    public static var nearbyChooseGame: String { localized("nearbyChooseGame", default: "Select a game to join") }
    public static var nearbyDiscoveryFailed: String { localized("nearbyDiscoveryFailed", default: "Discovery failed, please retry") }
    public static var nearbyNoAvailable: String { localized("nearbyNoAvailable", default: "No games available nearby") }
    public static var nearbyListDecodeError: String { localized("nearbyListDecodeError", default: "Failed to read room list, please retry") }
    public static var nearbyNetworkFailed: String { localized("nearbyNetworkFailed", default: "Network connection failed, please retry") }
    public static var nearbySearching: String { localized("nearbySearching", default: "Finding nearby games…") }
    public static var nearbyRediscover: String { localized("nearbyRediscover", default: "Rediscover") }
    public static var backButton: String { localized("backButton", default: "Back") }
    public static func nearbyRoomSummary(code: String, count: Int, max: Int) -> String {
        localizedFormat("nearbyRoomSummary", default: "Room %@ · %lld/%lld players", code, count, max)
    }

    // Root View & Waiting
    public static func roomTitle(_ code: String) -> String {
        localizedFormat("roomTitle", default: "Room %@", code)
    }
    public static var waitingForHost: String { localized("waitingForHost", default: "Waiting for host to start...") }
    public static var leaveRoomButton: String { localized("leaveRoomButton", default: "Leave Room") }
    public static var confirmLeaveRoomTitle: String { localized("confirmLeaveRoomTitle", default: "Are you sure you want to leave the room?") }

    // Game View
    public static func turnOrderPrefix(_ order: String) -> String {
        localizedFormat("turnOrderPrefix", default: "🎯 Order: %@", order)
    }
    public static var allCardsClearedOrFree: String { localized("allCardsClearedOrFree", default: "Hand cleared or free") }
    public static var cardPocketed: String { localized("cardPocketed", default: "Pocketed") }
    public static var cardTapToClear: String { localized("cardTapToClear", default: "Tap to Clear") }
    public static func ballBadgeAccessibility(_ num: Int) -> String {
        localizedFormat("ballBadgeAccessibility", default: "Ball %lld", num)
    }
    public static var recordPocketButton: String { localized("recordPocketButton", default: "Record Pocket") }
    public static var recordFoulButton: String { localized("recordFoulButton", default: "Record Foul") }
    public static var retractLastActionButton: String { localized("retractLastActionButton", default: "Undo Last Action") }
    public static var recordPocketTitle: String { localized("recordPocketTitle", default: "Record Pocket") }
    public static var pocketTargetPicker: String { localized("pocketTargetPicker", default: "Scored Player") }
    public static var selectPocketPlayer: String { localized("selectPocketPlayer", default: "Select Scored Player:") }
    public static var selectBallNumber: String { localized("selectBallNumber", default: "Tap Pocketed Ball (1-15):") }
    public static var breakPocketOption: String { localized("breakPocketOption", default: "Break Shot") }
    public static var selectFoulPlayerTitle: String { localized("selectFoulPlayerTitle", default: "Select Fouled Player") }
    public static var retractConfirmTitle: String { localized("retractConfirmTitle", default: "Confirm Undo") }
    public static var noRetractAction: String { localized("noRetractAction", default: "No operation to undo") }
    public static func confirmRetractAction(_ text: String) -> String {
        localizedFormat("confirmRetractAction", default: "Confirm undo: %@", text)
    }
    public static var confirmRetractButton: String { localized("confirmRetractButton", default: "Confirm Undo") }

    // Settlement
    public static var gameOverTitle: String { localized("gameOverTitle", default: "Game Over") }
    public static var winnerSuffix: String { localized("winnerSuffix", default: " · Winner") }
    public static func roundScoreDeltaTotal(delta: Int, total: Int) -> String {
        let prefix = delta >= 0 ? "+" : ""
        return localizedFormat("roundScoreDeltaTotal", default: "Round %@ · Total %lld", "\(prefix)\(delta)", total)
    }
    public static func totalScoreOnly(total: Int) -> String {
        localizedFormat("totalScoreOnly", default: "Total %lld", total)
    }
    public static var categoryCleared: String { localized("categoryCleared", default: "Cleared") }
    public static var categoryFree: String { localized("categoryFree", default: "Free") }
    public static var categoryRemaining: String { localized("categoryRemaining", default: "Remaining") }
    public static func remainingCardDetail(suit: String, rank: String, ballNumber: Int, penalty: Int) -> String {
        localizedFormat("remainingCardDetail", default: "%@%@ · Ball %lld · -%lld", suit, rank, ballNumber, penalty)
    }
}
