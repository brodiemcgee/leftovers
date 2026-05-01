import Foundation

public enum Money {
    public enum Sign { case never, auto, always }

    public static func format(cents: Int64, sign: Sign = .auto, currency: String = "AUD") -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = Locale(identifier: "en_AU")
        formatter.currencyCode = currency
        formatter.maximumFractionDigits = 2
        formatter.minimumFractionDigits = 2
        let value = NSDecimalNumber(value: cents).dividing(by: 100)
        var s = formatter.string(from: value) ?? "$0.00"
        switch sign {
        case .never:
            s = s.replacingOccurrences(of: "-", with: "")
        case .always:
            if cents > 0 { s = "+\(s)" }
        case .auto:
            break
        }
        return s
    }
}
