import SwiftUI
import LeftoversCore

struct ConnectUpView: View {
    var onConnected: (() -> Void)? = nil
    @StateObject private var viewModel = ConnectUpViewModel()

    var body: some View {
        Form {
            Section {
                Text("Paste your Up personal access token. Find it at api.up.com.au/getting_started.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                SecureField("Personal access token", text: $viewModel.token)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
            }

            Section {
                Button {
                    Task {
                        await viewModel.connect()
                        if viewModel.isConnected { onConnected?() }
                    }
                } label: {
                    if viewModel.isLoading { ProgressView() }
                    else { Text("Connect") }
                }
                .disabled(viewModel.token.isEmpty || viewModel.isLoading)
            }

            if let error = viewModel.error {
                Section {
                    Text(error).foregroundStyle(.red).font(.footnote)
                }
            }
        }
        .navigationTitle("Connect Up Bank")
    }
}

import SafariServices

struct ConnectBasiqView: View {
    @StateObject private var viewModel = ConnectBasiqViewModel()
    @State private var showingConsent = false

    var body: some View {
        Form {
            Section {
                Text("We'll open a secure consent flow to link your bank. Pick the institution there, then return to this screen and tap \"Done\".")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section {
                if viewModel.consentUrl == nil {
                    Button {
                        Task {
                            await viewModel.start()
                            if viewModel.consentUrl != nil { showingConsent = true }
                        }
                    } label: {
                        if viewModel.isConnecting { ProgressView() } else { Text("Open Basiq consent") }
                    }
                    .disabled(viewModel.isConnecting)
                } else {
                    Button("Reopen consent") { showingConsent = true }
                    Button("I've finished — link my accounts") {
                        Task { await viewModel.finalise() }
                    }
                    .disabled(viewModel.isConnecting)
                }
            }

            if viewModel.connectionsAttached > 0 {
                Section {
                    Label(
                        "Linked \(viewModel.connectionsAttached) account\(viewModel.connectionsAttached == 1 ? "" : "s")",
                        systemImage: "checkmark.circle.fill"
                    )
                    .foregroundStyle(.green)
                }
            }

            if let error = viewModel.error {
                Section { Text(error).font(.footnote).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Connect another bank")
        .sheet(isPresented: $showingConsent) {
            if let url = viewModel.consentUrl {
                SafariSheet(url: url)
            }
        }
    }
}

private struct SafariSheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
