import SwiftUI
import LeftoversCore

struct SettingsView: View {
    @EnvironmentObject private var session: SessionStore
    @StateObject private var viewModel = SettingsViewModel()

    var body: some View {
        Form {
            if let s = viewModel.snapshot {
                Section("Connected accounts") {
                    if s.connections.isEmpty {
                        Text("No banks connected").foregroundStyle(.secondary)
                    } else {
                        ForEach(s.connections) { c in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(c.displayName).font(.subheadline)
                                Text(c.statusLabel).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    NavigationLink("Connect Up Bank") { ConnectUpView() }
                    NavigationLink("Connect another bank (Basiq)") { ConnectBasiqView() }
                    if let alias = s.user.emailAlias {
                        NavigationLink("Connect Amex via email alerts") {
                            AmexEmailSetupView(alias: alias)
                        }
                    }
                }

                Section("Pay cycle") {
                    if let cycle = s.payCycles.first {
                        VStack(alignment: .leading) {
                            Text(cycle.payerName).font(.subheadline)
                            Text("\(cycle.cadenceLabel) · \(Money.format(cents: cycle.amountEstimateCents, sign: .never))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    NavigationLink("Edit pay cycle") { PayCycleEditor() }
                }

                Section("Fixed bills") {
                    ForEach(s.fixedObligations) { f in
                        HStack {
                            Text(f.name)
                            Spacer()
                            Text(Money.format(cents: f.amountCents, sign: .never))
                                .font(.subheadline.monospacedDigit())
                        }
                    }
                    NavigationLink("Add a fixed bill") { FixedObligationEditor() }
                }

                Section("Categorisation") {
                    Toggle("Use Claude to categorise the long tail", isOn: $viewModel.llmEnabled)
                        .onChange(of: viewModel.llmEnabled) { _, new in Task { await viewModel.setLlm(new) } }
                    NavigationLink("My category rules") { CategoryRulesView() }
                }

                Section {
                    NavigationLink("Privacy & data") { PrivacyView() }
                    NavigationLink("Subscription") { SubscriptionView() }
                }

                Section {
                    Button("Sign out", role: .destructive) {
                        Task { await session.signOut() }
                    }
                }
            } else if viewModel.isLoading {
                ProgressView()
            } else if let error = viewModel.error {
                Text(error).foregroundStyle(.red)
            }
        }
        .navigationTitle("Settings")
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }
}
