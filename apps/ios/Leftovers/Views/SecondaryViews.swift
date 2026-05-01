import SwiftUI
import LeftoversCore

struct PayCycleEditor: View {
    @StateObject private var viewModel = PayCycleEditorViewModel()
    var body: some View {
        Form {
            Section("Payer") { TextField("Employer name", text: $viewModel.payerName) }
            Section("Cadence") {
                Picker("Cadence", selection: $viewModel.cadence) {
                    ForEach(Cadence.allCases, id: \.self) { c in
                        Text(c.displayName).tag(c)
                    }
                }
                DatePicker("Anchor date", selection: $viewModel.anchorDate, displayedComponents: .date)
                TextField("Amount estimate", text: $viewModel.amountString)
                    .keyboardType(.numberPad)
            }
            Section { Button("Save") { Task { await viewModel.save() } } }
        }
        .navigationTitle("Pay cycle")
        .task { await viewModel.load() }
    }
}

struct FixedObligationEditor: View {
    @StateObject private var viewModel = FixedObligationEditorViewModel()
    var body: some View {
        Form {
            Section("Bill") {
                TextField("Name", text: $viewModel.name)
                TextField("Amount (dollars)", text: $viewModel.amountString).keyboardType(.numberPad)
            }
            Section("Cadence") {
                Picker("Cadence", selection: $viewModel.cadence) {
                    ForEach(Cadence.allCases, id: \.self) { Text($0.displayName).tag($0) }
                }
                Stepper("Day of month: \(viewModel.dayOfMonth)", value: $viewModel.dayOfMonth, in: 1...31)
            }
            Section { Button("Save") { Task { await viewModel.save() } } }
        }
        .navigationTitle("Fixed bill")
    }
}

struct CategoryRulesView: View {
    @StateObject private var viewModel = CategoryRulesViewModel()
    var body: some View {
        List {
            ForEach(viewModel.rules) { rule in
                VStack(alignment: .leading) {
                    Text(rule.merchantPattern).font(.subheadline)
                    Text("\(rule.classification.displayName)")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .onDelete { idx in Task { await viewModel.delete(at: idx) } }
        }
        .navigationTitle("My rules")
        .task { await viewModel.load() }
    }
}

struct PrivacyView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Privacy & data").font(.title2.bold())
                Text("Leftovers is read-only. We never move money. Bank credentials never touch our servers — Basiq and Up handle them. Transaction merchant strings sent to Claude have account numbers stripped first. You can export everything as JSON or delete your account at any time, which wipes all data within 30 days.")
                    .foregroundStyle(.secondary)
                Button("Export my data (JSON)") { /* triggers /api/data-export when wired */ }
                Button("Delete my account", role: .destructive) { /* triggers /api/account/delete when wired */ }
            }.padding(20)
        }
        .navigationTitle("Privacy")
    }
}

struct SubscriptionView: View {
    var body: some View {
        Form {
            Section("Status") {
                Text("Trial").font(.headline)
                Text("$5–8/month after trial. Cancel any time in App Store settings.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Subscription")
    }
}

struct PayConfirmView: View {
    let candidates: [PayCandidate]
    let onConfirm: (PayCandidate) -> Void
    @State private var selection: PayCandidate?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Looks like you're paid…").font(.headline)
            ForEach(candidates) { c in
                Button {
                    selection = c
                } label: {
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading) {
                            Text(c.payerName).font(.subheadline)
                            Text("\(c.cadenceLabel) · ~\(Money.format(cents: c.amountEstimateCents, sign: .never))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if selection?.id == c.id { Image(systemName: "checkmark.circle.fill") }
                    }
                    .padding(12)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
            }
            Button("Confirm") {
                if let s = selection { onConfirm(s) }
            }
            .buttonStyle(.borderedProminent)
            .disabled(selection == nil)
        }
    }
}

struct FixedObligationConfirmView: View {
    let candidates: [FixedObligationCandidate]
    let onConfirm: ([FixedObligationCandidate]) -> Void
    @State private var checked: Set<String> = []

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Confirm your fixed bills").font(.headline)
            Text("Tap each one that's a real recurring bill. We won't auto-classify mortgage or rent without your tap.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            ScrollView {
                ForEach(candidates) { c in
                    Button {
                        if checked.contains(c.id) { checked.remove(c.id) } else { checked.insert(c.id) }
                    } label: {
                        HStack {
                            Image(systemName: checked.contains(c.id) ? "checkmark.square.fill" : "square")
                            VStack(alignment: .leading) {
                                Text(c.merchantRaw).font(.subheadline)
                                Text("\(c.cadenceLabel) · \(Money.format(cents: c.amountCents, sign: .never))")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if c.isLikelyMortgageOrRent {
                                Text("requires confirm").font(.caption2).foregroundStyle(.orange)
                            }
                        }
                        .padding(.vertical, 6)
                    }
                    .buttonStyle(.plain)
                }
            }
            Button("Confirm \(checked.count)") {
                onConfirm(candidates.filter { checked.contains($0.id) })
            }
            .buttonStyle(.borderedProminent)
        }
    }
}
