import BackgroundTasks
import SwiftUI
import LeftoversCore
#if canImport(WidgetKit)
import WidgetKit
#endif

private let backgroundRefreshIdentifier = "com.brodiemcgee.leftovers.refresh"

@main
struct LeftoversApp: App {
    @StateObject private var session = SessionStore()
    @Environment(\.scenePhase) private var scenePhase

    init() {
        Telemetry.bootstrap()
        registerBackgroundTask()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .task { await session.bootstrap() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background {
                scheduleBackgroundRefresh()
            }
        }
    }

    /// Register the BGAppRefreshTask handler. Must be called before the
    /// app's UI is presented (we do it from init()). When iOS decides to
    /// give the app some background time it'll call into this handler.
    private func registerBackgroundTask() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: backgroundRefreshIdentifier,
            using: nil
        ) { task in
            handleBackgroundRefresh(task: task as! BGAppRefreshTask)
        }
    }
}

/// Ask iOS to wake us up for a refresh some time in the future. iOS doesn't
/// promise an exact time — it picks based on battery, network, and the app's
/// historical foreground use. Real-world we typically see ~1–4 invocations
/// per day if the user opens the app at least every couple of days.
func scheduleBackgroundRefresh() {
    let request = BGAppRefreshTaskRequest(identifier: backgroundRefreshIdentifier)
    request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60) // 1 hour
    do {
        try BGTaskScheduler.shared.submit(request)
    } catch {
        // Either the task isn't registered (impossible — we register at
        // init) or iOS rejected the submission (e.g. duplicate). Either way
        // we'll get another shot the next time the app backgrounds.
    }
}

/// Background refresh handler — called by iOS, not by us. We have ~30 seconds
/// of CPU before iOS revokes the task, so we make exactly one /api/headroom
/// call, write the snapshot, reload the widget timeline, and chain the next
/// scheduled refresh.
func handleBackgroundRefresh(task: BGAppRefreshTask) {
    scheduleBackgroundRefresh()  // chain the next one before we do work

    let workItem = Task {
        let success = await refreshHeadroomFromAppGroupAuth()
        #if canImport(WidgetKit)
        if success {
            WidgetCenter.shared.reloadTimelines(ofKind: "LeftoversHeadroomWidget")
        }
        #endif
        task.setTaskCompleted(success: success)
    }
    task.expirationHandler = {
        workItem.cancel()
        task.setTaskCompleted(success: false)
    }
}

/// Hit /api/headroom using the auth token in the App Group. Same flow the
/// widget itself uses; consolidated here so we don't duplicate the JSON
/// shape mapping between the two.
@discardableResult
func refreshHeadroomFromAppGroupAuth() async -> Bool {
    guard let auth = SharedAuthStore.read(), auth.isUsable else { return false }
    guard let url = URL(string: auth.apiBaseURL + "/api/headroom") else { return false }
    var req = URLRequest(url: url)
    req.setValue("Bearer \(auth.accessToken)", forHTTPHeaderField: "Authorization")
    req.timeoutInterval = 10
    do {
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else { return false }
        if let snapshot = try? decodeBackgroundHeadroom(data) {
            HeadroomSnapshotStore.write(snapshot)
            return true
        }
        return false
    } catch {
        return false
    }
}

private func decodeBackgroundHeadroom(_ data: Data) throws -> HeadroomSnapshot? {
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
    let isoF = ISO8601DateFormatter()
    isoF.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let asOf = isoF.date(from: r.asOf) ?? ISO8601DateFormatter().date(from: r.asOf) ?? Date()
    let periodEnd = isoF.date(from: r.headroom.period_end)
        ?? ISO8601DateFormatter().date(from: r.headroom.period_end) ?? Date()
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
