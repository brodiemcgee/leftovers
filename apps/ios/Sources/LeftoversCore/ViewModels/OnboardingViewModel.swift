import Foundation

@MainActor
public final class OnboardingViewModel: ObservableObject {
    @Published public private(set) var payCandidates: [PayCandidate] = []
    @Published public private(set) var fixedCandidates: [FixedObligationCandidate] = []

    public init() {}

    public func detectPay() async {
        struct Response: Decodable { let candidates: [PayCandidate] }
        do {
            let r: Response = try await APIClient.shared.get("/api/onboarding/detect-pay")
            payCandidates = r.candidates
        } catch {}
    }

    public func detectFixed() async {
        struct Response: Decodable { let candidates: [FixedObligationCandidate] }
        do {
            let r: Response = try await APIClient.shared.get("/api/onboarding/detect-fixed")
            fixedCandidates = r.candidates
        } catch {}
    }

    public func confirmPay(_ chosen: PayCandidate) async {
        struct Body: Encodable {
            let payerName: String; let cadence: String; let anchorDate: String; let amountEstimateCents: Int64; let isPrimary: Bool
        }
        let body = Body(
            payerName: chosen.payerName,
            cadence: chosen.cadence.rawValue,
            anchorDate: chosen.anchorDate,
            amountEstimateCents: chosen.amountEstimateCents,
            isPrimary: true
        )
        let _: AckResponse = (try? await APIClient.shared.post("/api/settings/pay-cycles", body: body)) ?? AckResponse(ok: nil)
    }

    public func confirmFixed(_ chosen: [FixedObligationCandidate]) async {
        struct Body: Encodable {
            let name: String; let amountCents: Int64; let cadence: String; let expectedDayOfMonth: Int?; let isActive: Bool
        }
        for c in chosen {
            let body = Body(
                name: c.merchantRaw,
                amountCents: c.amountCents,
                cadence: c.cadence.rawValue,
                expectedDayOfMonth: c.expectedDayOfMonth,
                isActive: true
            )
            let _: AckResponse = (try? await APIClient.shared.post("/api/settings/fixed-obligations", body: body)) ?? AckResponse(ok: nil)
        }
    }
}
