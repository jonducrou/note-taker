// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "NoteTaker",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "NoteTaker",
            targets: ["NoteTaker"]
        )
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "NoteTaker",
            dependencies: [],
            path: "Sources/NoteTaker"
        ),
        .testTarget(
            name: "NoteTakerTests",
            dependencies: ["NoteTaker"],
            path: "Tests/NoteTakerTests"
        )
    ]
)
