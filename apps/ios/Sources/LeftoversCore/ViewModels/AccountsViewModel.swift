import Foundation
import Supabase

@MainActor
public final class AccountsViewModel: ObservableObject {
    @Published public private(set) var accounts: [AccountSummary] = []

    public init() {}

    public func load() async {
        do {
            let res: PostgrestResponse<[AccountSummary]> = try await SupabaseProvider.shared.client.database
                .from("accounts")
                .select("id, display_name, account_type, balance_cents")
                .eq("is_active", value: true)
                .order("balance_cents", ascending: false)
                .execute()
            self.accounts = res.value
        } catch {
            // Stale cache shown
        }
    }
}
