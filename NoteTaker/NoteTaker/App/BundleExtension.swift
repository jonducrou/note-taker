import Foundation

extension Bundle {
    /// Safe accessor for the module's resource bundle that doesn't crash if not found
    static var moduleOrNil: Bundle? {
        let bundleName = "NoteTaker_NoteTaker"

        let candidates = [
            // Main bundle's resource URL (for app bundles)
            Bundle.main.resourceURL,
            // Alongside the executable (for command-line tools)
            Bundle.main.bundleURL.appendingPathComponent("Contents/Resources"),
            // For SPM builds
            Bundle.main.bundleURL,
        ]

        for candidate in candidates {
            let bundlePath = candidate?.appendingPathComponent(bundleName + ".bundle")
            if let bundlePath = bundlePath, let bundle = Bundle(url: bundlePath) {
                return bundle
            }
        }

        return nil
    }
}
