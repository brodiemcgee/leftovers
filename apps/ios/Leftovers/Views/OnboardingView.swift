import SwiftUI
import LeftoversCore

struct OnboardingView: View {
    @EnvironmentObject private var session: SessionStore
    @StateObject private var viewModel = OnboardingViewModel()
    @State private var step: Step = .welcome

    enum Step { case welcome, connect, detectPay, confirmPay, detectFixed, confirmFixed, ready }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 20) {
                ProgressView(value: progress).tint(.accentColor)
                contentForStep
                Spacer()
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 32)
        }
    }

    @ViewBuilder
    private var contentForStep: some View {
        switch step {
        case .welcome:
            VStack(alignment: .leading, spacing: 16) {
                Text("Three minutes to your headroom number.")
                    .font(.system(size: 32, weight: .semibold, design: .serif))
                Text("We'll connect a bank, detect your pay cycle, and confirm a few fixed bills. That's it.")
                    .foregroundStyle(.secondary)
                Button("Begin") { step = .connect }
                    .buttonStyle(.borderedProminent)
            }

        case .connect:
            ConnectUpView(onConnected: { step = .detectPay })

        case .detectPay:
            VStack(alignment: .leading, spacing: 16) {
                Text("Detecting your pay cycle…").font(.headline)
                ProgressView()
            }
            .task {
                await viewModel.detectPay()
                step = .confirmPay
            }

        case .confirmPay:
            PayConfirmView(candidates: viewModel.payCandidates) { selected in
                Task {
                    await viewModel.confirmPay(selected)
                    step = .detectFixed
                }
            }

        case .detectFixed:
            VStack(alignment: .leading, spacing: 16) {
                Text("Looking for fixed bills…").font(.headline)
                ProgressView()
            }
            .task {
                await viewModel.detectFixed()
                step = .confirmFixed
            }

        case .confirmFixed:
            FixedObligationConfirmView(candidates: viewModel.fixedCandidates) { selected in
                Task {
                    await viewModel.confirmFixed(selected)
                    step = .ready
                }
            }

        case .ready:
            VStack(alignment: .leading, spacing: 16) {
                Text("You're set.").font(.system(size: 32, weight: .semibold, design: .serif))
                Text("We'll keep your headroom up to date as transactions sync. The app should disappear from your day until you're about to spend.")
                    .foregroundStyle(.secondary)
                Button("Take me home") { Task { await session.completeOnboarding() } }
                    .buttonStyle(.borderedProminent)
            }
        }
    }

    private var progress: Double {
        switch step {
        case .welcome: return 0.0
        case .connect: return 0.2
        case .detectPay: return 0.4
        case .confirmPay: return 0.6
        case .detectFixed: return 0.75
        case .confirmFixed: return 0.9
        case .ready: return 1.0
        }
    }
}
