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

struct ConnectBasiqView: View {
    @StateObject private var viewModel = ConnectBasiqViewModel()
    var body: some View {
        Form {
            Section {
                Text("We'll open Basiq's secure consent flow to connect a bank. Pick the institution there.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Button("Start Basiq consent") { Task { await viewModel.start() } }
            }
            if let error = viewModel.error {
                Section { Text(error).font(.footnote).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Connect another bank")
    }
}
