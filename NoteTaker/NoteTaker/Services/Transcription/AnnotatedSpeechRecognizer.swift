import Foundation
import Speech
import AVFoundation

/// Speech recognizer that annotates transcripts with speaker source
class AnnotatedSpeechRecognizer {
    enum Source: String {
        case user = "You"
        case other = "Other"
    }

    /// A timestamped transcript segment
    struct Segment {
        let source: Source
        let text: String
        let timestamp: Date
    }

    // MARK: - Private Properties

    private let speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let source: Source

    private var currentText = ""
    private var lastEmittedLength = 0

    // Callbacks
    var onSegment: ((Segment) -> Void)?
    var onError: ((Error) -> Void)?

    private(set) var isActive = false

    // MARK: - Initialisation

    init(source: Source, locale: Locale = Locale(identifier: "en-AU")) {
        self.source = source
        self.speechRecognizer = SFSpeechRecognizer(locale: locale)
    }

    // MARK: - Recognition Control

    /// Start recognition (creates request but doesn't start audio - call appendBuffer)
    func startRecognition() throws {
        guard let speechRecognizer = speechRecognizer, speechRecognizer.isAvailable else {
            throw SpeechRecognizerError.recognizerNotAvailable
        }

        stopRecognition()

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()

        guard let recognitionRequest = recognitionRequest else {
            throw SpeechRecognizerError.requestCreationFailed
        }

        recognitionRequest.shouldReportPartialResults = true

        if speechRecognizer.supportsOnDeviceRecognition {
            recognitionRequest.requiresOnDeviceRecognition = true
        }

        recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            self?.handleResult(result: result, error: error)
        }

        currentText = ""
        lastEmittedLength = 0
        isActive = true
    }

    private var isRestarting = false

    /// Append audio buffer to recognition
    func appendBuffer(_ buffer: AVAudioPCMBuffer) {
        if isRestarting { return }

        guard let request = recognitionRequest else { return }

        request.append(buffer)
    }

    /// Stop recognition
    func stopRecognition() {
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()

        recognitionRequest = nil
        recognitionTask = nil
        isActive = false

        if !currentText.isEmpty && currentText.count > lastEmittedLength {
            emitSegment()
        }

        currentText = ""
        lastEmittedLength = 0
    }

    /// Restart recognition (for silence timeout handling)
    func restartRecognition() {
        guard isActive, let speechRecognizer = speechRecognizer else { return }
        guard !isRestarting else { return }

        isRestarting = true

        let savedText = currentText

        let oldRequest = recognitionRequest
        let oldTask = recognitionTask

        let newRequest = SFSpeechAudioBufferRecognitionRequest()
        newRequest.shouldReportPartialResults = true
        if speechRecognizer.supportsOnDeviceRecognition {
            newRequest.requiresOnDeviceRecognition = true
        }

        recognitionRequest = newRequest

        recognitionTask = speechRecognizer.recognitionTask(with: newRequest) { [weak self] result, error in
            self?.handleResult(result: result, error: error)
        }

        oldRequest?.endAudio()
        oldTask?.cancel()

        currentText = savedText
        isRestarting = false
    }

    // MARK: - Private

    private func handleResult(result: SFSpeechRecognitionResult?, error: Error?) {
        if let error = error {
            let nsError = error as NSError

            if nsError.domain == "kAFAssistantErrorDomain" && nsError.code == 1110 {
                DispatchQueue.main.async {
                    self.restartRecognition()
                }
                return
            }

            onError?(error)
            return
        }

        if let result = result {
            let transcription = result.bestTranscription.formattedString
            currentText = transcription

            if transcription.count >= lastEmittedLength + 10 {
                emitSegment()
            }
        }
    }

    private func emitSegment() {
        guard !currentText.isEmpty else { return }

        let segment = Segment(
            source: source,
            text: currentText,
            timestamp: Date()
        )

        lastEmittedLength = currentText.count
        onSegment?(segment)
    }

    // MARK: - Final Transcript

    /// Get the complete transcript for this source
    var finalTranscript: String {
        return currentText
    }
}
