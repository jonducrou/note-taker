import os.log
import Foundation

/// Centralised logging using OSLog
enum Logger {
    // MARK: - Log Categories

    private static let subsystem = Bundle.main.bundleIdentifier ?? "com.notetaker"

    static let transcription = OSLog(subsystem: subsystem, category: "transcription")
    static let storage = OSLog(subsystem: subsystem, category: "storage")
    static let navigation = OSLog(subsystem: subsystem, category: "navigation")
    static let actions = OSLog(subsystem: subsystem, category: "actions")
    static let ui = OSLog(subsystem: subsystem, category: "ui")
    static let general = OSLog(subsystem: subsystem, category: "general")

    // MARK: - Convenience Methods

    static func debug(_ message: String, log: OSLog = general) {
        os_log("%{public}@", log: log, type: .debug, message)
    }

    static func info(_ message: String, log: OSLog = general) {
        os_log("%{public}@", log: log, type: .info, message)
    }

    static func error(_ message: String, log: OSLog = general) {
        os_log("%{public}@", log: log, type: .error, message)
    }

    static func fault(_ message: String, log: OSLog = general) {
        os_log("%{public}@", log: log, type: .fault, message)
    }
}
