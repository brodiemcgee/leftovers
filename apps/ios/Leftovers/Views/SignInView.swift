import AuthenticationServices
import SwiftUI
import LeftoversCore

struct SignInView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var inFlight = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Spacer()
            Text("Leftovers")
                .font(.system(size: 40, weight: .semibold, design: .serif))
            Text("How much can I spend this month\nwithout going backwards?")
                .font(.title3)
                .foregroundStyle(.secondary)

            Spacer()

            SignInWithAppleButton(.signIn) { request in
                request.requestedScopes = [.email, .fullName]
            } onCompletion: { result in
                Task { await handle(result) }
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: 52)
            .disabled(inFlight)

            if let message = errorMessage {
                Text(message)
                    .foregroundStyle(.red)
                    .font(.footnote)
            }

            Text("Read-only by design — Leftovers never moves money.")
                .font(.footnote)
                .foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 28)
        .padding(.bottom, 36)
    }

    private func handle(_ result: Result<ASAuthorization, Error>) async {
        inFlight = true
        defer { inFlight = false }
        do {
            try await session.signInWithApple(from: result)
        } catch {
            errorMessage = String(describing: error)
        }
    }
}
