import Foundation
import Supabase

/// Shared Supabase client. URL + anon key are baked in at app launch from
/// Info.plist values (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
public final class SupabaseProvider {
    public static let shared = SupabaseProvider()

    public let client: SupabaseClient

    private init() {
        guard
            let url = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            let key = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String,
            let parsed = URL(string: url)
        else {
            fatalError("SUPABASE_URL / SUPABASE_ANON_KEY missing in Info.plist")
        }
        self.client = SupabaseClient(supabaseURL: parsed, supabaseKey: key)
    }
}

public enum AppEnvironment {
    public static var apiBaseURL: URL {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
           let url = URL(string: raw) { return url }
        return URL(string: "https://leftovers.app")!
    }
}
