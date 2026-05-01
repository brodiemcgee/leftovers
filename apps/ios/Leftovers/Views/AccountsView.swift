import SwiftUI
import LeftoversCore

struct AccountsView: View {
    @StateObject private var viewModel = AccountsViewModel()

    var body: some View {
        List {
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
                    }
                }
                .padding(.vertical, 6)
            }
        }
        .navigationTitle("Accounts")
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }
}
