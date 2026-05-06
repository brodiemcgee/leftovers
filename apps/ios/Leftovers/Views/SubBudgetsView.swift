import SwiftUI
import LeftoversCore

/// List of the user's sub-budget envelopes with edit / delete / add.
/// Reached from the Sub-budgets card on Home.
struct SubBudgetsView: View {
    @StateObject private var viewModel = SubBudgetsViewModel()
    @State private var editing: SubBudgetProgress?
    @State private var creatingNew = false

    var body: some View {
        List {
            if viewModel.items.isEmpty && !viewModel.isLoading {
                Text("No sub-budgets yet. Tap the + above to create one.")
                    .foregroundStyle(.secondary)
            }
            ForEach(viewModel.items) { item in
                NavigationLink {
                    SubBudgetTransactionsView(subBudget: item)
                } label: {
                    SubBudgetRow(item: item)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button("Edit") { editing = item }.tint(.blue)
                    if !item.isCatchall {
                        Button("Delete", role: .destructive) {
                            Task { await viewModel.delete(item) }
                        }
                    }
                }
            }
        }
        .navigationTitle("Sub-budgets")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { creatingNew = true } label: { Image(systemName: "plus") }
            }
        }
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
        .sheet(item: $editing) { item in
            NavigationStack {
                SubBudgetEditor(initial: item) {
                    editing = nil
                    Task { await viewModel.load() }
                }
            }
        }
        .sheet(isPresented: $creatingNew) {
            NavigationStack {
                SubBudgetEditor(initial: nil) {
                    creatingNew = false
                    Task { await viewModel.load() }
                }
            }
        }
    }
}

private struct SubBudgetRow: View {
    let item: SubBudgetProgress
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(item.name).font(.subheadline.weight(.medium))
                if item.isCatchall {
                    Text("CATCH-ALL")
                        .font(.caption2.smallCaps())
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.secondary.opacity(0.15), in: Capsule())
                }
                Spacer()
                Text("\(Money.format(cents: item.spentCents, sign: .never)) / \(Money.format(cents: item.targetCents, sign: .never))")
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            ProgressView(value: min(1, Double(item.spentCents) / max(1, Double(item.targetCents))))
                .tint(item.spentCents > item.targetCents ? .red : .accentColor)
        }
        .padding(.vertical, 6)
    }
}

private struct SubBudgetEditor: View {
    let initial: SubBudgetProgress?
    let onSaved: () -> Void

    @StateObject private var viewModel = SubBudgetEditorViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section("Name") {
                TextField("e.g. Eating out", text: $viewModel.name)
                    .textInputAutocapitalization(.words)
            }
            Section("Monthly target") {
                TextField("Amount in dollars", text: $viewModel.targetString)
                    .keyboardType(.decimalPad)
            }
            Section("Category") {
                Picker("Category", selection: $viewModel.categorySlug) {
                    Text("(catch-all — anything not budgeted)").tag(Optional<String>.none)
                    ForEach(viewModel.availableCategories, id: \.slug) { c in
                        Text(c.name).tag(Optional(c.slug))
                    }
                }
            }
            if let err = viewModel.error {
                Section { Text(err).foregroundStyle(.red).font(.footnote) }
            }
            Section {
                Button("Save") {
                    Task {
                        await viewModel.save()
                        if viewModel.error == nil {
                            onSaved()
                            dismiss()
                        }
                    }
                }
                .disabled(viewModel.name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .navigationTitle(initial == nil ? "New sub-budget" : "Edit sub-budget")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Cancel") { dismiss() }
            }
        }
        .task {
            await viewModel.loadCategories()
            if let s = initial {
                viewModel.prefill(from: s)
            }
        }
    }
}
