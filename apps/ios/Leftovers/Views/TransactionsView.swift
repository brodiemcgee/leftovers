import SwiftUI
import LeftoversCore

struct TransactionsView: View {
    @StateObject private var viewModel = TransactionsViewModel()

    var body: some View {
        List {
            ForEach(viewModel.groupedTransactions, id: \.day) { group in
                Section(header: Text(group.day)) {
                    ForEach(group.items) { tx in
                        NavigationLink(value: tx.id) {
                            TransactionRow(tx: tx)
                        }
                    }
                }
            }
            if viewModel.canLoadMore {
                Button("Load more") { Task { await viewModel.loadMore() } }
            }
        }
        .listStyle(.plain)
        .navigationTitle("Transactions")
        .navigationDestination(for: String.self) { id in
            TransactionDetailView(transactionId: id)
        }
        .task { await viewModel.load() }
        .refreshable { await viewModel.refresh() }
    }
}

private struct TransactionRow: View {
    let tx: TransactionListItem
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(tx.merchantDisplay)
                    .font(.subheadline)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let category = tx.classificationLabel {
                        Text(category)
                    }
                    if let account = tx.accountDisplay {
                        if tx.classificationLabel != nil { Text("·") }
                        Text(account).lineLimit(1)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer()
            Text(Money.format(cents: tx.amountCents))
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(tx.amountCents >= 0 ? .green : .primary)
        }
    }
}
