import SwiftUI
import LeftoversCore

/// Lists every transaction in the current month that counts toward a single
/// sub-budget envelope. Reachable from the Sub-budgets list by tapping a row.
struct SubBudgetTransactionsView: View {
    let subBudget: SubBudgetProgress
    @StateObject private var viewModel = SubBudgetTransactionsViewModel()

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(subBudget.name).font(.title3.weight(.semibold))
                        Spacer()
                        Text("\(Money.format(cents: subBudget.spentCents, sign: .never)) / \(Money.format(cents: subBudget.targetCents, sign: .never))")
                            .font(.subheadline.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                    ProgressView(value: min(1, Double(subBudget.spentCents) / max(1, Double(subBudget.targetCents))))
                        .tint(subBudget.spentCents > subBudget.targetCents ? .red : .accentColor)
                    if subBudget.spentCents > subBudget.targetCents {
                        Text("\(Money.format(cents: subBudget.spentCents - subBudget.targetCents, sign: .never)) over budget this month")
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
                .padding(.vertical, 4)
            }
            Section {
                if viewModel.isLoading && viewModel.transactions.isEmpty {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if viewModel.transactions.isEmpty {
                    Text("No transactions in this envelope this month yet.")
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                } else {
                    ForEach(viewModel.transactions) { tx in
                        NavigationLink {
                            TransactionDetailView(transactionId: tx.id)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(alignment: .firstTextBaseline) {
                                    Text(tx.merchantDisplay)
                                        .font(.subheadline)
                                        .lineLimit(1)
                                    Spacer()
                                    Text(Money.format(cents: tx.amountCents))
                                        .font(.subheadline.monospacedDigit())
                                        .foregroundStyle(tx.amountCents >= 0 ? .green : .primary)
                                }
                                HStack(spacing: 6) {
                                    Text(tx.postedAt, style: .date)
                                    if let acc = tx.accountDisplay {
                                        Text("·")
                                        Text(acc).lineLimit(1)
                                    }
                                }
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            } header: {
                Text("Transactions this month")
            } footer: {
                if let err = viewModel.error {
                    Text(err).foregroundStyle(.red).font(.footnote)
                }
            }
        }
        .navigationTitle(subBudget.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load(subBudgetId: subBudget.id) }
        .refreshable { await viewModel.load(subBudgetId: subBudget.id) }
    }
}
