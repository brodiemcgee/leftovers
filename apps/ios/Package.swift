// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Leftovers",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "LeftoversCore", targets: ["LeftoversCore"]),
    ],
    dependencies: [
        .package(url: "https://github.com/supabase/supabase-swift", from: "2.20.0"),
        .package(url: "https://github.com/getsentry/sentry-cocoa", from: "8.39.0"),
    ],
    targets: [
        .target(
            name: "LeftoversCore",
            dependencies: [
                .product(name: "Supabase", package: "supabase-swift"),
                .product(name: "Sentry", package: "sentry-cocoa"),
            ],
            path: "Sources/LeftoversCore"
        ),
        .testTarget(
            name: "LeftoversCoreTests",
            dependencies: ["LeftoversCore"],
            path: "Tests/LeftoversCoreTests"
        ),
    ]
)
