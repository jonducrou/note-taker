import Foundation
import AVFoundation
import Speech

/// Coordinates transcription from both microphone and system audio sources
/// Uses hybrid approach: SFSpeechRecognizer for mic, SpeechAnalyzer for system audio
/// This avoids the concurrent SFSpeechRecognizer limitation while preserving speaker attribution
class DualSourceTranscriber {
    // MARK: - Properties

    // Hybrid transcriber (macOS 26+) - uses both APIs for speaker separation
    private var hybridTranscriber: Any?  // HybridDualTranscriber

    // Callbacks
    var onSnippet: ((String) -> Void)?
    var onFinalTranscript: ((String) -> Void)?
    var onError: ((Error) -> Void)?

    private(set) var isRecording = false

    // MARK: - Initialisation

    init(locale: Locale = Locale(identifier: "en-AU")) {
    }

    // MARK: - Recording Control

    func startRecording() throws {
        guard !isRecording else { return }

        isRecording = true

        // Start async
        if #available(macOS 26.0, *) {
            Task {
                do {
                    try await startRecordingAsync()
                } catch {
                    await MainActor.run {
                        self.isRecording = false
                        self.onError?(error)
                    }
                }
            }
        } else {
            isRecording = false
            throw NSError(domain: "DualSourceTranscriber", code: 2, userInfo: [NSLocalizedDescriptionKey: "Requires macOS 26 or later"])
        }
    }

    @available(macOS 26.0, *)
    private func startRecordingAsync() async throws {
        // Create hybrid transcriber
        let transcriber = HybridDualTranscriber()
        hybridTranscriber = transcriber

        // Set up callbacks
        transcriber.onSnippet = { [weak self] text in
            self?.onSnippet?(text)
        }

        transcriber.onFinalTranscript = { [weak self] text in
            self?.onFinalTranscript?(text)
        }

        transcriber.onError = { [weak self] error in
            self?.onError?(error)
        }

        // Start the hybrid transcriber
        try await transcriber.startRecording()
    }

    func stopRecording() {
        guard isRecording else { return }

        Task {
            if #available(macOS 26.0, *) {
                if let transcriber = hybridTranscriber as? HybridDualTranscriber {
                    await transcriber.stopRecording()
                }
            }

            await MainActor.run {
                self.hybridTranscriber = nil
                self.isRecording = false
            }
        }
    }

    // MARK: - Transcript Generation

    func generateAnnotatedTranscript() -> String {
        if #available(macOS 26.0, *) {
            if let transcriber = hybridTranscriber as? HybridDualTranscriber {
                return transcriber.generateAnnotatedTranscript()
            }
        }
        return "(No transcript available)"
    }

    var mergedTranscript: String {
        if #available(macOS 26.0, *) {
            if let transcriber = hybridTranscriber as? HybridDualTranscriber {
                return transcriber.mergedTranscript
            }
        }
        return ""
    }
}
