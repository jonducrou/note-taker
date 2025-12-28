import Foundation
import Combine

/// Coordinates audio transcription for notes
actor TranscriptionService {
    static let shared = TranscriptionService()

    // MARK: - State

    enum State: Equatable {
        case idle
        case initialising
        case recording(noteId: String)
        case processing
        case error(String)
    }

    private(set) var state: State = .idle
    private var speechRecognizer: SpeechRecognizer?
    private var currentNoteId: String?
    private var gracePeriodTask: Task<Void, Never>?
    private var snippetBuffer: String = ""

    // Configuration
    private let gracePeriodSeconds: TimeInterval = 25
    private let snippetInterval: TimeInterval = 5

    // Callbacks
    var onStateChange: ((State) -> Void)?
    var onSnippet: ((String, String) -> Void)?  // (noteId, text)
    var onTranscript: ((String, String) -> Void)?  // (noteId, text)

    // MARK: - Public API

    /// Initialise the transcription service
    func initialize() async {
        guard state == .idle else { return }

        setState(.initialising)

        // Check permissions
        let hasPermission = await withCheckedContinuation { continuation in
            PermissionsManager.shared.requestTranscriptionPermissions { granted in
                continuation.resume(returning: granted)
            }
        }

        guard hasPermission else {
            setState(.error("Microphone or speech recognition permission denied"))
            return
        }

        // Create speech recognizer
        speechRecognizer = SpeechRecognizer()
        speechRecognizer?.onSnippet = { [weak self] text in
            Task {
                await self?.handleSnippet(text)
            }
        }
        speechRecognizer?.onFinalTranscript = { [weak self] text in
            Task {
                await self?.handleFinalTranscript(text)
            }
        }
        speechRecognizer?.onError = { [weak self] error in
            Task {
                await self?.handleError(error)
            }
        }

        setState(.idle)
    }

    /// Start recording for a note
    func start(noteId: String) async throws {
        // Cancel any grace period
        gracePeriodTask?.cancel()
        gracePeriodTask = nil

        // If already recording same note, ignore
        if case .recording(let currentId) = state, currentId == noteId {
            return
        }

        // Stop any existing recording
        await stop()

        // Ensure initialised
        if speechRecognizer == nil {
            await initialize()
        }

        guard let recognizer = speechRecognizer else {
            throw TranscriptionError.notInitialised
        }

        currentNoteId = noteId
        snippetBuffer = ""

        do {
            try recognizer.startRecording()
            setState(.recording(noteId: noteId))
        } catch {
            setState(.error(error.localizedDescription))
            throw error
        }
    }

    /// Stop recording
    func stop() async {
        gracePeriodTask?.cancel()
        gracePeriodTask = nil

        guard case .recording = state else { return }

        setState(.processing)
        speechRecognizer?.stopRecording()

        // Wait briefly for final transcript
        try? await Task.sleep(nanoseconds: 500_000_000)

        currentNoteId = nil
        snippetBuffer = ""
        setState(.idle)
    }

    /// Called when user switches to a different note
    func onNoteSwitched(to noteId: String, newestNoteId: String?) async {
        // If switching to newest note, that becomes the recording target
        if noteId == newestNoteId {
            gracePeriodTask?.cancel()
            gracePeriodTask = nil

            // If not already recording, start
            if case .recording = state {
                return  // Already recording
            }

            do {
                try await start(noteId: noteId)
            } catch {
                print("Failed to start recording: \(error)")
            }
            return
        }

        // Otherwise, start grace period
        startGracePeriod()
    }

    /// Called when window is hidden
    func onWindowHidden() {
        startGracePeriod()
    }

    /// Called when window is shown
    func onWindowShown(currentNoteId: String, newestNoteId: String?) async {
        // Cancel grace period if returning to newest note
        if currentNoteId == newestNoteId {
            gracePeriodTask?.cancel()
            gracePeriodTask = nil
        }
    }

    // MARK: - Status

    var status: TranscriptionStatus {
        TranscriptionStatus(
            isRecording: isRecording,
            isInitialising: state == .initialising,
            isProcessingTranscript: state == .processing,
            noteId: currentNoteId
        )
    }

    var isRecording: Bool {
        if case .recording = state { return true }
        return false
    }

    // MARK: - Private

    private func setState(_ newState: State) {
        state = newState

        // Notify on main thread
        let callback = onStateChange
        Task { @MainActor in
            callback?(newState)
        }
    }

    private func startGracePeriod() {
        // Cancel existing grace period
        gracePeriodTask?.cancel()

        guard case .recording = state else { return }

        gracePeriodTask = Task {
            do {
                try await Task.sleep(nanoseconds: UInt64(gracePeriodSeconds * 1_000_000_000))

                guard !Task.isCancelled else { return }

                await stop()
            } catch {
                // Task cancelled, that's fine
            }
        }
    }

    private func handleSnippet(_ text: String) {
        guard let noteId = currentNoteId else { return }

        // Only emit if text changed significantly
        if text.count > snippetBuffer.count + 10 {
            snippetBuffer = text
            onSnippet?(noteId, text)
        }
    }

    private func handleFinalTranscript(_ text: String) {
        guard let noteId = currentNoteId else { return }
        onTranscript?(noteId, text)
    }

    private func handleError(_ error: Error) {
        setState(.error(error.localizedDescription))
    }
}

// MARK: - Supporting Types

struct TranscriptionStatus {
    let isRecording: Bool
    let isInitialising: Bool
    let isProcessingTranscript: Bool
    let noteId: String?
}

enum TranscriptionError: LocalizedError {
    case notInitialised
    case permissionDenied
    case recordingFailed

    var errorDescription: String? {
        switch self {
        case .notInitialised:
            return "Transcription service not initialised"
        case .permissionDenied:
            return "Microphone permission denied"
        case .recordingFailed:
            return "Failed to start recording"
        }
    }
}
