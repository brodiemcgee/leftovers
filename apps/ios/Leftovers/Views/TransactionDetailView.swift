import SwiftUI
import LeftoversCore

struct TransactionDetailView: View {
    let transactionId: String
    @StateObject private var viewModel: TransactionDetailViewModel

    init(transactionId: String) {
        self.transactionId = transactionId
        self._viewModel = StateObject(wrappedValue: TransactionDetailViewModel(id: transactionId))
    }

    var body: some View {
        Form {
            if let detail = viewModel.detail {
                Section {
                    Text(Money.format(cents: detail.amountCents))
                        .font(.system(size: 40, weight: .semibold, design: .rounded))
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(detail.merchantRaw ?? "Unknown merchant")
                        .font(.headline)
                    Text(detail.postedAtFormatted)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    if let location = detail.location {
                        Label(location, systemImage: "mappin")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Category") {
                    Picker("Category", selection: $viewModel.selectedCategorySlug) {
                        ForEach(Category.allCases, id: \.slug) { c in
                            Text(c.displayName).tag(c.slug as String?)
                        }
                    }

                    Picker("Classification", selection: $viewModel.selectedClassification) {
                        ForEach(Classification.allCases, id: \.self) { c in
                            Text(c.displayName).tag(c)
                        }
                    }

                    Toggle("Apply to future from this merchant", isOn: $viewModel.applyToFuture)
                }

                Section {
                    if let reasoning = detail.classificationReasoning {
                        Text(reasoning)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    Button("Save changes") { Task { await viewModel.save() } }
                        .disabled(!viewModel.hasChanges || viewModel.isSaving)
                }
            } else if viewModel.isLoading {
                ProgressView()
            } else if let error = viewModel.error {
                Text(error).foregroundStyle(.red)
            }
        }
        .navigationTitle("Transaction")
        .task { await viewModel.load() }
    }
}
