import Foundation
import Combine
import os.log

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
    private var dualSourceTranscriber: DualSourceTranscriber?
    private var currentNoteId: String?
    private var pendingNoteId: String?  // Used to capture noteId for delayed final transcript
    private var gracePeriodTask: Task<Void, Never>?
    private var snippetBuffer: String = ""

    // Configuration
    private let gracePeriodSeconds: TimeInterval = 30
    private let snippetInterval: TimeInterval = 5

    // Auto-detect: use dual-source on macOS 26+, fallback to basic on older versions
    private var useDualSource: Bool {
        if #available(macOS 26.0, *) {
            return true
        } else {
            return false
        }
    }

    // Callbacks
    private var onStateChange: ((State) -> Void)?
    private var onSnippet: ((String, String) -> Void)?  // (noteId, text)
    private var onTranscript: ((String, String) -> Void)?  // (noteId, text)

    /// Set callbacks for transcription events
    func setCallbacks(
        onStateChange: @escaping (State) -> Void,
        onSnippet: @escaping (String, String) -> Void,
        onTranscript: @escaping (String, String) -> Void
    ) {
        self.onStateChange = onStateChange
        self.onSnippet = onSnippet
        self.onTranscript = onTranscript
    }

    // MARK: - Public API

    /// Initialise the transcription service
    func initialize() async {
        guard state == .idle else { return }

        Logger.info("Initialising transcription service", log: Logger.transcription)
        setState(.initialising)

        let hasPermission = await withCheckedContinuation { continuation in
            PermissionsManager.shared.requestTranscriptionPermissions { granted in
                continuation.resume(returning: granted)
            }
        }

        guard hasPermission else {
            Logger.error("Permission denied for microphone or speech recognition", log: Logger.transcription)
            setState(.error("Microphone or speech recognition permission denied"))
            return
        }

        if useDualSource {
            Logger.info("Using dual-source transcription (macOS 26+)", log: Logger.transcription)
            dualSourceTranscriber = DualSourceTranscriber()
            dualSourceTranscriber?.onSnippet = { [weak self] text in
                Task {
                    await self?.handleSnippet(text)
                }
            }
            dualSourceTranscriber?.onFinalTranscript = { [weak self] text in
                Task {
                    await self?.handleFinalTranscript(text)
                }
            }
            dualSourceTranscriber?.onError = { [weak self] error in
                Task {
                    await self?.handleError(error)
                }
            }
        } else {
            Logger.info("Using single-source transcription (SFSpeechRecognizer)", log: Logger.transcription)
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
        }

        setState(.idle)
    }

    /// Start recording for a note
    func start(noteId: String) async throws {
        gracePeriodTask?.cancel()
        gracePeriodTask = nil

        if case .recording(let currentId) = state, currentId == noteId {
            return
        }

        await stop()

        if useDualSource {
            if dualSourceTranscriber == nil {
                await initialize()
            }
            guard dualSourceTranscriber != nil else {
                throw TranscriptionError.notInitialised
            }
        } else {
            if speechRecognizer == nil {
                await initialize()
            }
            guard speechRecognizer != nil else {
                throw TranscriptionError.notInitialised
            }
        }

        currentNoteId = noteId
        snippetBuffer = ""

        do {
            Logger.info("Starting recording for note: \(noteId)", log: Logger.transcription)
            if useDualSource {
                try dualSourceTranscriber?.startRecording()
            } else {
                try speechRecognizer?.startRecording()
            }
            setState(.recording(noteId: noteId))
            Logger.info("Recording started successfully", log: Logger.transcription)
        } catch {
            Logger.error("Failed to start recording: \(error.localizedDescription)", log: Logger.transcription)
            setState(.error(error.localizedDescription))
            throw error
        }
    }

    /// Stop recording
    func stop() async {
        gracePeriodTask?.cancel()
        gracePeriodTask = nil

        guard case .recording = state else { return }

        Logger.info("Stopping recording", log: Logger.transcription)

        let noteIdToSave = currentNoteId
        let transcriptToSave = snippetBuffer
        pendingNoteId = currentNoteId

        setState(.processing)

        if useDualSource {
            dualSourceTranscriber?.stopRecording()
        } else {
            speechRecognizer?.stopRecording()
        }

        if let noteId = noteIdToSave, !transcriptToSave.isEmpty {
            onTranscript?(noteId, transcriptToSave)
        }

        try? await Task.sleep(nanoseconds: 500_000_000)

        currentNoteId = nil
        snippetBuffer = ""
        setState(.idle)
    }

    /// Called when user switches to a different note
    func onNoteSwitched(to noteId: String, newestNoteId: String?) async {
        if noteId == newestNoteId {
            gracePeriodTask?.cancel()
            gracePeriodTask = nil

            if case .recording = state {
                return
            }

            do {
                try await start(noteId: noteId)
            } catch {
                // Recording failed to start
            }
            return
        }

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
        gracePeriodTask?.cancel()

        guard case .recording = state else { return }

        gracePeriodTask = Task {
            do {
                try await Task.sleep(nanoseconds: UInt64(gracePeriodSeconds * 1_000_000_000))
                guard !Task.isCancelled else { return }
                await stop()
            } catch {
                // Task cancelled or sleep interrupted
            }
        }
    }

    private func handleSnippet(_ text: String) {
        guard let noteId = currentNoteId else { return }

        let previousLength = snippetBuffer.count

        // Always update buffer with latest transcript (for final save)
        snippetBuffer = text

        // Only emit to file if text changed significantly (10+ chars more)
        if text.count >= previousLength + 10 {
            onSnippet?(noteId, text)
        }
    }

    private func handleFinalTranscript(_ text: String) {
        let noteId = currentNoteId ?? pendingNoteId
        guard let noteId = noteId else { return }
        onTranscript?(noteId, text)
        pendingNoteId = nil
    }

    private func handleError(_ error: Error) {
        Logger.error("Transcription error: \(error.localizedDescription)", log: Logger.transcription)
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
