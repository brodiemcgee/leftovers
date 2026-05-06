import Foundation

@MainActor
public final class TransactionDetailViewModel: ObservableObject {
    @Published public private(set) var detail: TransactionDetail?
    @Published public private(set) var isLoading = false
    @Published public private(set) var isSaving = false
    @Published public private(set) var error: String?
    @Published public var selectedCategorySlug: String?
    @Published public var selectedClassification: Classification = .discretionary
    @Published public var applyToFuture: Bool = false
    @Published public var amortiseDays: Int = 1

    private let id: String
    private var initialCategorySlug: String?
    private var initialClassification: Classification?
    private var initialAmortiseDays: Int = 1

    public init(id: String) {
        self.id = id
    }

    public var hasChanges: Bool {
        selectedCategorySlug != initialCategorySlug
            || selectedClassification != initialClassification
            || applyToFuture
            || amortiseDays != initialAmortiseDays
    }

    public func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response: TransactionDetailResponse = try await APIClient.shared.get(
                "/api/transactions/\(id)"
            )
            detail = response.transaction
            selectedCategorySlug = response.transaction.categorySlug
            initialCategorySlug = selectedCategorySlug
            selectedClassification = response.transaction.classification ?? .discretionary
            initialClassification = selectedClassification
            amortiseDays = response.transaction.amortiseDays ?? 1
            initialAmortiseDays = amortiseDays
            applyToFuture = false
        } catch let err {
            error = (err as NSError).localizedDescription
        }
    }

    public func save() async {
        guard let _ = detail else { return }
        isSaving = true
        defer { isSaving = false }
        let body = PatchBody(
            categorySlug: selectedCategorySlug,
            classification: selectedClassification.rawValue,
            applyToFutureFromMerchant: applyToFuture,
            amortiseDays: amortiseDays
        )
        do {
            let _: AckResponse = try await APIClient.shared.patch(
                "/api/transactions/\(id)",
                body: body
            )
            await load()
        } catch let err {
            error = (err as NSError).localizedDescription
        }
    }
}

struct TransactionDetailResponse: Decodable {
    let transaction: TransactionDetail
}
struct PatchBody: Encodable {
    let categorySlug: String?
    let classification: String
    let applyToFutureFromMerchant: Bool
    let amortiseDays: Int
}
struct AckResponse: Decodable { let ok: Bool? }
