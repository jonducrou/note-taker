import SwiftUI

struct MainWindowView: View {
    @StateObject private var viewModel = NoteEditorViewModel()

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HeaderView(
                title: viewModel.currentNote?.formattedDate ?? "Note Taker",
                isRecording: viewModel.isRecording,
                isInitialising: viewModel.isInitialising,
                isProcessingTranscript: viewModel.isProcessingTranscript,
                onNewNote: { viewModel.createNewNote() }
            )

            // Editor
            NoteEditorView(
                content: $viewModel.content,
                onContentChange: { viewModel.scheduleAutoSave() },
                onNavigateNext: { viewModel.navigateToNextNote() },
                onNavigatePrevious: { viewModel.navigateToPreviousNote() },
                onNavigateNextWithActions: { viewModel.navigateToNextNote(skipEmpty: true) },
                onNavigatePreviousWithActions: { viewModel.navigateToPreviousNote(skipEmpty: true) }
            )
        }
        .frame(minWidth: 300, minHeight: 400)
        .background(Color(nsColor: .windowBackgroundColor))
        .onAppear {
            viewModel.loadMostRecentNote()
        }
        .onReceive(NotificationCenter.default.publisher(for: .createNewNote)) { _ in
            viewModel.createNewNote()
        }
        .onReceive(NotificationCenter.default.publisher(for: .loadNote)) { notification in
            if let noteId = notification.object as? String {
                viewModel.loadNote(byId: noteId)
            }
        }
    }
}

#Preview {
    MainWindowView()
        .frame(width: 300, height: 400)
}
