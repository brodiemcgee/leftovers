import Foundation

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
        } catch let err {
            error = (err as NSError).localizedDescription
        }
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
