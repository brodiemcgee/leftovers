import SwiftUI
import WidgetKit

struct LeftoversHeadroomWidget: Widget {
    let kind: String = "LeftoversHeadroomWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: HeadroomConfigIntent.self,
            provider: HeadroomTimelineProvider()
        ) { entry in
            HeadroomEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Cash Leftovers")
        .description("How much you can still spend without going backwards.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryRectangular,
            .accessoryInline,
        ])
    }
}

struct HeadroomEntry: TimelineEntry {
    let date: Date
    let snapshot: HeadroomSnapshot?
    let mode: HeadroomMode
}

struct HeadroomTimelineProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> HeadroomEntry {
        HeadroomEntry(date: Date(), snapshot: nil, mode: .month)
    }

    func snapshot(for configuration: HeadroomConfigIntent, in context: Context) async -> HeadroomEntry {
        HeadroomEntry(date: Date(), snapshot: HeadroomSnapshotStore.read(), mode: configuration.mode)
    }

    func timeline(for configuration: HeadroomConfigIntent, in context: Context) async -> Timeline<HeadroomEntry> {
        // First: try to fetch fresh numbers ourselves using the auth token
        // the main app put in the App Group. Falls through to the cached
        // snapshot if the token's expired or the network is unreachable.
        if let fresh = try? await fetchFresh() {
            HeadroomSnapshotStore.write(fresh)
        }

        let entry = HeadroomEntry(
            date: Date(),
            snapshot: HeadroomSnapshotStore.read(),
            mode: configuration.mode
        )
        // Schedule the next render in 30 min. WidgetKit honours this best-
        // effort within the system widget budget. The main app also calls
        // WidgetCenter.reloadTimelines on every successful in-app refresh.
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        return Timeline(entries: [entry], policy: .after(nextRefresh))
    }

    private func fetchFresh() async throws -> HeadroomSnapshot? {
        guard let auth = SharedAuthStore.read(), auth.isUsable else { return nil }
        guard let url = URL(string: auth.apiBaseURL + "/api/headroom") else { return nil }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(auth.accessToken)", forHTTPHeaderField: "Authorization")
        req.timeoutInterval = 8
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else { return nil }
        return try? decodeHeadroomResponse(data)
    }

    private func decodeHeadroomResponse(_ data: Data) throws -> HeadroomSnapshot? {
        struct HeadroomNumbers: Decodable {
            let period_end: String
            let forecast_income_cents: Int64
            let forecast_fixed_cents: Int64
            let spent_discretionary_cents: Int64
            let headroom_cents: Int64
            let days_remaining: Int
            let daily_burn_cents: Int64
        }
        struct Response: Decodable {
            let asOf: String
            let headroom: HeadroomNumbers
            let spentTodayCents: Int64?
        }
        let decoder = JSONDecoder()
        let r = try decoder.decode(Response.self, from: data)
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let asOf = isoFormatter.date(from: r.asOf)
            ?? ISO8601DateFormatter().date(from: r.asOf)
            ?? Date()
        let periodEnd = isoFormatter.date(from: r.headroom.period_end)
            ?? ISO8601DateFormatter().date(from: r.headroom.period_end)
            ?? Date()
        return HeadroomSnapshot(
            asOf: asOf,
            headroomCents: r.headroom.headroom_cents,
            spentDiscretionaryCents: r.headroom.spent_discretionary_cents,
            spentTodayCents: r.spentTodayCents ?? 0,
            dailyBurnCents: r.headroom.daily_burn_cents,
            daysRemaining: r.headroom.days_remaining,
            forecastIncomeCents: r.headroom.forecast_income_cents,
            forecastFixedCents: r.headroom.forecast_fixed_cents,
            periodEnd: periodEnd
        )
    }
}

struct HeadroomEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: HeadroomEntry

    var body: some View {
        switch family {
        case .systemSmall:
            SmallView(entry: entry)
        case .systemMedium:
            MediumView(entry: entry)
        case .accessoryRectangular:
            RectangularLockView(entry: entry)
        case .accessoryInline:
            InlineLockView(entry: entry)
        default:
            SmallView(entry: entry)
        }
    }
}

// MARK: - Sizes

private struct SmallView: View {
    let entry: HeadroomEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(modeLabel(entry.mode))
                .font(.caption2.smallCaps())
                .foregroundStyle(.secondary)
            Text(primaryAmount(entry: entry))
                .font(.system(size: 28, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .foregroundStyle(amountColour(entry: entry))
            Spacer()
            Text(subtitle(entry: entry))
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct MediumView: View {
    let entry: HeadroomEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(modeLabel(entry.mode))
                .font(.caption.smallCaps())
                .foregroundStyle(.secondary)
            Text(primaryAmount(entry: entry))
                .font(.system(size: 40, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .foregroundStyle(amountColour(entry: entry))
            Text(subtitle(entry: entry))
                .font(.footnote)
                .foregroundStyle(.secondary)
            if let snapshot = entry.snapshot, entry.mode == .month {
                MonthProgress(snapshot: snapshot)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct MonthProgress: View {
    let snapshot: HeadroomSnapshot
    var body: some View {
        let total = max(1, snapshot.headroomCents + snapshot.spentDiscretionaryCents)
        let pct = Double(snapshot.spentDiscretionaryCents) / Double(total)
        VStack(alignment: .leading, spacing: 3) {
            ProgressView(value: max(0, min(1, pct)))
                .progressViewStyle(.linear)
                .tint(pct > 1 ? .red : .accentColor)
            HStack {
                Text("\(formatAud(snapshot.spentDiscretionaryCents)) spent")
                Spacer()
                Text("of \(formatAud(total))")
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
    }
}

private struct RectangularLockView: View {
    let entry: HeadroomEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(modeLabel(entry.mode))
                .font(.caption2.smallCaps())
            Text(primaryAmount(entry: entry))
                .font(.title2.weight(.semibold).monospacedDigit())
                .minimumScaleFactor(0.5)
                .lineLimit(1)
            Text(subtitle(entry: entry))
                .font(.caption2)
        }
    }
}

private struct InlineLockView: View {
    let entry: HeadroomEntry
    var body: some View {
        Text("Leftovers \(primaryAmount(entry: entry))")
    }
}

// MARK: - Formatting helpers

private func modeLabel(_ mode: HeadroomMode) -> String {
    switch mode {
    case .month: return "This month"
    case .today: return "Today"
    case .dailyPace: return "Daily pace"
    }
}

private func primaryAmount(entry: HeadroomEntry) -> String {
    guard let s = entry.snapshot else { return "$—" }
    switch entry.mode {
    case .month: return formatAud(s.headroomCents)
    case .today: return formatAud(s.leftTodayCents)
    case .dailyPace: return formatAud(s.dailyBurnCents)
    }
}

private func amountColour(entry: HeadroomEntry) -> Color {
    guard let s = entry.snapshot else { return .primary }
    let value: Int64
    switch entry.mode {
    case .month: value = s.headroomCents
    case .today: value = s.leftTodayCents
    case .dailyPace: value = s.dailyBurnCents
    }
    if value < 0 { return .red }
    return .primary
}

private func subtitle(entry: HeadroomEntry) -> String {
    guard let s = entry.snapshot else {
        return "Open the app to refresh"
    }
    let updated = relativeUpdated(s.asOf)
    switch entry.mode {
    case .month:
        return "\(s.daysRemaining) days left · \(updated)"
    case .today:
        return "Spent \(formatAud(s.spentTodayCents)) today · \(updated)"
    case .dailyPace:
        return "\(s.daysRemaining) days left · \(updated)"
    }
}

private func relativeUpdated(_ date: Date) -> String {
    let f = RelativeDateTimeFormatter()
    f.unitsStyle = .abbreviated
    return f.localizedString(for: date, relativeTo: Date())
}

private func formatAud(_ cents: Int64) -> String {
    let abs = labs(cents)
    let dollars = abs / 100
    let rem = abs % 100
    let sign = cents < 0 ? "-" : ""
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.locale = Locale(identifier: "en_AU")
    let dollarsString = formatter.string(from: NSNumber(value: dollars)) ?? String(dollars)
    return "\(sign)$\(dollarsString).\(String(format: "%02d", rem))"
}

private func labs(_ x: Int64) -> Int64 { x < 0 ? -x : x }
