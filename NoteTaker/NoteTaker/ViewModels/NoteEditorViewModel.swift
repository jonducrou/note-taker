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
    @Published var errorMessage: String?
    @Published var relatedActions: [RelatedAction] = []
    @Published var extractedInsights: [ExtractedAction] = []
    @Published var showActionsTab = false
    @Published var showGlobalActions = false
    @Published var globalActions: [RelatedAction] = []

    // MARK: - Private Properties

    private var autoSaveTask: Task<Void, Never>?
    private var aggregationTask: Task<Void, Never>?
    private var previousAudience: [String] = []
    private let storage = FileStorageService.shared
    private var transcriptionInitTask: Task<Void, Never>?
    private var newestNoteId: String?  // Track the newest note for transcription

    // MARK: - Auto-save Configuration

    private let autoSaveDelay: TimeInterval = 0.25  // 250ms
    private let aggregationDelay: TimeInterval = 0.5  // 500ms

    // MARK: - Initialisation

    init() {
        setupTranscription()
    }

    private func setupTranscription() {
        Task {
            let service = TranscriptionService.shared

            await service.setCallbacks(
                onStateChange: { [weak self] state in
                    Task { @MainActor in
                        self?.handleTranscriptionStateChange(state)
                    }
                },
                onSnippet: { [weak self] noteId, text in
                    Task { @MainActor in
                        self?.handleTranscriptSnippet(noteId: noteId, text: text)
                    }
                },
                onTranscript: { [weak self] noteId, text in
                    Task { @MainActor in
                        self?.handleFinalTranscript(noteId: noteId, text: text)
                    }
                }
            )

            isInitialising = true
            await service.initialize()
            isInitialising = false
        }
    }

    private func handleTranscriptionStateChange(_ state: TranscriptionService.State) {
        switch state {
        case .idle:
            isRecording = false
            isInitialising = false
            isProcessingTranscript = false
            errorMessage = nil
        case .initialising:
            isInitialising = true
            errorMessage = nil
        case .recording:
            isRecording = true
            isInitialising = false
            errorMessage = nil
        case .processing:
            isProcessingTranscript = true
            isRecording = false
        case .error(let message):
            isRecording = false
            isInitialising = false
            isProcessingTranscript = false
            errorMessage = message
        }
    }

    func dismissError() {
        errorMessage = nil
    }

    func toggleGlobalActionsView() {
        showGlobalActions.toggle()
        if showGlobalActions {
            Task {
                await loadGlobalActions()
            }
        }
    }

    private func loadGlobalActions() async {
        if let actions = try? await storage.getAllIncompleteActions(days: 30) {
            globalActions = actions
            showActionsTab = true
        }
    }

    private func handleTranscriptSnippet(noteId: String, text: String) {
        // Write snippet to .snippet file (don't insert into note directly)
        Task {
            await writeSnippetToFile(noteId: noteId, text: text)
        }
    }

    private func handleFinalTranscript(noteId: String, text: String) {
        // Write final transcript to .transcription file
        Task {
            await writeTranscriptToFile(noteId: noteId, text: text)
        }
    }

    private func writeSnippetToFile(noteId: String, text: String) async {
        let notesDir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Documents/Notes")
        let snippetPath = notesDir.appendingPathComponent("\(noteId).snippet")

        let timestamp = ISO8601DateFormatter().string(from: Date())
        let line = "[\(timestamp)] \(text)\n"

        do {
            if FileManager.default.fileExists(atPath: snippetPath.path) {
                let handle = try FileHandle(forWritingTo: snippetPath)
                handle.seekToEndOfFile()
                handle.write(line.data(using: .utf8)!)
                handle.closeFile()
            } else {
                try line.write(to: snippetPath, atomically: true, encoding: .utf8)
            }
        } catch {
            // Failed to write snippet
        }
    }

    private func writeTranscriptToFile(noteId: String, text: String) async {
        let notesDir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Documents/Notes")
        let transcriptPath = notesDir.appendingPathComponent("\(noteId).transcription")

        let header = "\n\n=== COMPLETE SESSION TRANSCRIPT ===\n"
        let separator = "===================================\n\n"
        let transcriptContent = header + separator + text + "\n"

        do {
            if FileManager.default.fileExists(atPath: transcriptPath.path) {
                let handle = try FileHandle(forWritingTo: transcriptPath)
                handle.seekToEndOfFile()
                handle.write(transcriptContent.data(using: .utf8)!)
                handle.closeFile()
            } else {
                try transcriptContent.write(to: transcriptPath, atomically: true, encoding: .utf8)
            }

            await extractActionsFromTranscript(noteId: noteId, transcript: text)
        } catch {
            // Failed to write transcript
        }
    }

    private func extractActionsFromTranscript(noteId: String, transcript: String) async {
        let service = ActionExtractionService.shared

        guard await service.isConfigured else { return }

        let noteContent = stripAggregatedContent(content)
        let tags = extractAudience(from: content)

        guard !transcript.isEmpty else { return }

        do {
            let actions = try await service.extractActions(
                transcript: transcript,
                noteContent: noteContent,
                noteId: noteId,
                tags: tags
            )

            if !actions.isEmpty {
                try await service.saveActions(actions, for: noteId)
            }
        } catch {
            // Action extraction failed
        }
    }

    // MARK: - Note Management

    func loadMostRecentNote() {
        Task {
            isLoading = true
            defer { isLoading = false }

            if let note = try? await storage.loadMostRecentNote() {
                currentNote = note
                content = note.content
                previousAudience = note.audience
                await updateRelatedActions()
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
                await updateRelatedActions()

                // Notify transcription service of note switch (triggers grace period if not newest)
                await TranscriptionService.shared.onNoteSwitched(to: noteId, newestNoteId: newestNoteId)
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

                // Track this as the newest note
                newestNoteId = newNote.id

                // Start transcription for the new note
                do {
                    try await TranscriptionService.shared.start(noteId: newNote.id)
                } catch {
                    // Failed to start transcription
                }
            }
        }
    }

    // MARK: - Window Visibility

    func onWindowHidden() {
        Task {
            await TranscriptionService.shared.onWindowHidden()
        }
    }

    func onWindowShown() {
        Task {
            if let noteId = currentNote?.id {
                await TranscriptionService.shared.onWindowShown(currentNoteId: noteId, newestNoteId: newestNoteId)
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

        // Cancel existing task
        aggregationTask?.cancel()

        // Schedule related actions update
        aggregationTask = Task {
            try? await Task.sleep(nanoseconds: UInt64(aggregationDelay * 1_000_000_000))

            guard !Task.isCancelled else { return }

            await updateRelatedActions()
        }
    }

    private func updateRelatedActions() async {
        guard !previousAudience.isEmpty else {
            relatedActions = []
            extractedInsights = []
            showActionsTab = false
            return
        }

        guard let noteId = currentNote?.id else { return }

        // Fetch related actions from notes
        if let actions = try? await storage.getRelatedActions(
            for: previousAudience,
            days: 30,
            excludeNoteId: noteId
        ) {
            relatedActions = actions
        } else {
            relatedActions = []
        }

        // Fetch LLM-extracted insights from transcripts
        if let insights = try? await ActionExtractionService.shared.findActions(
            matchingTags: previousAudience,
            days: 30
        ) {
            // Exclude insights from current note
            extractedInsights = insights.filter { $0.noteId != noteId }
        } else {
            extractedInsights = []
        }

        showActionsTab = !relatedActions.isEmpty || !extractedInsights.isEmpty
    }

    // MARK: - Navigation

    func navigateToRelatedNote(_ noteId: String) {
        loadNote(byId: noteId)
    }

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
