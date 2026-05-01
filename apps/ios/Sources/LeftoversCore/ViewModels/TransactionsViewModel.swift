import Foundation

public struct TransactionDayGroup: Equatable {
    public let day: String
    public let items: [TransactionListItem]
}

@MainActor
public final class TransactionsViewModel: ObservableObject {
    @Published public private(set) var transactions: [TransactionListItem] = []
    @Published public private(set) var canLoadMore = false
    @Published public private(set) var isLoading = false
    private var cursor: String?

    public init() {}

    public var groupedTransactions: [TransactionDayGroup] {
        let formatter = DateFormatter()
        formatter.locale = .init(identifier: "en_AU")
        formatter.dateFormat = "EEE d MMM"
        var groups: [String: [TransactionListItem]] = [:]
        var order: [String] = []
        for tx in transactions {
            let day = formatter.string(from: tx.postedAt)
            if groups[day] == nil { order.append(day) }
            groups[day, default: []].append(tx)
        }
        return order.map { TransactionDayGroup(day: $0, items: groups[$0] ?? []) }
    }

    public func load() async { await fetch(reset: true) }
    public func refresh() async { await fetch(reset: true) }
    public func loadMore() async { await fetch(reset: false) }

    private func fetch(reset: Bool) async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        if reset { cursor = nil }
        do {
            var query: [URLQueryItem] = [URLQueryItem(name: "limit", value: "50")]
            if let c = cursor { query.append(URLQueryItem(name: "cursor", value: c)) }
            let response: TransactionsListResponse = try await APIClient.shared.get(
                "/api/transactions",
                query: query
            )
            if reset { transactions = response.transactions }
            else { transactions.append(contentsOf: response.transactions) }
            cursor = response.nextCursor
            canLoadMore = response.nextCursor != nil
        } catch {
            // Surface elsewhere — keep cached transactions
        }
    }
}

struct TransactionsListResponse: Decodable {
    let transactions: [TransactionListItem]
    let nextCursor: String?
}
