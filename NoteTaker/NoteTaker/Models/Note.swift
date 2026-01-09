import Foundation

struct Note: Identifiable, Codable, Equatable {
    let id: String  // Filename without extension: YYYY-MM-DD_HHMMSS
    var metadata: NoteMetadata
    var content: String

    var filename: String {
        "\(id).md"
    }

    /// Formatted date for display: "Tue 26 Aug 14:31"
    var formattedDate: String {
        guard let date = parseDate(from: id) else {
            return "Note Taker"
        }

        let formatter = DateFormatter()
        formatter.dateFormat = "EEE d MMM HH:mm"
        return formatter.string(from: date)
    }

    /// Count of incomplete actions and connections
    var incompleteItemCount: Int {
        countIncompleteItems(in: content)
    }

    /// Extract group from content (first #tag)
    var group: String? {
        let pattern = #"#([a-zA-Z][a-zA-Z0-9_-]*)"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: content, range: NSRange(content.startIndex..., in: content)),
              let range = Range(match.range(at: 1), in: content) else {
            return nil
        }
        return String(content[range])
    }

    /// Extract audience members from content (@name tags)
    var audience: [String] {
        let pattern = #"@([a-zA-Z][a-zA-Z0-9_-]*)"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            return []
        }

        // Only parse first line (before aggregation separator)
        let firstLine = content.components(separatedBy: "\n").first ?? ""
        let matches = regex.matches(in: firstLine, range: NSRange(firstLine.startIndex..., in: firstLine))

        return matches.compactMap { match in
            guard let range = Range(match.range(at: 1), in: firstLine) else { return nil }
            return String(firstLine[range])
        }
    }

    // MARK: - Private Helpers

    private func parseDate(from noteId: String) -> Date? {
        // Format: YYYY-MM-DD_HHMMSS
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd_HHmmss"
        return formatter.date(from: noteId)
    }

    private func countIncompleteItems(in text: String) -> Int {
        var count = 0

        // Count incomplete actions: []
        let actionPattern = #"\[\s*\]"#
        if let regex = try? NSRegularExpression(pattern: actionPattern) {
            count += regex.numberOfMatches(in: text, range: NSRange(text.startIndex..., in: text))
        }

        // Count incomplete connections: -> and <-
        let connectionPattern = #"\w+\s*->\s*\w+|\w+\s*<-\s*\w+"#
        if let regex = try? NSRegularExpression(pattern: connectionPattern) {
            // Only count if not already completed (-/> or </-)
            let incompleteConnections = regex.matches(in: text, range: NSRange(text.startIndex..., in: text))
            for match in incompleteConnections {
                if let range = Range(match.range, in: text) {
                    let matchText = String(text[range])
                    if !matchText.contains("/") && !matchText.contains("\\") {
                        count += 1
                    }
                }
            }
        }

        return count
    }
}

// MARK: - Convenience Initialisers

extension Note {
    /// Create a new note with current timestamp
    static func create(content: String = "") -> Note {
        let now = Date()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd_HHmmss"
        let id = formatter.string(from: now)

        let metadata = NoteMetadata(
            date: formatDate(now),
            group: nil,
            audience: nil,
            createdAt: now,
            updatedAt: now
        )

        return Note(id: id, metadata: metadata, content: content)
    }

    private static func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}
