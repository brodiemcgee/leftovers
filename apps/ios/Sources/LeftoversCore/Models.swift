import Foundation

public struct HeadroomNumbers: Codable, Equatable {
    public let periodStart: Date
    public let periodEnd: Date
    public let forecastIncomeCents: Int64
    public let forecastFixedCents: Int64
    public let spentDiscretionaryCents: Int64
    public let headroomCents: Int64
    public let daysRemaining: Int
    public let dailyBurnCents: Int64
}

public enum PaceState: String, Codable { case ahead, onTrack = "on_track", behind }
public struct Pace: Codable, Equatable { public let state: PaceState; public let reason: String }

public struct SubBudgetProgress: Codable, Identifiable, Equatable {
    public let id: String
    public let name: String
    public let targetCents: Int64
    public let spentCents: Int64
    public let isCatchall: Bool
    public let displayOrder: Int
}

public struct UpcomingItem: Codable, Identifiable, Equatable {
    public let id: String
    public let name: String
    public let amountCents: Int64
    public let nextExpectedDate: String
    public var nextExpectedDateFormatted: String {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.locale = .init(identifier: "en_AU")
        if let d = ISO8601DateFormatter().date(from: nextExpectedDate + "T00:00:00Z") {
            return f.string(from: d)
        }
        return nextExpectedDate
    }
}

public struct HomeSnapshot: Codable, Equatable {
    public let asOf: Date
    public let headroom: HeadroomNumbers
    public let burnRateCents: Int64
    public let subBudgets: [SubBudgetProgress]
    public let upcoming: [UpcomingItem]
    public let pace: Pace
}

public struct TransactionListItem: Codable, Identifiable, Equatable {
    public let id: String
    public let postedAt: Date
    public let amountCents: Int64
    public let merchantRaw: String?
    public let merchantNormalised: String?
    public let description: String?
    public let classification: Classification?
    public let categoryId: String?
    public let pairedTransactionId: String?

    public var merchantDisplay: String { merchantNormalised ?? merchantRaw ?? description ?? "—" }
    public var classificationLabel: String? { classification?.displayName }
}

public enum Classification: String, Codable, CaseIterable, Equatable {
    case fixed, discretionary, internalTransfer = "internal", income, refund

    public var displayName: String {
        switch self {
        case .fixed: return "Fixed"
        case .discretionary: return "Discretionary"
        case .internalTransfer: return "Internal transfer"
        case .income: return "Income"
        case .refund: return "Refund"
        }
    }
}

public enum Cadence: String, Codable, CaseIterable {
    case weekly, fortnightly, monthly, fourWeekly = "four_weekly", irregular
    public var displayName: String {
        switch self {
        case .weekly: return "Weekly"
        case .fortnightly: return "Fortnightly"
        case .monthly: return "Monthly"
        case .fourWeekly: return "Every four weeks"
        case .irregular: return "Irregular"
        }
    }
}

public struct PayCandidate: Codable, Identifiable, Equatable {
    public var id: String { payerName + anchorDate + String(amountEstimateCents) }
    public let payerName: String
    public let cadence: Cadence
    public let anchorDate: String
    public let amountEstimateCents: Int64
    public let amountVarianceCents: Int64
    public let occurrences: Int
    public let confidence: Double
    public var cadenceLabel: String { cadence.displayName }
}

public struct FixedObligationCandidate: Codable, Identifiable, Equatable {
    public var id: String { merchantNormalised + String(amountCents) }
    public let merchantRaw: String
    public let merchantNormalised: String
    public let amountCents: Int64
    public let cadence: Cadence
    public let expectedDayOfMonth: Int?
    public let occurrences: Int
    public let isLikelyMortgageOrRent: Bool
    public var cadenceLabel: String { cadence.displayName }
}

public struct AccountSummary: Codable, Identifiable, Equatable {
    public let id: String
    public let displayName: String
    public let accountType: String
    public let balanceCents: Int64
    public var accountTypeLabel: String { accountType.replacingOccurrences(of: "_", with: " ").capitalized }
}

public struct ConnectionSummary: Codable, Identifiable, Equatable {
    public let id: String
    public let displayName: String
    public let source: String
    public let status: String
    public let lastSyncedAt: Date?
    public let lastSyncError: String?
    public var statusLabel: String {
        if let err = lastSyncError { return "Last sync error: \(err)" }
        if let last = lastSyncedAt {
            let f = RelativeDateTimeFormatter()
            return "Synced \(f.localizedString(for: last, relativeTo: Date()))"
        }
        return "Pending first sync"
    }
}

public struct UserPayCycle: Codable, Identifiable, Equatable {
    public let id: String
    public let payerName: String
    public let cadence: Cadence
    public let anchorDate: String
    public let amountEstimateCents: Int64
    public let isPrimary: Bool
    public let isActive: Bool
    public var cadenceLabel: String { cadence.displayName }
}

public struct FixedObligationRow: Codable, Identifiable, Equatable {
    public let id: String
    public let name: String
    public let amountCents: Int64
    public let cadence: Cadence
    public let expectedDayOfMonth: Int?
    public let nextExpectedDate: String?
    public let isActive: Bool
    public let accountId: String?
    public let categoryId: String?
}

public struct UserRule: Codable, Identifiable, Equatable {
    public let id: String
    public let merchantPattern: String
    public let classification: Classification
    public let categoryId: String?
}

public struct SettingsSnapshot: Codable, Equatable {
    public let user: UserRow
    public let payCycles: [UserPayCycle]
    public let fixedObligations: [FixedObligationRow]
    public let connections: [ConnectionSummary]
    public let userRules: [UserRule]
}

public struct UserRow: Codable, Equatable {
    public let id: String
    public let email: String?
    public let displayName: String?
    public let timezone: String
    public let llmCategorisationEnabled: Bool
}

public struct QuickAddResponse: Codable, Equatable {
    public let proposedAmountCents: Int64
    public let currentHeadroomCents: Int64
    public let projectedHeadroomCents: Int64
    public let projectedDailyAllowanceCents: Int64
    public let daysRemaining: Int
    public let goesNegative: Bool
}

public struct TransactionDetail: Codable, Equatable {
    public let id: String
    public let postedAt: Date
    public let amountCents: Int64
    public let merchantRaw: String?
    public let merchantNormalised: String?
    public let description: String?
    public let location: String?
    public let classification: Classification?
    public let classifiedBy: String?
    public let confidenceScore: Double?
    public let classificationReasoning: String?
    public let categoryId: String?
    public let pairedTransactionId: String?
    public let accountId: String

    public var postedAtFormatted: String {
        let f = DateFormatter()
        f.locale = .init(identifier: "en_AU")
        f.dateStyle = .medium
        f.timeStyle = .short
        return f.string(from: postedAt)
    }
}

public enum Category: CaseIterable {
    case groceries, foodDrink, fuel, transport, subscriptionsTech, telco, utilities,
         mortgage, rent, insurance, medical, healthBeauty, fitnessRecreation,
         entertainment, shopping, travel, education, giftsDonations, alcohol,
         homeMaintenance, financialFees, cashWithdrawal, internalTransfer,
         incomeSalary, incomeRefund, incomeOther, other

    public var slug: String {
        switch self {
        case .groceries: return "groceries"
        case .foodDrink: return "food_drink"
        case .fuel: return "fuel"
        case .transport: return "transport"
        case .subscriptionsTech: return "subscriptions_tech"
        case .telco: return "telco"
        case .utilities: return "utilities"
        case .mortgage: return "mortgage"
        case .rent: return "rent"
        case .insurance: return "insurance"
        case .medical: return "medical"
        case .healthBeauty: return "health_beauty"
        case .fitnessRecreation: return "fitness_recreation"
        case .entertainment: return "entertainment"
        case .shopping: return "shopping"
        case .travel: return "travel"
        case .education: return "education"
        case .giftsDonations: return "gifts_donations"
        case .alcohol: return "alcohol"
        case .homeMaintenance: return "home_maintenance"
        case .financialFees: return "financial_fees"
        case .cashWithdrawal: return "cash_withdrawal"
        case .internalTransfer: return "internal_transfer"
        case .incomeSalary: return "income_salary"
        case .incomeRefund: return "income_refund"
        case .incomeOther: return "income_other"
        case .other: return "other"
        }
    }

    public var displayName: String {
        slug.replacingOccurrences(of: "_", with: " ").capitalized
    }
}
