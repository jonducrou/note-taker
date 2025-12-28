import Foundation

/// Service for managing note files in ~/Documents/Notes
actor FileStorageService {
    static let shared = FileStorageService()

    private let notesDirectory: URL
    private let fileManager = FileManager.default

    init() {
        let documentsPath = fileManager.homeDirectoryForCurrentUser
            .appendingPathComponent("Documents")
            .appendingPathComponent("Notes")

        self.notesDirectory = documentsPath

        // Ensure directory exists
        try? fileManager.createDirectory(at: notesDirectory, withIntermediateDirectories: true)
    }

    // MARK: - CRUD Operations

    /// Save a new note, returns the created Note
    func saveNote(content: String, group: String? = nil, audience: [String]? = nil) async throws -> Note {
        var note = Note.create(content: content)

        // Update metadata from content
        note.metadata.group = group ?? note.group
        note.metadata.audience = audience ?? (note.audience.isEmpty ? nil : note.audience)

        try await writeNote(note)
        return note
    }

    /// Update an existing note
    func updateNote(_ noteId: String, content: String) async throws {
        guard var note = try await loadNote(byId: noteId) else {
            throw FileStorageError.noteNotFound(noteId)
        }

        note.content = content
        note.metadata.updatedAt = Date()
        note.metadata.group = note.group
        note.metadata.audience = note.audience.isEmpty ? nil : note.audience

        try await writeNote(note)
    }

    /// Delete a note
    func deleteNote(_ noteId: String) async throws {
        let fileURL = notesDirectory.appendingPathComponent("\(noteId).md")
        try fileManager.removeItem(at: fileURL)
    }

    /// Load all notes
    func loadNotes() async throws -> [Note] {
        let files = try fileManager.contentsOfDirectory(at: notesDirectory, includingPropertiesForKeys: [.contentModificationDateKey])

        var notes: [Note] = []
        for file in files where file.pathExtension == "md" {
            if let note = try? await loadNote(from: file) {
                notes.append(note)
            }
        }

        // Sort by ID (which is date-based) descending
        return notes.sorted { $0.id > $1.id }
    }

    /// Load the most recent note
    func loadMostRecentNote() async throws -> Note? {
        let notes = try await loadNotes()
        return notes.first
    }

    /// Load a specific note by ID
    func loadNote(byId noteId: String) async throws -> Note? {
        let fileURL = notesDirectory.appendingPathComponent("\(noteId).md")
        guard fileManager.fileExists(atPath: fileURL.path) else {
            return nil
        }
        return try await loadNote(from: fileURL)
    }

    // MARK: - Navigation

    /// Get the next (older) note ID
    func getNextNoteId(from currentId: String, skipEmpty: Bool = false) async throws -> String? {
        let notes = try await loadNotes()
        guard let currentIndex = notes.firstIndex(where: { $0.id == currentId }) else {
            return nil
        }

        for index in (currentIndex + 1)..<notes.count {
            let note = notes[index]
            if !skipEmpty || note.incompleteItemCount > 0 {
                return note.id
            }
        }
        return nil
    }

    /// Get the previous (newer) note ID
    func getPreviousNoteId(from currentId: String, skipEmpty: Bool = false) async throws -> String? {
        let notes = try await loadNotes()
        guard let currentIndex = notes.firstIndex(where: { $0.id == currentId }) else {
            return nil
        }

        for index in stride(from: currentIndex - 1, through: 0, by: -1) {
            let note = notes[index]
            if !skipEmpty || note.incompleteItemCount > 0 {
                return note.id
            }
        }
        return nil
    }

    // MARK: - Search

    /// Search notes by content
    func searchNotes(query: String) async throws -> [Note] {
        let notes = try await loadNotes()
        let lowercaseQuery = query.lowercased()

        return notes.filter { note in
            note.content.lowercased().contains(lowercaseQuery) ||
            note.metadata.group?.lowercased().contains(lowercaseQuery) == true ||
            note.metadata.audience?.contains { $0.lowercased().contains(lowercaseQuery) } == true
        }
    }

    // MARK: - Grouped Queries

    /// Get notes from today
    func getNotesForToday() async throws -> [Note] {
        let notes = try await loadNotes()
        let today = Calendar.current.startOfDay(for: Date())

        return notes.filter { note in
            guard let noteDate = parseNoteDate(note.id) else { return false }
            return Calendar.current.isDate(noteDate, inSameDayAs: today)
        }
    }

    /// Get notes from yesterday
    func getNotesForYesterday() async throws -> [Note] {
        let notes = try await loadNotes()
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Date())!

        return notes.filter { note in
            guard let noteDate = parseNoteDate(note.id) else { return false }
            return Calendar.current.isDate(noteDate, inSameDayAs: yesterday)
        }
    }

    /// Get notes from the prior week (2-7 days ago)
    func getNotesForPriorWeek() async throws -> [Note] {
        let notes = try await loadNotes()
        let today = Calendar.current.startOfDay(for: Date())
        let twoDaysAgo = Calendar.current.date(byAdding: .day, value: -2, to: today)!
        let sevenDaysAgo = Calendar.current.date(byAdding: .day, value: -7, to: today)!

        return notes.filter { note in
            guard let noteDate = parseNoteDate(note.id) else { return false }
            return noteDate >= sevenDaysAgo && noteDate < twoDaysAgo
        }
    }

    /// Get notes from the last month with incomplete items
    func getOpenNotesFromLastMonth() async throws -> [Note] {
        let notes = try await loadNotes()
        let oneMonthAgo = Calendar.current.date(byAdding: .month, value: -1, to: Date())!

        return notes.filter { note in
            guard let noteDate = parseNoteDate(note.id) else { return false }
            return noteDate >= oneMonthAgo && note.incompleteItemCount > 0
        }
    }

    // MARK: - Suggestions

    /// Get unique group suggestions from recent notes
    func getGroupSuggestions(days: Int = 14) async throws -> [String] {
        let notes = try await loadNotes()
        let cutoff = Calendar.current.date(byAdding: .day, value: -days, to: Date())!

        var groups = Set<String>()
        for note in notes {
            guard let noteDate = parseNoteDate(note.id), noteDate >= cutoff else { continue }
            if let group = note.group {
                groups.insert(group)
            }
        }

        return Array(groups).sorted()
    }

    /// Get unique audience suggestions from recent notes
    func getAudienceSuggestions(days: Int = 14) async throws -> [String] {
        let notes = try await loadNotes()
        let cutoff = Calendar.current.date(byAdding: .day, value: -days, to: Date())!

        var audience = Set<String>()
        for note in notes {
            guard let noteDate = parseNoteDate(note.id), noteDate >= cutoff else { continue }
            for member in note.audience {
                audience.insert(member)
            }
        }

        return Array(audience).sorted()
    }

    // MARK: - Aggregation

    /// Get related actions for audience members
    func getRelatedActions(for audience: [String], days: Int = 30, excludeNoteId: String? = nil) async throws -> [RelatedAction] {
        guard !audience.isEmpty else { return [] }

        let notes = try await loadNotes()
        let cutoff = Calendar.current.date(byAdding: .day, value: -days, to: Date())!
        let lowercaseAudience = Set(audience.map { $0.lowercased() })

        var relatedActions: [RelatedAction] = []

        for note in notes {
            guard note.id != excludeNoteId,
                  let noteDate = parseNoteDate(note.id),
                  noteDate >= cutoff else { continue }

            // Check if any audience member matches
            let noteAudience = Set(note.audience.map { $0.lowercased() })
            guard !lowercaseAudience.isDisjoint(with: noteAudience) else { continue }

            // Get incomplete actions and connections
            let actions = Action.parse(from: note.content).filter { !$0.isCompleted }
            let connections = Connection.parse(from: note.content).filter { !$0.isCompleted }

            if !actions.isEmpty || !connections.isEmpty {
                relatedActions.append(RelatedAction(
                    noteId: note.id,
                    noteTitle: note.group ?? "Note",
                    noteDate: noteDate,
                    actions: actions,
                    connections: connections
                ))
            }
        }

        return relatedActions.sorted { $0.noteDate > $1.noteDate }
    }

    // MARK: - Private Helpers

    private func loadNote(from fileURL: URL) async throws -> Note {
        let content = try String(contentsOf: fileURL, encoding: .utf8)
        let noteId = fileURL.deletingPathExtension().lastPathComponent

        // Parse YAML frontmatter
        let (metadata, body) = try NoteParser.parse(content)

        return Note(id: noteId, metadata: metadata, content: body)
    }

    private func writeNote(_ note: Note) async throws {
        let fileURL = notesDirectory.appendingPathComponent(note.filename)
        let content = try NoteWriter.write(note)
        try content.write(to: fileURL, atomically: true, encoding: .utf8)
    }

    private func parseNoteDate(_ noteId: String) -> Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd_HHmmss"
        return formatter.date(from: noteId)
    }
}

// MARK: - Errors

enum FileStorageError: LocalizedError {
    case noteNotFound(String)
    case parseError(String)

    var errorDescription: String? {
        switch self {
        case .noteNotFound(let id):
            return "Note not found: \(id)"
        case .parseError(let message):
            return "Parse error: \(message)"
        }
    }
}

// MARK: - Related Action Model

struct RelatedAction {
    let noteId: String
    let noteTitle: String
    let noteDate: Date
    let actions: [Action]
    let connections: [Connection]

    var formattedDate: String {
        let calendar = Calendar.current
        if calendar.isDateInToday(noteDate) {
            return "Today"
        } else if calendar.isDateInYesterday(noteDate) {
            return "Yesterday"
        } else {
            let formatter = DateFormatter()
            formatter.dateFormat = "EEE d MMM"
            return formatter.string(from: noteDate)
        }
    }
}
