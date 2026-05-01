import XCTest
@testable import LeftoversCore

final class MoneyTests: XCTestCase {
    func testFormat() {
        XCTAssertEqual(Money.format(cents: 347900), "$3,479.00")
        XCTAssertEqual(Money.format(cents: 0), "$0.00")
        XCTAssertEqual(Money.format(cents: 5050, sign: .always), "+$50.50")
        XCTAssertEqual(Money.format(cents: -100, sign: .never), "$1.00")
    }
}
