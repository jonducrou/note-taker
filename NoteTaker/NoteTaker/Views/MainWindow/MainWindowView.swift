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

            // Error banner
            if let error = viewModel.errorMessage {
                ErrorBannerView(message: error) {
                    viewModel.dismissError()
                }
                .transition(.move(edge: .top).combined(with: .opacity))
            }

            // Editor
            NoteEditorView(
                content: $viewModel.content,
                onContentChange: { viewModel.scheduleAutoSave() },
                onNavigateNext: { viewModel.navigateToNextNote() },
                onNavigatePrevious: { viewModel.navigateToPreviousNote() },
                onNavigateNextWithActions: { viewModel.navigateToNextNote(skipEmpty: true) },
                onNavigatePreviousWithActions: { viewModel.navigateToPreviousNote(skipEmpty: true) }
            )

            // Actions Tab (shows when there are related actions, insights, or in global view mode)
            if viewModel.showActionsTab || viewModel.showGlobalActions {
                ActionsTabView(
                    relatedActions: viewModel.relatedActions,
                    extractedInsights: viewModel.extractedInsights,
                    globalActions: viewModel.globalActions,
                    showGlobalView: viewModel.showGlobalActions,
                    onToggleGlobalView: viewModel.toggleGlobalActionsView,
                    onNavigateToNote: viewModel.navigateToRelatedNote
                )
                .frame(height: actionsTabHeight)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .frame(minWidth: 300, minHeight: 400)
        .background(Color(nsColor: .windowBackgroundColor))
        .animation(.easeInOut(duration: 0.2), value: viewModel.showActionsTab)
        .animation(.easeInOut(duration: 0.2), value: viewModel.errorMessage != nil)
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

/// Banner view for displaying errors
struct ErrorBannerView: View {
    let message: String
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.yellow)

            Text(message)
                .font(.caption)
                .foregroundColor(.white)
                .lineLimit(2)

            Spacer()

            Button(action: onDismiss) {
                Image(systemName: "xmark.circle.fill")
                    .foregroundColor(.white.opacity(0.7))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.red.opacity(0.9))
    }
}

#Preview {
    MainWindowView()
        .frame(width: 300, height: 400)
}

#Preview("Error Banner") {
    ErrorBannerView(message: "Transcription requires macOS 26 or later", onDismiss: {})
        .frame(width: 300)
}
