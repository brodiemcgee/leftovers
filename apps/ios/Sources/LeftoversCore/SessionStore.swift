import AuthenticationServices
import Foundation
import Supabase

@MainActor
public final class SessionStore: ObservableObject {
    public enum State: Equatable {
        case loading, signedOut, needsOnboarding, signedIn, error(String)
    }

    @Published public private(set) var state: State = .loading
    @Published public private(set) var accessToken: String?
    @Published public private(set) var userId: String?

    private let client = SupabaseProvider.shared.client

    public init() {}

    public func bootstrap() async {
        do {
            let session = try await client.auth.session
            accessToken = session.accessToken
            userId = session.user.id.uuidString
            persistSharedAuth(session)
            let onboarded = try await isOnboarded(userId: session.user.id.uuidString)
            state = onboarded ? .signedIn : .needsOnboarding
        } catch {
            state = .signedOut
        }
    }

    /// Mirror the current Supabase session into the App Group so the widget
    /// extension and the BGAppRefreshTask handler can call /api/headroom on
    /// their own. Stores the access token, its expiry, and the API base URL.
    private func persistSharedAuth(_ session: Session) {
        let expires = Date(timeIntervalSince1970: TimeInterval(session.expiresAt))
        SharedAuthStore.write(
            SharedAuth(
                accessToken: session.accessToken,
                expiresAt: expires,
                apiBaseURL: AppEnvironment.apiBaseURL.absoluteString
            )
        )
    }

    public func signInWithApple(from result: Result<ASAuthorization, Error>) async throws {
        switch result {
        case .failure(let error):
            throw error
        case .success(let auth):
            guard
                let credential = auth.credential as? ASAuthorizationAppleIDCredential,
                let identityTokenData = credential.identityToken,
                let idToken = String(data: identityTokenData, encoding: .utf8)
            else {
                throw NSError(domain: "Leftovers.SignInWithApple", code: -1)
            }

            let session = try await client.auth.signInWithIdToken(
                credentials: .init(provider: .apple, idToken: idToken)
            )
            accessToken = session.accessToken
            userId = session.user.id.uuidString
            persistSharedAuth(session)
            let onboarded = try await isOnboarded(userId: session.user.id.uuidString)
            state = onboarded ? .signedIn : .needsOnboarding
        }
    }

    public func signOut() async {
        do {
            try await client.auth.signOut()
        } catch {
            // Best-effort.
        }
        accessToken = nil
        userId = nil
        SharedAuthStore.clear()
        state = .signedOut
    }

    public func completeOnboarding() async {
        state = .signedIn
    }

    private func isOnboarded(userId: String) async throws -> Bool {
        // A user is "onboarded" once they have at least one active connection AND a pay cycle.
        let connRes = try await client
            .from("connections")
            .select("id", head: true, count: .exact)
            .eq("user_id", value: userId)
            .eq("status", value: "active")
            .execute()
        let payRes = try await client
            .from("pay_cycles")
            .select("id", head: true, count: .exact)
            .eq("user_id", value: userId)
            .eq("is_active", value: true)
            .execute()
        return (connRes.count ?? 0) > 0 && (payRes.count ?? 0) > 0
    }
}
