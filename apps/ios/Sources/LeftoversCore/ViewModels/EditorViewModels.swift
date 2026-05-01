import Foundation

@MainActor
public final class PayCycleEditorViewModel: ObservableObject {
    @Published public var payerName: String = ""
    @Published public var cadence: Cadence = .fortnightly
    @Published public var anchorDate: Date = Date()
    @Published public var amountString: String = ""

    public init() {}

    public func load() async {
        struct Snapshot: Decodable {
            struct Cycle: Decodable {
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
                payerName = primary.payerName
                cadence = primary.cadence
                amountString = String(primary.amountEstimateCents / 100)
                if let d = ISO8601DateFormatter().date(from: primary.anchorDate + "T00:00:00Z") {
                    anchorDate = d
                }
            }
        } catch {}
    }

    public func save() async {
        struct Body: Encodable {
            let payerName: String; let cadence: String; let anchorDate: String;
            let amountEstimateCents: Int64; let isPrimary: Bool
        }
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(identifier: "UTC")
        let body = Body(
            payerName: payerName,
            cadence: cadence.rawValue,
            anchorDate: f.string(from: anchorDate),
            amountEstimateCents: Int64((Int(amountString) ?? 0) * 100),
            isPrimary: true
        )
        let _: AckResponse = (try? await APIClient.shared.post("/api/settings/pay-cycles", body: body)) ?? AckResponse(ok: nil)
    }
}

@MainActor
public final class FixedObligationEditorViewModel: ObservableObject {
    @Published public var name: String = ""
    @Published public var amountString: String = ""
    @Published public var cadence: Cadence = .monthly
    @Published public var dayOfMonth: Int = 1

    public init() {}

    public func save() async {
        struct Body: Encodable {
            let name: String; let amountCents: Int64; let cadence: String;
            let expectedDayOfMonth: Int?; let isActive: Bool
        }
        let body = Body(
            name: name,
            amountCents: Int64((Int(amountString) ?? 0) * 100),
            cadence: cadence.rawValue,
            expectedDayOfMonth: dayOfMonth,
            isActive: true
        )
        let _: AckResponse = (try? await APIClient.shared.post("/api/settings/fixed-obligations", body: body)) ?? AckResponse(ok: nil)
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
