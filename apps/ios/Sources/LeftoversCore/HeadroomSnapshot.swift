import Foundation

/// Lightweight headroom snapshot that gets stored in the App Group container
/// so the home-screen widget can render the latest number without a network
/// round-trip from a process that doesn't share the main app's session.
///
/// Written by the main app every time the user pulls-to-refresh on home (or
/// any time we successfully load /api/headroom). Read by the widget from the
/// same App Group on every TimelineProvider tick.
public struct HeadroomSnapshot: Codable, Equatable {
    public let asOf: Date
    public let headroomCents: Int64
    public let spentDiscretionaryCents: Int64
    public let spentTodayCents: Int64
    /// Average daily spend pace going forward = headroom / daysRemaining.
    /// Use for the "Daily pace" widget mode.
    public let dailyBurnCents: Int64
    /// Per-day envelope = (forecast_income − forecast_fixed) ÷ days_in_month.
    /// This is fixed for the whole period — it does NOT shrink as the user
    /// spends. The "Today" widget mode uses (allowance − spentToday)
    /// clamped to 0 so a single day's overspend doesn't silently re-pace
    /// the rest of the month.
    public let dailyAllowanceCents: Int64
    public let daysRemaining: Int
    public let forecastIncomeCents: Int64
    public let forecastFixedCents: Int64
    public let periodEnd: Date

    public init(
        asOf: Date,
        headroomCents: Int64,
        spentDiscretionaryCents: Int64,
        spentTodayCents: Int64,
        dailyBurnCents: Int64,
        dailyAllowanceCents: Int64,
        daysRemaining: Int,
        forecastIncomeCents: Int64,
        forecastFixedCents: Int64,
        periodEnd: Date
    ) {
        self.asOf = asOf
        self.headroomCents = headroomCents
        self.spentDiscretionaryCents = spentDiscretionaryCents
        self.spentTodayCents = spentTodayCents
        self.dailyBurnCents = dailyBurnCents
        self.dailyAllowanceCents = dailyAllowanceCents
        self.daysRemaining = daysRemaining
        self.forecastIncomeCents = forecastIncomeCents
        self.forecastFixedCents = forecastFixedCents
        self.periodEnd = periodEnd
    }

    /// What's left in TODAY's daily envelope after today's spend. Clamped
    /// at 0 — once today's bucket is empty, additional spend reduces the
    /// monthly headroom (visible in the Month mode) but doesn't go more
    /// negative on the per-day display.
    public var leftTodayCents: Int64 {
        max(0, dailyAllowanceCents - spentTodayCents)
    }

    /// True if the user has spent more than today's envelope. Useful for
    /// rendering the Today widget in red.
    public var todayOverBy: Int64 {
        max(0, spentTodayCents - dailyAllowanceCents)
    }
}

public enum HeadroomSnapshotStore {
    public static let appGroupId = "group.com.brodiemcgee.leftovers"
    private static let key = "headroom.snapshot.v1"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    public static func write(_ snapshot: HeadroomSnapshot) {
        guard let d = defaults else { return }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if let data = try? encoder.encode(snapshot) {
            d.set(data, forKey: key)
        }
    }

    public static func read() -> HeadroomSnapshot? {
        guard let d = defaults, let data = d.data(forKey: key) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(HeadroomSnapshot.self, from: data)
    }
}
