// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "NoteTaker",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "NoteTaker", targets: ["NoteTaker"])
    ],
    dependencies: [
        .package(url: "https://github.com/jpsim/Yams.git", from: "5.0.0")
    ],
    targets: [
        .executableTarget(
            name: "NoteTaker",
            dependencies: ["Yams"],
            path: "NoteTaker",
            exclude: ["Info.plist", "NoteTaker.entitlements"],
            resources: [
                .process("Resources")
            ]
        ),
        .testTarget(
            name: "NoteTakerTests",
            dependencies: ["NoteTaker"],
            path: "NoteTakerTests"
        )
    ]
)
