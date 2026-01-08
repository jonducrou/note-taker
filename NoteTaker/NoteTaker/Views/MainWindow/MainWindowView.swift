import SwiftUI

struct MainWindowView: View {
    @StateObject private var viewModel = NoteEditorViewModel()
    @State private var actionsTabHeight: CGFloat = 150

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

            // Actions Tab (only shows when there are related actions or insights)
            if viewModel.showActionsTab {
                ActionsTabView(
                    relatedActions: viewModel.relatedActions,
                    extractedInsights: viewModel.extractedInsights,
                    onNavigateToNote: { viewModel.navigateToRelatedNote($0) }
                )
                .frame(height: actionsTabHeight)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .frame(minWidth: 300, minHeight: 400)
        .background(Color(nsColor: .windowBackgroundColor))
        .animation(.easeInOut(duration: 0.2), value: viewModel.showActionsTab)
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
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
            viewModel.onWindowShown()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didResignKeyNotification)) { _ in
            viewModel.onWindowHidden()
        }
    }
}

#Preview {
    MainWindowView()
        .frame(width: 300, height: 400)
}
