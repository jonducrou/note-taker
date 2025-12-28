import Foundation

/// Writer for serialising notes to markdown with YAML frontmatter
struct NoteWriter {
    private static let frontmatterDelimiter = "---"

    /// Write a note to string format
    static func write(_ note: Note) throws -> String {
        var output = ""

        // Write YAML frontmatter
        output += frontmatterDelimiter + "\n"
        output += writeYAML(note.metadata)
        output += frontmatterDelimiter + "\n"

        // Write content (strip any existing aggregated content)
        let cleanContent = stripAggregatedContent(note.content)
        if !cleanContent.isEmpty {
            output += "\n" + cleanContent
        }

        return output
    }

    // MARK: - YAML Writing

    private static func writeYAML(_ metadata: NoteMetadata) -> String {
        var yaml = ""

        yaml += "date: \(metadata.date)\n"

        if let group = metadata.group {
            yaml += "group: \(group)\n"
        }

        if let audience = metadata.audience, !audience.isEmpty {
            if audience.count == 1 {
                yaml += "audience: \(audience[0])\n"
            } else {
                yaml += "audience:\n"
                for member in audience {
                    yaml += "  - \(member)\n"
                }
            }
        }

        yaml += "created_at: \(formatISO8601(metadata.createdAt))\n"
        yaml += "updated_at: \(formatISO8601(metadata.updatedAt))\n"

        return yaml
    }

    // MARK: - Content Cleaning

    /// Remove aggregated content (everything after --------)
    private static func stripAggregatedContent(_ content: String) -> String {
        let separator = "--------"
        if let range = content.range(of: separator) {
            return String(content[..<range.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return content
    }

    // MARK: - Date Formatting

    private static func formatISO8601(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}
