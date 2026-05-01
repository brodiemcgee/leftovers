import Foundation

@MainActor
public final class SettingsViewModel: ObservableObject {
    @Published public private(set) var snapshot: SettingsSnapshot?
    @Published public private(set) var isLoading = false
    @Published public private(set) var error: String?
    @Published public var llmEnabled: Bool = true

    public init() {}

    public func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let result: SettingsSnapshot = try await APIClient.shared.get("/api/settings")
            snapshot = result
            llmEnabled = result.user.llmCategorisationEnabled
        } catch let err {
            error = (err as NSError).localizedDescription
        }
    }

    public func setLlm(_ enabled: Bool) async {
        do {
            let _: AckResponse = try await APIClient.shared.patch(
                "/api/settings",
                body: ["llmCategorisationEnabled": enabled]
            )
        } catch {
            llmEnabled = !enabled
        }
    }
}
