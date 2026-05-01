import Foundation

@MainActor
public final class QuickAddViewModel: ObservableObject {
    @Published public var amountCents: Int = 0
    @Published public private(set) var result: QuickAddResponse?
    private var inFlightTask: Task<Void, Never>?

    public init() {}

    public func recompute() async {
        inFlightTask?.cancel()
        let amount = amountCents
        guard amount > 0 else { result = nil; return }
        inFlightTask = Task {
            try? await Task.sleep(nanoseconds: 200_000_000)
            if Task.isCancelled { return }
            do {
                let response: QuickAddResponse = try await APIClient.shared.post(
                    "/api/quick-add",
                    body: ["amountCents": amount]
                )
                result = response
            } catch {
                // Leave previous result
            }
        }
    }
}
