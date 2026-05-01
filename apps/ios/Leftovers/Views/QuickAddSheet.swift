import SwiftUI
import LeftoversCore

struct QuickAddSheet: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = QuickAddViewModel()

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 24) {
                Text("If I spent…")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                AmountField(amountCents: $viewModel.amountCents)

                if let result = viewModel.result {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Would leave you with")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text(Money.format(cents: result.projectedHeadroomCents, sign: .never))
                            .font(.system(size: 40, weight: .semibold, design: .rounded))
                            .foregroundStyle(result.goesNegative ? .red : .primary)
                        Text(
                            "≈ \(Money.format(cents: result.projectedDailyAllowanceCents, sign: .never))/day for \(result.daysRemaining) days"
                        )
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    }
                    .padding(16)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
                }
                Spacer()
                Text("Nothing is saved or recorded.")
                    .font(.footnote)
                    .foregroundStyle(.tertiary)
            }
            .padding(20)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .navigationTitle("Quick check")
            .navigationBarTitleDisplayMode(.inline)
        }
        .onChange(of: viewModel.amountCents) { _, _ in
            Task { await viewModel.recompute() }
        }
    }
}

private struct AmountField: View {
    @Binding var amountCents: Int
    @State private var text: String = ""

    var body: some View {
        HStack {
            Text("$").font(.system(size: 56, weight: .light))
            TextField("0", text: $text)
                .keyboardType(.numberPad)
                .font(.system(size: 56, weight: .semibold))
                .onChange(of: text) { _, newValue in
                    let digits = newValue.filter { $0.isNumber }
                    amountCents = (Int(digits) ?? 0) * 100
                    if digits != newValue { text = digits }
                }
        }
    }
}
