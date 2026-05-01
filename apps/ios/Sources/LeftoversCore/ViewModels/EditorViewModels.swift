import Foundation

@MainActor
public final class PayCycleEditorViewModel: ObservableObject {
    @Published public var payerName: String = ""
    @Published public var cadence: Cadence = .fortnightly
    @Published public var anchorDate: Date = Date()
    @Published public var amountString: String = ""
    @Published public private(set) var error: String?
    @Published public private(set) var savedAt: Date?
    private var existingId: String?

    public init() {}

    public func load() async {
        struct Snapshot: Decodable {
            struct Cycle: Decodable {
                let id: String
                let payerName: String
                let cadence: Cadence
                let anchorDate: String
                let amountEstimateCents: Int64
            }
            let payCycles: [Cycle]
        }
        do {
            let s: Snapshot = try await APIClient.shared.get("/api/settings")
            if let primary = s.payCycles.first {
                existingId = primary.id
                payerName = primary.payerName
                cadence = primary.cadence
                amountString = String(format: "%.2f", Double(primary.amountEstimateCents) / 100.0)
                if let d = ISO8601DateFormatter().date(from: primary.anchorDate + "T00:00:00Z") {
                    anchorDate = d
                }
            }
        } catch {
            self.error = (error as NSError).localizedDescription
        }
    }

    public func save() async {
        error = nil
        guard let cents = Self.parseAmountToCents(amountString), cents >= 0 else {
            error = "Enter a valid dollar amount, e.g. 3777.29"
            return
        }
        struct Body: Encodable {
            let id: String?
            let payerName: String
            let cadence: String
            let anchorDate: String
            let amountEstimateCents: Int64
            let isPrimary: Bool
        }
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        f.locale = Locale(identifier: "en_US_POSIX")
        let body = Body(
            id: existingId,
            payerName: payerName,
            cadence: cadence.rawValue,
            anchorDate: f.string(from: anchorDate),
            amountEstimateCents: cents,
            isPrimary: true
        )
        do {
            let _: AckResponse = try await APIClient.shared.post("/api/settings/pay-cycles", body: body)
            savedAt = Date()
        } catch {
            self.error = (error as NSError).localizedDescription
        }
    }

    /// Accepts "3777", "3777.29", "$3,777.29" — anything where the digits
    /// (with at most one dot) parse cleanly into cents. Returns nil for junk
    /// rather than silently writing zero.
    static func parseAmountToCents(_ raw: String) -> Int64? {
        let cleaned = raw.replacingOccurrences(of: "[^0-9.]", with: "", options: .regularExpression)
        guard !cleaned.isEmpty else { return nil }
        guard let value = Decimal(string: cleaned) else { return nil }
        let cents = NSDecimalNumber(decimal: value * 100).int64Value
        return cents >= 0 ? cents : nil
    }
}

@MainActor
public final class FixedObligationEditorViewModel: ObservableObject {
    @Published public var name: String = ""
    @Published public var amountString: String = ""
    @Published public var cadence: Cadence = .monthly
    @Published public var dayOfMonth: Int = 1
    @Published public private(set) var error: String?
    @Published public private(set) var savedAt: Date?

    public init() {}

    public func save() async {
        error = nil
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else {
            error = "Give the bill a name."
            return
        }
        guard let cents = PayCycleEditorViewModel.parseAmountToCents(amountString), cents > 0 else {
            error = "Enter a valid dollar amount."
            return
        }
        struct Body: Encodable {
            let name: String
            let amountCents: Int64
            let cadence: String
            let expectedDayOfMonth: Int?
            let isActive: Bool
        }
        let body = Body(
            name: name,
            amountCents: cents,
            cadence: cadence.rawValue,
            expectedDayOfMonth: cadence == .monthly ? dayOfMonth : nil,
            isActive: true
        )
        do {
            let _: AckResponse = try await APIClient.shared.post("/api/settings/fixed-obligations", body: body)
            savedAt = Date()
        } catch {
            self.error = (error as NSError).localizedDescription
        }
    }
}

@MainActor
public final class CategoryRulesViewModel: ObservableObject {
    @Published public private(set) var rules: [UserRule] = []

    public init() {}

    public func load() async {
        struct Snapshot: Decodable { let userRules: [UserRule] }
        do {
            let s: Snapshot = try await APIClient.shared.get("/api/settings")
            rules = s.userRules
        } catch {}
    }

    public func delete(at offsets: IndexSet) async {
        let toDelete = offsets.map { rules[$0] }
        rules.remove(atOffsets: offsets)
        for rule in toDelete {
            try? await APIClient.shared.delete("/api/rules/\(rule.id)")
        }
    }
}
