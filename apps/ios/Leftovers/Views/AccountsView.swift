import SwiftUI
import LeftoversCore

struct AccountsView: View {
    @StateObject private var viewModel = AccountsViewModel()

    private var netPositionCents: Int64 {
        viewModel.accounts.reduce(0) { $0 + $1.balanceCents }
    }

    private var assetsCents: Int64 {
        viewModel.accounts.filter { !isLiability($0) }.reduce(0) { $0 + $1.balanceCents }
    }

    private var liabilitiesCents: Int64 {
        viewModel.accounts.filter { isLiability($0) }.reduce(0) { $0 + $1.balanceCents }
    }

    var body: some View {
        List {
            if !viewModel.accounts.isEmpty {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Net position")
                            .font(.caption.smallCaps())
                            .foregroundStyle(.secondary)
                        Text(Money.format(cents: netPositionCents))
                            .font(.system(size: 32, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(netPositionCents < 0 ? .red : .primary)
                        HStack(spacing: 12) {
                            Label(Money.format(cents: assetsCents, sign: .never), systemImage: "arrow.up.circle")
                                .foregroundStyle(.green)
                            Label(Money.format(cents: liabilitiesCents, sign: .never), systemImage: "arrow.down.circle")
                                .foregroundStyle(.red)
                        }
                        .font(.caption.monospacedDigit())
                    }
                    .padding(.vertical, 4)
                }
            }
            Section("Accounts") {
                ForEach(viewModel.accounts) { a in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(a.displayName)
                            .font(.subheadline)
                        Text(a.accountTypeLabel)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        HStack {
                            Spacer()
                            Text(Money.format(cents: a.balanceCents))
                                .font(.title3.monospacedDigit())
                                .foregroundStyle(a.balanceCents < 0 ? .red : .primary)
                        }
                    }
                    .padding(.vertical, 6)
                }
            }
        }
        .navigationTitle("Accounts")
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }

    private func isLiability(_ a: AccountSummary) -> Bool {
        // Credit cards (and any negative-balance account) reduce net worth.
        a.accountType == "credit" || a.balanceCents < 0
    }
}
