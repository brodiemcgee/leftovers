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

    public init() {}

    public func start() async {
        struct Body: Encodable { let basiqUserId: String }
        struct Response: Decodable { let url: String; let sessionId: String }
        do {
            // Basiq user IDs are server-generated; in MVP we issue one tied to the auth user.
            // The /api/connect/basiq POST creates a consent session and returns the URL.
            let response: Response = try await APIClient.shared.post(
                "/api/connect/basiq",
                body: Body(basiqUserId: "self")
            )
            if let url = URL(string: response.url) {
                await MainActor.run {
                    UIApplication.openHostedConsent(url)
                }
            }
        } catch let err {
            error = (err as NSError).localizedDescription
        }
    }
}

#if canImport(UIKit)
import UIKit

extension UIApplication {
    static func openHostedConsent(_ url: URL) {
        UIApplication.shared.open(url)
    }
}
#else
enum UIApplication { static func openHostedConsent(_ url: URL) {} }
#endif
