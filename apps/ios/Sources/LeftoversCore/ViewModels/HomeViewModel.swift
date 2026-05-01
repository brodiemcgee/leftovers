import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

@MainActor
public final class HomeViewModel: ObservableObject {
    @Published public private(set) var snapshot: HomeSnapshot?
    @Published public private(set) var isLoading = false
    @Published public private(set) var error: String?
    @Published public private(set) var snapshotIsStale = false

    private let cacheKey = "leftovers.home_snapshot"

    public init() {
        if let cached = loadCached() { snapshot = cached; snapshotIsStale = true }
    }

    public func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let result: HomeSnapshot = try await APIClient.shared.get("/api/headroom")
            snapshot = result
            snapshotIsStale = false
            error = nil
            cache(result)
            publishToWidget(result)
        } catch let err {
            error = (err as NSError).localizedDescription
        }
    }

    /// Push the latest numbers into the App Group so the widget can render
    /// without making its own network call.
    private func publishToWidget(_ s: HomeSnapshot) {
        let snap = HeadroomSnapshot(
            asOf: s.asOf,
            headroomCents: s.headroom.headroomCents,
            spentDiscretionaryCents: s.headroom.spentDiscretionaryCents,
            spentTodayCents: s.spentTodayCents ?? 0,
            dailyBurnCents: s.headroom.dailyBurnCents,
            daysRemaining: s.headroom.daysRemaining,
            forecastIncomeCents: s.headroom.forecastIncomeCents,
            forecastFixedCents: s.headroom.forecastFixedCents,
            periodEnd: s.headroom.periodEnd
        )
        HeadroomSnapshotStore.write(snap)
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: "LeftoversHeadroomWidget")
        #endif
    }

    public func refresh() async {
        do {
            let _: SyncResultDTO = try await APIClient.shared.post("/api/sync", body: EmptyBody())
        } catch {
            // Swallow — refresh just continues to load whatever's there
        }
        await load()
    }

    private func cache(_ snapshot: HomeSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        UserDefaults.standard.set(data, forKey: cacheKey)
    }

    private func loadCached() -> HomeSnapshot? {
        guard let data = UserDefaults.standard.data(forKey: cacheKey) else { return nil }
        return try? JSONDecoder().decode(HomeSnapshot.self, from: data)
    }
}

struct EmptyBody: Encodable {}
struct SyncResultDTO: Decodable { let ok: Bool? }
