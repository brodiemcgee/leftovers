import SwiftUI
import LeftoversCore

struct RootView: View {
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        switch session.state {
        case .loading:
            ProgressView("Starting up…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .signedOut:
            SignInView()
        case .needsOnboarding:
            OnboardingView()
        case .signedIn:
            HomeTabView()
        case .error(let message):
            VStack(spacing: 16) {
                Text("Something went wrong")
                    .font(.headline)
                Text(message)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                Button("Retry") { Task { await session.bootstrap() } }
            }
            .padding()
        }
    }
}
