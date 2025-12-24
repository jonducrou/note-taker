import Foundation

/// Manages note storage and retrieval
class FileStorage: ObservableObject {
    private let notesDirectory: URL
    private var notesCache: [Note]?
    private var cacheTimestamp: Date?
    private let cacheTTL: TimeInterval = 5.0

    init() {
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        self.notesDirectory = documentsPath.appendingPathComponent("Notes")
        ensureNotesDirectory()
    }

    // MARK: - Directory Management

    private func ensureNotesDirectory() {
        if !FileManager.default.fileExists(atPath: notesDirectory.path) {
            try? FileManager.default.createDirectory(at: notesDirectory, withIntermediateDirectories: true)
        }
    }

    func invalidateCache() {
        notesCache = nil
        cacheTimestamp = nil
    }

    // MARK: - Filename Generation

    private func generateFilename() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd_HHmmss"
        return "\(formatter.string(from: Date())).md"
    }

    private func getLocalDateString(_ date: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    // MARK: - Metadata Extraction

    func extractMetadata(from content: String) -> (group: String?, audience: [String]?) {
        var group: String?
        var audience: [String] = []

        // Extract group: #groupname
        if let groupRange = content.range(of: #"#([^\s#@]+)"#, options: .regularExpression) {
            let match = String(content[groupRange])
            group = String(match.dropFirst())
        }

        // Extract audience: @person or @audience:person1,person2
        let audiencePattern = #"@audience:([^\n@]+)"#
        if let audienceRange = content.range(of: audiencePattern, options: .regularExpression) {
            let match = String(content[audienceRange])
            let names = match.replacingOccurrences(of: "@audience:", with: "")
            audience = names.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        } else {
            // New format: @name
            let pattern = #"@([a-zA-Z][a-zA-Z0-9_-]*)"#
            let regex = try? NSRegularExpression(pattern: pattern)
            let nsContent = content as NSString
            let matches = regex?.matches(in: content, range: NSRange(location: 0, length: nsContent.length)) ?? []

            for match in matches {
                if match.numberOfRanges > 1 {
                    let range = match.range(at: 1)
                    let name = nsContent.substring(with: range)
                    if name.lowercased() != "audience" {
                        audience.append(name)
                    }
                }
            }
        }

        return (group, audience.isEmpty ? nil : audience)
    }

    // MARK: - Content Formatting

    private func formatNoteContent(_ content: String, metadata: NoteMetadata) -> String {
        let encoder = YAMLEncoder()
        let frontmatter: String

        do {
            frontmatter = try encoder.encode(metadata)
        } catch {
            frontmatter = """
            date: \(metadata.date)
            created_at: \(ISO8601DateFormatter().string(from: metadata.createdAt))
            updated_at: \(ISO8601DateFormatter().string(from: metadata.updatedAt))
            """
        }

        let trimmedContent = content.split(separator: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .joined(separator: "\n")

        return """
        ---
        \(frontmatter)---

        \(trimmedContent)
        """
    }

    private func parseNoteContent(_ fileContent: String) -> (metadata: NoteMetadata, content: String)? {
        // Parse frontmatter
        let pattern = #"^---\n([\s\S]*?)\n---\n\n([\s\S]*)$"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: fileContent, range: NSRange(fileContent.startIndex..., in: fileContent)),
              match.numberOfRanges == 3 else {
            return nil
        }

        let nsContent = fileContent as NSString
        let yamlString = nsContent.substring(with: match.range(at: 1))
        let content = nsContent.substring(with: match.range(at: 2))

        guard let metadata = parseYAML(yamlString) else {
            return nil
        }

        return (metadata, content)
    }

    private func parseYAML(_ yaml: String) -> NoteMetadata? {
        // Simple YAML parser for our specific format
        var date = getLocalDateString()
        var group: String?
        var audience: [String]?
        var createdAt = Date()
        var updatedAt = Date()

        let lines = yaml.split(separator: "\n")
        for line in lines {
            let parts = line.split(separator: ":", maxSplits: 1)
            guard parts.count == 2 else { continue }

            let key = parts[0].trimmingCharacters(in: .whitespaces)
            let value = parts[1].trimmingCharacters(in: .whitespaces)

            switch key {
            case "date":
                date = value
            case "group":
                group = value
            case "audience":
                let cleaned = value.trimmingCharacters(in: CharacterSet(charactersIn: "[]\"'"))
                audience = cleaned.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
            case "created_at":
                if let parsed = ISO8601DateFormatter().date(from: value) {
                    createdAt = parsed
                }
            case "updated_at":
                if let parsed = ISO8601DateFormatter().date(from: value) {
                    updatedAt = parsed
                }
            default:
                break
            }
        }

        return NoteMetadata(date: date, group: group, audience: audience, createdAt: createdAt, updatedAt: updatedAt)
    }

    // MARK: - Note Operations

    func saveNote(_ content: String, group: String? = nil, audience: [String]? = nil) -> (id: String, success: Bool) {
        let extracted = extractMetadata(from: content)
        let finalGroup = group ?? extracted.group
        let finalAudience = audience ?? extracted.audience

        let filename = generateFilename()
        let now = Date()

        let metadata = NoteMetadata(
            date: getLocalDateString(now),
            group: finalGroup,
            audience: finalAudience,
            createdAt: now,
            updatedAt: now
        )

        let formattedContent = formatNoteContent(content, metadata: metadata)
        let filePath = notesDirectory.appendingPathComponent(filename)

        do {
            try formattedContent.write(to: filePath, atomically: true, encoding: .utf8)
            invalidateCache()
            return (filename, true)
        } catch {
            print("Failed to save note: \(error)")
            return ("", false)
        }
    }

    func updateExistingNote(id: String, content: String) throws {
        let filePath = notesDirectory.appendingPathComponent(id)

        // Read existing file
        let existingContent = try String(contentsOf: filePath, encoding: .utf8)
        guard let parsed = parseNoteContent(existingContent) else {
            throw NSError(domain: "FileStorage", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to parse existing note"])
        }

        // Extract new metadata
        let extracted = extractMetadata(from: content)

        // Update metadata
        var updatedMetadata = parsed.metadata
        updatedMetadata.group = extracted.group ?? parsed.metadata.group
        updatedMetadata.audience = extracted.audience ?? parsed.metadata.audience
        updatedMetadata.updatedAt = Date()

        let formattedContent = formatNoteContent(content, metadata: updatedMetadata)
        try formattedContent.write(to: filePath, atomically: true, encoding: .utf8)
    }

    func loadNotes() -> [Note] {
        // Check cache
        if let cache = notesCache,
           let timestamp = cacheTimestamp,
           Date().timeIntervalSince(timestamp) < cacheTTL {
            return cache
        }

        var notes: [Note] = []

        do {
            let files = try FileManager.default.contentsOfDirectory(at: notesDirectory, includingPropertiesForKeys: nil)
            let mdFiles = files.filter { $0.pathExtension == "md" }

            for file in mdFiles {
                do {
                    let content = try String(contentsOf: file, encoding: .utf8)
                    if let parsed = parseNoteContent(content) {
                        let note = Note(
                            id: file.lastPathComponent,
                            filename: file.lastPathComponent,
                            metadata: parsed.metadata,
                            content: parsed.content
                        )
                        notes.append(note)
                    }
                } catch {
                    print("Failed to load note \(file.lastPathComponent): \(error)")
                }
            }
        } catch {
            print("Failed to read notes directory: \(error)")
        }

        // Sort by filename (newest first)
        notes.sort { $0.filename > $1.filename }

        // Cache results
        notesCache = notes
        cacheTimestamp = Date()

        return notes
    }

    func loadMostRecentNote() -> Note? {
        return loadNotes().first
    }

    func deleteNote(id: String) -> Bool {
        let filePath = notesDirectory.appendingPathComponent(id)
        do {
            try FileManager.default.removeItem(at: filePath)
            invalidateCache()
            return true
        } catch {
            print("Failed to delete note: \(error)")
            return false
        }
    }

    // MARK: - Incomplete Items Counting

    func countIncompleteItems(in content: String) -> Int {
        var count = 0
        let lines = content.split(separator: "\n")

        for line in lines {
            // Count incomplete actions []
            let incompleteActions = line.components(separatedBy: "[]").count - 1
            count += incompleteActions

            // Count incomplete connections -> and <-
            let forwardConnections = line.components(separatedBy: "->").count - 1
            let backwardConnections = line.components(separatedBy: "<-").count - 1
            count += forwardConnections + backwardConnections
        }

        return count
    }

    // MARK: - Navigation

    func getNextNoteId(currentId: String, skipWithoutActions: Bool = false) -> String? {
        let notes = loadNotes()
        guard let currentIndex = notes.firstIndex(where: { $0.id == currentId }) else {
            return nil
        }

        for i in (currentIndex + 1)..<notes.count {
            let candidate = notes[i]
            if !skipWithoutActions || countIncompleteItems(in: candidate.content) > 0 {
                return candidate.id
            }
        }

        return nil
    }

    func getPreviousNoteId(currentId: String, skipWithoutActions: Bool = false) -> String? {
        let notes = loadNotes()
        guard let currentIndex = notes.firstIndex(where: { $0.id == currentId }) else {
            return nil
        }

        for i in stride(from: currentIndex - 1, through: 0, by: -1) {
            let candidate = notes[i]
            if !skipWithoutActions || countIncompleteItems(in: candidate.content) > 0 {
                return candidate.id
            }
        }

        return nil
    }

    // MARK: - Suggestions

    func getRecentGroupSuggestions(prefix: String? = nil) -> [String] {
        let twoWeeksAgo = Calendar.current.date(byAdding: .day, value: -14, to: Date()) ?? Date()
        let notes = loadNotes()

        var groups = Set<String>()
        for note in notes {
            if note.metadata.createdAt >= twoWeeksAgo, let group = note.metadata.group {
                groups.insert(group)
            }
        }

        var results = Array(groups).sorted()
        if let prefix = prefix?.lowercased() {
            results = results.filter { $0.lowercased().hasPrefix(prefix) }
        }

        return results
    }

    func getRecentAudienceSuggestions(prefix: String? = nil) -> [String] {
        let twoWeeksAgo = Calendar.current.date(byAdding: .day, value: -14, to: Date()) ?? Date()
        let notes = loadNotes()

        var audience = Set<String>()
        for note in notes {
            if note.metadata.createdAt >= twoWeeksAgo, let members = note.metadata.audience {
                for member in members {
                    let cleaned = member.hasPrefix("@") ? String(member.dropFirst()) : member
                    audience.insert(cleaned)
                }
            }
        }

        var results = Array(audience).sorted()
        if let prefix = prefix?.lowercased() {
            results = results.filter { $0.lowercased().hasPrefix(prefix) }
        }

        return results
    }
}

// Simple YAML encoder
struct YAMLEncoder {
    func encode(_ metadata: NoteMetadata) throws -> String {
        var yaml = "date: \(metadata.date)\n"

        if let group = metadata.group {
            yaml += "group: \(group)\n"
        }

        if let audience = metadata.audience, !audience.isEmpty {
            let audienceStr = audience.map { "\"\($0)\"" }.joined(separator: ", ")
            yaml += "audience: [\(audienceStr)]\n"
        }

        yaml += "created_at: \(ISO8601DateFormatter().string(from: metadata.createdAt))\n"
        yaml += "updated_at: \(ISO8601DateFormatter().string(from: metadata.updatedAt))\n"

        return yaml
    }
}
