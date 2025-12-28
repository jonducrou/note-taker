import Foundation
import Combine

/// ViewModel for transcription state in the UI
@MainActor
class TranscriptionViewModel: ObservableObject {
    // MARK: - Published State

    @Published var isRecording = false
    @Published var isInitialising = false
    @Published var isProcessingTranscript = false
    @Published var errorMessage: String?

    // MARK: - Private

    private let service = TranscriptionService.shared
    private var statusTask: Task<Void, Never>?

    // MARK: - Lifecycle

    init() {
        startStatusPolling()
    }

    deinit {
        statusTask?.cancel()
    }

    // MARK: - Public API

    func initialize() {
        Task {
            await service.initialize()
        }
    }

    func startRecording(noteId: String) {
        Task {
            do {
                try await service.start(noteId: noteId)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func stopRecording() {
        Task {
            await service.stop()
        }
    }

    func onNoteSwitched(to noteId: String, newestNoteId: String?) {
        Task {
            await service.onNoteSwitched(to: noteId, newestNoteId: newestNoteId)
        }
    }

    func onWindowHidden() {
        Task {
            await service.onWindowHidden()
        }
    }

    func onWindowShown(currentNoteId: String, newestNoteId: String?) {
        Task {
            await service.onWindowShown(currentNoteId: currentNoteId, newestNoteId: newestNoteId)
        }
    }

    // MARK: - Status Polling

    private func startStatusPolling() {
        statusTask = Task {
            while !Task.isCancelled {
                await updateStatus()
                try? await Task.sleep(nanoseconds: 500_000_000)  // 500ms
            }
        }
    }

    private func updateStatus() async {
        let status = await service.status

        isRecording = status.isRecording
        isInitialising = status.isInitialising
        isProcessingTranscript = status.isProcessingTranscript

        // Check for error state
        let state = await service.state
        if case .error(let message) = state {
            errorMessage = message
        } else {
            errorMessage = nil
        }
    }
}
