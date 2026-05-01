import Foundation

@MainActor
public final class ConnectUpViewModel: ObservableObject {
    @Published public var token: String = ""
    @Published public private(set) var isLoading = false
    @Published public private(set) var isConnected = false
    @Published public private(set) var error: String?

    public init() {}

    public func connect() async {
        isLoading = true
        defer { isLoading = false }
        struct Body: Encodable { let personalAccessToken: String }
        struct Response: Decodable { let ok: Bool }
        struct SyncBody: Encodable {}
        struct SyncResponse: Decodable { let ok: Bool? }
        do {
            let _: Response = try await APIClient.shared.post(
                "/api/connect/up",
                body: Body(personalAccessToken: token)
            )
            isConnected = true
            // Kick off the actual transaction backfill in the background.
            // Connect-up only validates + saves the token; the heavy sync
            // can take up to 60s on a fresh account so we don't await it.
            Task.detached(priority: .background) {
                let _: SyncResponse? = try? await APIClient.shared.post(
                    "/api/sync",
                    body: SyncBody()
                )
            }
        } catch let err {
            error = (err as NSError).localizedDescription
        }
    }
}

@MainActor
public final class ConnectBasiqViewModel: ObservableObject {
    @Published public private(set) var error: String?
    @Published public private(set) var isConnecting = false
    @Published public private(set) var consentUrl: URL?
    @Published public private(set) var connectionsAttached: Int = 0

    public init() {}

    /// Step 1: Open the hosted-consent flow. Server creates the Basiq user
    /// lazily (idempotent) and returns the URL the user opens to pick a bank.
    public func start() async {
        error = nil
        isConnecting = true
        defer { isConnecting = false }
        struct Body: Encodable {}
        struct Response: Decodable { let url: String; let sessionId: String; let basiqUserId: String }
        do {
            let response: Response = try await APIClient.shared.post("/api/connect/basiq", body: Body())
            guard let url = URL(string: response.url), !response.url.isEmpty else {
                error = "Couldn't build the Basiq consent URL."
                return
            }
            consentUrl = url
        } catch let err {
            error = (err as NSError).localizedDescription
        }
    }

    /// Step 2: After the user finishes Basiq's hosted flow and returns to
    /// the app, poll the server to register every connection they linked.
    /// Triggers a background sync for each new connection.
    public func finalise() async {
        error = nil
        isConnecting = true
        defer { isConnecting = false }
        struct Body: Encodable {}
        struct ConnectionRow: Decodable { let connectionId: String; let institution: String }
        struct Response: Decodable { let ok: Bool; let connections: [ConnectionRow] }
        struct SyncBody: Encodable {}
        struct SyncResponse: Decodable { let ok: Bool? }
        do {
            let response: Response = try await APIClient.shared.post(
                "/api/connect/basiq/finalise",
                body: Body()
            )
            connectionsAttached = response.connections.count
            // Kick off a background backfill so transactions start arriving
            // without the user having to wait on a 60s function.
            Task.detached(priority: .background) {
                let _: SyncResponse? = try? await APIClient.shared.post("/api/sync", body: SyncBody())
            }
        } catch let err {
            error = (err as NSError).localizedDescription
        }
    }
}

