import os.log
import Foundation

/// Centralised logging using OSLog with optional file logging
enum Logger {
    // MARK: - Log Categories

    private static let subsystem = Bundle.main.bundleIdentifier ?? "com.notetaker"

    static let transcription = OSLog(subsystem: subsystem, category: "transcription")
    static let storage = OSLog(subsystem: subsystem, category: "storage")
    static let navigation = OSLog(subsystem: subsystem, category: "navigation")
    static let actions = OSLog(subsystem: subsystem, category: "actions")
    static let ui = OSLog(subsystem: subsystem, category: "ui")
    static let general = OSLog(subsystem: subsystem, category: "general")

    // MARK: - File Logging

    private static var isDebugLoggingEnabled: Bool {
        UserDefaults.standard.bool(forKey: "debug_logging_enabled")
    }

    private static var logFileURL: URL {
        let notesDir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Documents/Notes")
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        let filename = "debug-\(dateFormatter.string(from: Date())).log"
        return notesDir.appendingPathComponent(filename)
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.SSS"
        return formatter
    }()

    private static func writeToFile(_ message: String, level: String, category: String) {
        guard isDebugLoggingEnabled else { return }

        let timestamp = dateFormatter.string(from: Date())
        let logLine = "[\(timestamp)] [\(level)] [\(category)] \(message)\n"

        do {
            let fileURL = logFileURL
            if FileManager.default.fileExists(atPath: fileURL.path) {
                let handle = try FileHandle(forWritingTo: fileURL)
                handle.seekToEndOfFile()
                if let data = logLine.data(using: .utf8) {
                    handle.write(data)
                }
                handle.closeFile()
            } else {
                try logLine.write(to: fileURL, atomically: true, encoding: .utf8)
            }
        } catch {
            // Can't log the logging error - just continue
        }
    }

    private static func categoryName(for log: OSLog) -> String {
        if log === transcription { return "transcription" }
        if log === storage { return "storage" }
        if log === navigation { return "navigation" }
        if log === actions { return "actions" }
        if log === ui { return "ui" }
        return "general"
    }

    // MARK: - Convenience Methods

    static func debug(_ message: String, log: OSLog = general) {
        os_log("%{public}@", log: log, type: .debug, message)
        writeToFile(message, level: "DEBUG", category: categoryName(for: log))
    }

    static func info(_ message: String, log: OSLog = general) {
        os_log("%{public}@", log: log, type: .info, message)
        writeToFile(message, level: "INFO", category: categoryName(for: log))
    }

    static func error(_ message: String, log: OSLog = general) {
        os_log("%{public}@", log: log, type: .error, message)
        writeToFile(message, level: "ERROR", category: categoryName(for: log))
    }

    static func fault(_ message: String, log: OSLog = general) {
        os_log("%{public}@", log: log, type: .fault, message)
        writeToFile(message, level: "FAULT", category: categoryName(for: log))
    }
}
