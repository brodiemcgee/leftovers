import Foundation

@MainActor
public final class SubBudgetTransactionsViewModel: ObservableObject {
    @Published public private(set) var transactions: [TransactionListItem] = []
    @Published public private(set) var isLoading = false
    @Published public private(set) var error: String?

    public init() {}

    public func load(subBudgetId: String) async {
        isLoading = true
        defer { isLoading = false }
        struct Response: Decodable {
            let transactions: [TransactionListItem]
        }
        do {
            let r: Response = try await APIClient.shared.get("/api/sub-budgets/\(subBudgetId)/transactions")
            transactions = r.transactions
            error = nil
        } catch {
            self.error = (error as NSError).localizedDescription
        }
    }
}
