import SwiftUI

/// Main content view with text editor
struct ContentView: View {
    @StateObject private var viewModel = ContentViewModel()

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text(viewModel.currentNoteTitle)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)

                Spacer()

                Button("New") {
                    viewModel.createNewNote()
                }
                .buttonStyle(.plain)
                .font(.system(size: 12))
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(Color(nsColor: .controlBackgroundColor))
                .cornerRadius(4)
            }
            .padding(8)
            .background(Color(nsColor: .windowBackgroundColor))

            // Editor
            SyntaxTextView(text: $viewModel.content) { newText in
                viewModel.onTextChanged(newText)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onAppear {
            viewModel.loadInitialNote()
        }
    }
}

/// View model for content view
class ContentViewModel: ObservableObject {
    @Published var content: String = ""
    @Published var currentNoteId: String?
    @Published var currentNoteTitle: String = "Note Taker"

    private let fileStorage = FileStorage()
    private var saveTimer: Timer?

    func loadInitialNote() {
        if let note = fileStorage.loadMostRecentNote() {
            content = note.content
            currentNoteId = note.id
            updateTitle(for: note.id)
        }
    }

    func onTextChanged(_ newText: String) {
        content = newText

        // Cancel existing timer
        saveTimer?.invalidate()

        // Save after 250ms of inactivity
        saveTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: false) { [weak self] _ in
            self?.saveNote()
        }
    }

    private func saveNote() {
        if let noteId = currentNoteId {
            // Update existing note
            try? fileStorage.updateExistingNote(id: noteId, content: content)
        } else {
            // Create new note
            let result = fileStorage.saveNote(content)
            if result.success {
                currentNoteId = result.id
                updateTitle(for: result.id)
            }
        }
    }

    func createNewNote() {
        content = ""
        currentNoteId = nil
        currentNoteTitle = "Note Taker"
        saveTimer?.invalidate()
    }

    private func updateTitle(for noteId: String) {
        // Extract date from filename: YYYY-MM-DD_HHMMSS.md
        let parts = noteId.split(separator: "_")
        guard parts.count >= 2 else { return }

        let datePart = String(parts[0])
        let timePart = String(parts[1].prefix(6))

        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        guard let date = dateFormatter.date(from: datePart) else { return }

        let hour = String(timePart.prefix(2))
        let minute = String(timePart.suffix(4).prefix(2))

        let formatter = DateFormatter()
        formatter.dateFormat = "EEE d MMM"
        let dateStr = formatter.string(from: date)

        currentNoteTitle = "\(dateStr) \(hour):\(minute)"
    }

    func loadNote(id: String) {
        let notes = fileStorage.loadNotes()
        guard let note = notes.first(where: { $0.id == id }) else { return }

        content = note.content
        currentNoteId = note.id
        updateTitle(for: note.id)
    }

    func deleteCurrentNote() {
        guard let noteId = currentNoteId else { return }

        if fileStorage.deleteNote(id: noteId) {
            // Load most recent note
            if let note = fileStorage.loadMostRecentNote() {
                content = note.content
                currentNoteId = note.id
                updateTitle(for: note.id)
            } else {
                createNewNote()
            }
        }
    }

    func navigateToNext() {
        guard let currentId = currentNoteId,
              let nextId = fileStorage.getNextNoteId(currentId: currentId) else { return }
        loadNote(id: nextId)
    }

    func navigateToPrevious() {
        guard let currentId = currentNoteId,
              let prevId = fileStorage.getPreviousNoteId(currentId: currentId) else { return }
        loadNote(id: prevId)
    }
}
