import Foundation

/// Parser for note files with YAML frontmatter
struct NoteParser {
    private static let frontmatterDelimiter = "---"

    /// Parse a note file into metadata and content
    static func parse(_ fileContent: String) throws -> (NoteMetadata, String) {
        let lines = fileContent.components(separatedBy: "\n")

        // Check for YAML frontmatter
        guard lines.first == frontmatterDelimiter else {
            // No frontmatter, treat entire content as body
            return (createDefaultMetadata(), fileContent)
        }

        // Find the closing delimiter
        var frontmatterEndIndex: Int?
        for (index, line) in lines.enumerated() where index > 0 {
            if line == frontmatterDelimiter {
                frontmatterEndIndex = index
                break
            }
        }

        guard let endIndex = frontmatterEndIndex else {
            // Malformed frontmatter, treat as regular content
            return (createDefaultMetadata(), fileContent)
        }

        // Extract YAML content
        let yamlLines = Array(lines[1..<endIndex])
        let yamlContent = yamlLines.joined(separator: "\n")

        // Extract body content (skip frontmatter and any leading newlines)
        let bodyLines = Array(lines[(endIndex + 1)...])
        let body = bodyLines.joined(separator: "\n").trimmingCharacters(in: .newlines)

        // Parse YAML
        let metadata = try parseYAML(yamlContent)

        return (metadata, body)
    }

    // MARK: - YAML Parsing (Simple implementation without external dependency)

    private static func parseYAML(_ yaml: String) throws -> NoteMetadata {
        var dict: [String: Any] = [:]
        var currentKey: String?
        var currentArrayValues: [String] = []
        var inArray = false

        let lines = yaml.components(separatedBy: "\n")

        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            // Skip empty lines
            if trimmed.isEmpty { continue }

            // Check for array item
            if trimmed.hasPrefix("- ") && inArray, let key = currentKey {
                let value = String(trimmed.dropFirst(2)).trimmingCharacters(in: .whitespaces)
                currentArrayValues.append(value)
                continue
            }

            // Save previous array if we were building one
            if inArray, let key = currentKey, !currentArrayValues.isEmpty {
                dict[key] = currentArrayValues
                currentArrayValues = []
                inArray = false
            }

            // Parse key: value
            if let colonIndex = trimmed.firstIndex(of: ":") {
                let key = String(trimmed[..<colonIndex]).trimmingCharacters(in: .whitespaces)
                let valueStart = trimmed.index(after: colonIndex)
                let value = String(trimmed[valueStart...]).trimmingCharacters(in: .whitespaces)

                if value.isEmpty {
                    // This might be an array
                    currentKey = key
                    inArray = true
                } else if value.hasPrefix("[") && value.hasSuffix("]") {
                    // Inline array: [item1, item2]
                    let inner = String(value.dropFirst().dropLast())
                    let items = inner.components(separatedBy: ",").map {
                        $0.trimmingCharacters(in: .whitespaces)
                    }
                    dict[key] = items
                } else {
                    dict[key] = value
                }
            }
        }

        // Save final array if we were building one
        if inArray, let key = currentKey, !currentArrayValues.isEmpty {
            dict[key] = currentArrayValues
        }

        return createMetadata(from: dict)
    }

    private static func createMetadata(from dict: [String: Any]) -> NoteMetadata {
        let date = dict["date"] as? String ?? formatDate(Date())

        let group = dict["group"] as? String

        var audience: [String]?
        if let audienceArray = dict["audience"] as? [String] {
            audience = audienceArray
        } else if let audienceString = dict["audience"] as? String {
            audience = [audienceString]
        }

        let createdAt: Date
        if let createdString = dict["created_at"] as? String {
            createdAt = parseISO8601(createdString) ?? Date()
        } else {
            createdAt = Date()
        }

        let updatedAt: Date
        if let updatedString = dict["updated_at"] as? String {
            updatedAt = parseISO8601(updatedString) ?? Date()
        } else {
            updatedAt = Date()
        }

        return NoteMetadata(
            date: date,
            group: group,
            audience: audience,
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }

    private static func createDefaultMetadata() -> NoteMetadata {
        let now = Date()
        return NoteMetadata(
            date: formatDate(now),
            group: nil,
            audience: nil,
            createdAt: now,
            updatedAt: now
        )
    }

    private static func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private static func parseISO8601(_ string: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: string) {
            return date
        }
        // Try without fractional seconds
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: string)
    }
}
