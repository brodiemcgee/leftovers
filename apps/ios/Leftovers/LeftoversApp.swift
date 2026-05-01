import SwiftUI
import LeftoversCore

@main
struct LeftoversApp: App {
    @StateObject private var session = SessionStore()

    init() {
        Telemetry.bootstrap()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .task { await session.bootstrap() }
        }
    }
}
