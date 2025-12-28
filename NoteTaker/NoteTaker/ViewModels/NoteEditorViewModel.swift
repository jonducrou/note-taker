import Foundation
import Combine
import AppKit

/// ViewModel for the note editor
@MainActor
class NoteEditorViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published var content: String = ""
    @Published var currentNote: Note?
    @Published var isLoading = false
    @Published var isRecording = false
    @Published var isInitialising = false
    @Published var isProcessingTranscript = false

    // MARK: - Private Properties

    private var autoSaveTask: Task<Void, Never>?
    private var aggregationTask: Task<Void, Never>?
    private var previousAudience: [String] = []
    private let storage = FileStorageService.shared

    // MARK: - Auto-save Configuration

    private let autoSaveDelay: TimeInterval = 0.25  // 250ms
    private let aggregationDelay: TimeInterval = 0.5  // 500ms

    // MARK: - Note Management

    func loadMostRecentNote() {
        Task {
            isLoading = true
            defer { isLoading = false }

            if let note = try? await storage.loadMostRecentNote() {
                currentNote = note
                content = note.content
                previousAudience = note.audience
            }
        }
    }

    func loadNote(byId noteId: String) {
        Task {
            isLoading = true
            defer { isLoading = false }

            if let note = try? await storage.loadNote(byId: noteId) {
                currentNote = note
                content = note.content
                previousAudience = note.audience
            }
        }
    }

    func createNewNote() {
        Task {
            // Save current note first
            await saveCurrentNote()

            // Create new note
            if let newNote = try? await storage.saveNote(content: "") {
                currentNote = newNote
                content = ""
                previousAudience = []
            }
        }
    }

    // MARK: - Auto-save

    func scheduleAutoSave() {
        // Cancel existing task
        autoSaveTask?.cancel()

        // Schedule new save
        autoSaveTask = Task {
            try? await Task.sleep(nanoseconds: UInt64(autoSaveDelay * 1_000_000_000))

            guard !Task.isCancelled else { return }

            await saveCurrentNote()
            await checkAudienceChange()
        }
    }

    private func saveCurrentNote() async {
        guard let noteId = currentNote?.id else {
            // Create new note if none exists
            if !content.isEmpty {
                if let newNote = try? await storage.saveNote(content: stripAggregatedContent(content)) {
                    currentNote = newNote
                }
            }
            return
        }

        // Update existing note
        let cleanContent = stripAggregatedContent(content)
        try? await storage.updateNote(noteId, content: cleanContent)

        // Update dock badge
        await updateDockBadge()
    }

    // MARK: - Aggregation

    private func checkAudienceChange() async {
        let currentAudience = extractAudience(from: content)

        // Skip if audience hasn't changed
        guard currentAudience != previousAudience else { return }
        previousAudience = currentAudience

        // Cancel existing aggregation
        aggregationTask?.cancel()

        // Schedule aggregation
        aggregationTask = Task {
            try? await Task.sleep(nanoseconds: UInt64(aggregationDelay * 1_000_000_000))

            guard !Task.isCancelled else { return }

            await updateAggregatedContent()
        }
    }

    private func updateAggregatedContent() async {
        guard !previousAudience.isEmpty else {
            // Remove aggregated content if no audience
            content = stripAggregatedContent(content)
            return
        }

        guard let noteId = currentNote?.id else { return }

        // Fetch related actions
        guard let relatedActions = try? await storage.getRelatedActions(
            for: previousAudience,
            days: 30,
            excludeNoteId: noteId
        ), !relatedActions.isEmpty else {
            // No related actions, remove aggregated section
            content = stripAggregatedContent(content)
            return
        }

        // Build aggregated content
        var aggregatedContent = "\n\n--------\n"

        for related in relatedActions {
            aggregatedContent += "\n\(related.noteTitle) (\(related.formattedDate))\n"

            for action in related.actions {
                aggregatedContent += "[] \(action.text)\n"
            }

            for connection in related.connections {
                aggregatedContent += "\(connection.subject)\n"
            }
        }

        // Append to content
        content = stripAggregatedContent(content) + aggregatedContent
    }

    // MARK: - Navigation

    func navigateToNextNote(skipEmpty: Bool = false) {
        Task {
            guard let currentId = currentNote?.id,
                  let nextId = try? await storage.getNextNoteId(from: currentId, skipEmpty: skipEmpty) else {
                return
            }
            loadNote(byId: nextId)
        }
    }

    func navigateToPreviousNote(skipEmpty: Bool = false) {
        Task {
            guard let currentId = currentNote?.id,
                  let previousId = try? await storage.getPreviousNoteId(from: currentId, skipEmpty: skipEmpty) else {
                return
            }
            loadNote(byId: previousId)
        }
    }

    // MARK: - Badge

    private func updateDockBadge() async {
        let openNotes = try? await storage.getOpenNotesFromLastMonth()
        let totalCount = openNotes?.reduce(0) { $0 + $1.incompleteItemCount } ?? 0

        NSApplication.shared.dockTile.badgeLabel = totalCount > 0 ? "\(totalCount)" : nil
    }

    // MARK: - Helpers

    private func extractAudience(from text: String) -> [String] {
        // Only parse first line (before aggregation separator)
        let firstLine = text.components(separatedBy: "\n").first ?? ""

        let pattern = #"@([a-zA-Z][a-zA-Z0-9_-]*)"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }

        let matches = regex.matches(in: firstLine, range: NSRange(firstLine.startIndex..., in: firstLine))

        return matches.compactMap { match in
            guard let range = Range(match.range(at: 1), in: firstLine) else { return nil }
            return String(firstLine[range])
        }
    }

    private func stripAggregatedContent(_ text: String) -> String {
        let separator = "--------"
        if let range = text.range(of: separator) {
            return String(text[..<range.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return text
    }
}
