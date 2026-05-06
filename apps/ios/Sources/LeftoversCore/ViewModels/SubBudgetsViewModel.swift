import Foundation

/// CRUD over sub-budget envelopes.
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
}

/// Editor for a single sub-budget — backs the New / Edit sheet.
@MainActor
public final class SubBudgetEditorViewModel: ObservableObject {
    @Published public var name: String = ""
    @Published public var targetString: String = ""
    @Published public var categorySlug: String? = nil
    @Published public private(set) var availableCategories: [CategoryOption] = []
    @Published public private(set) var error: String?

    private var existingId: String?

    public init() {}

    public func prefill(from snapshot: SubBudgetProgress) {
        existingId = snapshot.id
        name = snapshot.name
        targetString = String(format: "%.2f", Double(snapshot.targetCents) / 100.0)
        // Category slug isn't on the progress view; leave nil and let the
        // user re-pick. Most of the time editing is just a target tweak.
        categorySlug = nil
    }

    public func loadCategories() async {
        // Pull system + user categories that exist for this user.
        struct Response: Decodable {
            struct Cat: Decodable { let slug: String; let name: String }
            let categories: [Cat]
        }
        do {
            let r: Response = try await APIClient.shared.get("/api/categories")
            availableCategories = r.categories.map { CategoryOption(slug: $0.slug, name: $0.name) }
        } catch {
            // Fall back to a hard-coded list of system slugs so the picker is
            // still usable even if the categories endpoint isn't available.
            availableCategories = SubBudgetEditorViewModel.fallbackCategories
        }
    }

    public func save() async {
        error = nil
        guard let cents = PayCycleEditorViewModel.parseAmountToCents(targetString), cents >= 0 else {
            error = "Enter a valid target amount, e.g. 250.00"
            return
        }
        struct Body: Encodable {
            let id: String?
            let name: String
            let targetCents: Int64
            let categorySlug: String?
            let displayOrder: Int
        }
        let body = Body(
            id: existingId,
            name: name.trimmingCharacters(in: .whitespaces),
            targetCents: cents,
            categorySlug: categorySlug,
            displayOrder: 0
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
