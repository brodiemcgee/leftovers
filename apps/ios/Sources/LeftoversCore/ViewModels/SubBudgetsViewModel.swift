import Foundation

@MainActor
public final class SubBudgetsViewModel: ObservableObject {
    @Published public private(set) var items: [SubBudgetProgress] = []
    @Published public private(set) var isLoading = false
    @Published public private(set) var error: String?

    public init() {}

    public func load() async {
        isLoading = true
        defer { isLoading = false }
        struct Response: Decodable { let subBudgets: [SubBudgetProgress] }
        do {
            let r: Response = try await APIClient.shared.get("/api/sub-budgets")
            items = r.subBudgets
            error = nil
        } catch {
            self.error = (error as NSError).localizedDescription
        }
    }

    public func delete(at offsets: IndexSet) async {
        let toDelete = offsets.map { items[$0] }
        items.remove(atOffsets: offsets)
        for item in toDelete where !item.isCatchall {
            try? await APIClient.shared.delete("/api/sub-budgets/\(item.id)")
        }
    }

    public func delete(_ item: SubBudgetProgress) async {
        guard !item.isCatchall else { return }
        items.removeAll { $0.id == item.id }
        try? await APIClient.shared.delete("/api/sub-budgets/\(item.id)")
    }
}

public enum SubBudgetAllocation: String, CaseIterable, Identifiable {
    case fixed
    case percentage
    public var id: String { rawValue }
    public var label: String {
        switch self {
        case .fixed: return "Fixed dollar amount"
        case .percentage: return "% of headroom (capped)"
        }
    }
}

@MainActor
public final class SubBudgetEditorViewModel: ObservableObject {
    @Published public var name: String = ""
    @Published public var allocation: SubBudgetAllocation = .fixed
    @Published public var targetString: String = ""
    @Published public var percentageString: String = ""
    @Published public var capString: String = ""
    @Published public var receivesOverflow: Bool = false
    @Published public var categorySlug: String? = nil
    @Published public private(set) var availableCategories: [CategoryOption] = []
    @Published public private(set) var error: String?

    private var existingId: String?

    public init() {}

    public func prefill(from snapshot: SubBudgetProgress) {
        existingId = snapshot.id
        name = snapshot.name
        if let pct = snapshot.percentage {
            allocation = .percentage
            percentageString = String(format: "%g", pct)
        } else {
            allocation = .fixed
        }
        targetString = String(format: "%.2f", Double(snapshot.targetCents) / 100.0)
        if let cap = snapshot.capCents {
            capString = String(format: "%.2f", Double(cap) / 100.0)
        }
        receivesOverflow = snapshot.receivesOverflow ?? false
        // Category id-to-slug mapping happens after categories load.
        pendingCategoryId = snapshot.categoryId
    }

    private var pendingCategoryId: String?

    public func loadCategories() async {
        struct Response: Decodable {
            struct Cat: Decodable { let id: String; let slug: String; let name: String }
            let categories: [Cat]
        }
        do {
            let r: Response = try await APIClient.shared.get("/api/categories")
            availableCategories = r.categories.map { CategoryOption(slug: $0.slug, name: $0.name) }
            // Resolve pending category id → slug if we got a snapshot before
            // categories loaded.
            if let pendingId = pendingCategoryId {
                let cat = r.categories.first { $0.id == pendingId }
                categorySlug = cat?.slug
                pendingCategoryId = nil
            }
        } catch {
            availableCategories = SubBudgetEditorViewModel.fallbackCategories
        }
    }

    public func save() async {
        error = nil
        let trimmedName = name.trimmingCharacters(in: .whitespaces)
        guard !trimmedName.isEmpty else {
            error = "Give the envelope a name."
            return
        }

        struct Body: Encodable {
            let id: String?
            let name: String
            let targetCents: Int64
            let categorySlug: String?
            let displayOrder: Int
            let percentage: Double?
            let capCents: Int64?
            let receivesOverflow: Bool
        }

        var percentage: Double? = nil
        var capCents: Int64? = nil
        var targetCents: Int64 = 0

        switch allocation {
        case .fixed:
            guard let cents = PayCycleEditorViewModel.parseAmountToCents(targetString), cents >= 0 else {
                error = "Enter a valid dollar amount, e.g. 250.00"
                return
            }
            targetCents = cents
        case .percentage:
            guard let pct = Double(percentageString.replacingOccurrences(of: "%", with: "").trimmingCharacters(in: .whitespaces)),
                  pct >= 0, pct <= 100 else {
                error = "Percentage must be between 0 and 100."
                return
            }
            percentage = pct
            if !capString.trimmingCharacters(in: .whitespaces).isEmpty {
                guard let cap = PayCycleEditorViewModel.parseAmountToCents(capString), cap > 0 else {
                    error = "Cap must be a positive dollar amount."
                    return
                }
                capCents = cap
                targetCents = cap // server overwrites, but be explicit
            }
        }

        let body = Body(
            id: existingId,
            name: trimmedName,
            targetCents: targetCents,
            categorySlug: categorySlug,
            displayOrder: 0,
            percentage: percentage,
            capCents: capCents,
            receivesOverflow: receivesOverflow
        )
        do {
            let _: AckResponse = try await APIClient.shared.post("/api/sub-budgets", body: body)
        } catch {
            self.error = (error as NSError).localizedDescription
        }
    }

    private static let fallbackCategories: [CategoryOption] = [
        .init(slug: "groceries", name: "Groceries"),
        .init(slug: "food_drink", name: "Food & drink"),
        .init(slug: "fuel", name: "Fuel"),
        .init(slug: "transport", name: "Transport"),
        .init(slug: "subscriptions_tech", name: "Tech subscriptions"),
        .init(slug: "telco", name: "Telco"),
        .init(slug: "utilities", name: "Utilities"),
        .init(slug: "medical", name: "Medical"),
        .init(slug: "health_beauty", name: "Health & beauty"),
        .init(slug: "fitness_recreation", name: "Fitness & recreation"),
        .init(slug: "entertainment", name: "Entertainment"),
        .init(slug: "shopping", name: "Shopping"),
        .init(slug: "travel", name: "Travel"),
        .init(slug: "education", name: "Education"),
        .init(slug: "alcohol", name: "Alcohol"),
        .init(slug: "home_maintenance", name: "Home maintenance"),
        .init(slug: "gifts_donations", name: "Gifts & donations"),
    ]
}

public struct CategoryOption: Equatable, Hashable {
    public let slug: String
    public let name: String
}
