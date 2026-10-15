import Foundation
import Security

/// Local session metadata; wire models remain generated from shared/schemas.
struct RoomCredential: Codable, Equatable {
    var serverUrl: String
    var roomCode: String
    var userId: String
    var sessionToken: String

    var isValid: Bool {
        guard let url = URLComponents(string: serverUrl) else { return false }
        return ["http", "https"].contains(url.scheme ?? "") && url.host?.isEmpty == false
            && roomCode.count == 4 && roomCode.allSatisfy({ $0.isASCII && $0.isNumber })
            && !userId.isEmpty && !sessionToken.isEmpty
    }
}

enum CredentialStore {
    private static var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: (Bundle.main.bundleIdentifier ?? "com.poolpoker") + ".watch-session",
         kSecAttrAccount as String: "room"]
    }
    static func load() -> RoomCredential? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let credential = try? JSONDecoder().decode(RoomCredential.self, from: data), credential.isValid else { return nil }
        return credential
    }
    @discardableResult static func save(_ value: RoomCredential) -> Bool {
        guard value.isValid, let data = try? JSONEncoder().encode(value) else { return false }
        let update = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecSuccess { return true }
        guard status == errSecItemNotFound else { return false }
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }
    static func clear() { SecItemDelete(query as CFDictionary) }
}
