import SwiftUI
import LeftoversCore

struct HomeView: View {
    @StateObject private var viewModel = HomeViewModel()
    @State private var stale: Bool = false

    var body: some View {
        ScrollView {
            if let snapshot = viewModel.snapshot {
                VStack(alignment: .leading, spacing: 28) {
                    HeroNumber(snapshot: snapshot)
                    PacePill(state: snapshot.pace.state, reason: snapshot.pace.reason)
                    SpendProgressBar(snapshot: snapshot)
                    SubBudgetsCard(items: snapshot.subBudgets)
                    UpcomingCard(items: snapshot.upcoming)
                    if stale {
                        Text("Showing last-known balances. Pull to refresh.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            } else if viewModel.isLoading {
                ProgressView().padding(.top, 80)
            } else if let error = viewModel.error {
                VStack(spacing: 12) {
                    Text("Couldn't load your headroom").font(.headline)
                    Text(error).font(.footnote).foregroundStyle(.secondary)
                    Button("Retry") { Task { await viewModel.load() } }
                }.padding()
            }
        }
        .navigationTitle(monthLabel())
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { Task { await viewModel.refresh() } } label: {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
        .refreshable { await viewModel.refresh() }
        .task {
            await viewModel.load()
            stale = viewModel.snapshotIsStale
        }
    }

    private func monthLabel() -> String {
        let f = DateFormatter()
        f.locale = .init(identifier: "en_AU")
        f.dateFormat = "MMMM"
        return f.string(from: Date())
    }
}

private struct HeroNumber: View {
    let snapshot: HomeSnapshot
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Headroom remaining")
                .font(.subheadline.smallCaps())
                .foregroundStyle(.secondary)
            Text(Money.format(cents: snapshot.headroom.headroomCents, sign: .never))
                .font(.system(size: 56, weight: .semibold, design: .serif))
                .monospacedDigit()
            Text(
                "\(Money.format(cents: snapshot.headroom.dailyBurnCents, sign: .never))/day · \(snapshot.headroom.daysRemaining) days left"
            )
            .font(.headline)
            .foregroundStyle(.secondary)
        }
        .padding(.top, 24)
    }
}

private struct PacePill: View {
    let state: PaceState
    let reason: String
    var body: some View {
        HStack(spacing: 8) {
            Circle().fill(state.color).frame(width: 8, height: 8)
            Text(reason)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(state.color.opacity(0.08), in: Capsule())
    }
}

private extension PaceState {
    var color: Color {
        switch self {
        case .ahead: return .green
        case .onTrack: return .gray
        case .behind: return .red
        }
    }
}

private struct SpendProgressBar: View {
    let snapshot: HomeSnapshot
    var body: some View {
        let total = snapshot.headroom.headroomCents + snapshot.headroom.spentDiscretionaryCents
        let pct = total > 0 ? Double(snapshot.headroom.spentDiscretionaryCents) / Double(total) : 0
        return VStack(alignment: .leading, spacing: 6) {
            ProgressView(value: max(0, min(1, pct)))
                .tint(.accentColor)
            HStack {
                Text("Spent \(Money.format(cents: snapshot.headroom.spentDiscretionaryCents, sign: .never))")
                Spacer()
                Text("of \(Money.format(cents: total, sign: .never))")
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
    }
}

private struct SubBudgetsCard: View {
    let items: [SubBudgetProgress]
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Sub-budgets").font(.headline)
            ForEach(items) { item in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(item.name).font(.subheadline)
                        Spacer()
                        Text("\(Money.format(cents: item.spentCents, sign: .never)) / \(Money.format(cents: item.targetCents, sign: .never))")
                            .font(.footnote.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                    ProgressView(
                        value: min(1, Double(item.spentCents) / max(1, Double(item.targetCents)))
                    )
                    .tint(item.spentCents > item.targetCents ? .red : .accentColor)
                }
            }
        }
        .padding(16)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct UpcomingCard: View {
    let items: [UpcomingItem]
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Coming up").font(.headline)
            if items.isEmpty {
                Text("Nothing scheduled in the next few days.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(items) { i in
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading) {
                            Text(i.name).font(.subheadline)
                            Text(i.nextExpectedDateFormatted)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(Money.format(cents: i.amountCents, sign: .never))
                            .font(.subheadline.monospacedDigit())
                    }
                }
            }
        }
        .padding(16)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}
