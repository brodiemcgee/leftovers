import Foundation

/// Tiny shared store that lets the widget extension and the BGAppRefreshTask
/// handler call `/api/headroom` on their own — without ever opening the
/// main app. Only holds what's required:
///
///   • access token (Supabase JWT)
///   • access token expiry timestamp
///   • API base URL
///
/// Lives in the App Group container so both the main app and the widget
/// extension see the same values. iOS Data Protection encrypts App Group
/// storage at rest, scoped to the device user.
public struct SharedAuth: Codable, Equatable {
    public let accessToken: String
    public let expiresAt: Date
    public let apiBaseURL: String

    public init(accessToken: String, expiresAt: Date, apiBaseURL: String) {
        self.accessToken = accessToken
        self.expiresAt = expiresAt
        self.apiBaseURL = apiBaseURL
    }

    /// True if the token is still valid for at least the next 60 seconds.
    /// We keep that buffer so we don't hand a soon-to-expire token to the
    /// widget which may be in the middle of a network call.
    public var isUsable: Bool {
        expiresAt.timeIntervalSinceNow > 60
    }
}

public enum SharedAuthStore {
    public static let appGroupId = "group.com.brodiemcgee.leftovers"
    private static let key = "auth.shared.v1"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    public static func write(_ auth: SharedAuth) {
        guard let d = defaults else { return }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if let data = try? encoder.encode(auth) {
            d.set(data, forKey: key)
        }
    }

    public static func read() -> SharedAuth? {
        guard let d = defaults, let data = d.data(forKey: key) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(SharedAuth.self, from: data)
    }

    public static func clear() {
        defaults?.removeObject(forKey: key)
    }
}
