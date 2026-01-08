import Foundation
import Speech
import AVFoundation

/// Wrapper for Apple's SFSpeechRecognizer
class SpeechRecognizer: ObservableObject {
    // MARK: - Published State

    @Published private(set) var isRecording = false
    @Published private(set) var transcript = ""
    @Published private(set) var error: Error?

    // MARK: - Private Properties

    private let speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()

    // Callbacks
    var onSnippet: ((String) -> Void)?
    var onFinalTranscript: ((String) -> Void)?
    var onError: ((Error) -> Void)?

    // MARK: - Initialisation

    init(locale: Locale = Locale(identifier: "en-AU")) {
        speechRecognizer = SFSpeechRecognizer(locale: locale)
    }

    // MARK: - Recording Control

    func startRecording() throws {
        guard let speechRecognizer = speechRecognizer, speechRecognizer.isAvailable else {
            throw SpeechRecognizerError.recognizerNotAvailable
        }

        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask?.cancel()
        recognitionTask = nil

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()

        guard let recognitionRequest = recognitionRequest else {
            throw SpeechRecognizerError.requestCreationFailed
        }

        recognitionRequest.shouldReportPartialResults = true

        if speechRecognizer.supportsOnDeviceRecognition {
            recognitionRequest.requiresOnDeviceRecognition = true
        }

        recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }

            if let error = error {
                let nsError = error as NSError
                if nsError.domain == "kAFAssistantErrorDomain" && nsError.code == 1110 {
                    DispatchQueue.main.async {
                        self.restartRecognition()
                    }
                    return
                }
                self.handleError(error)
                return
            }

            if let result = result {
                let transcription = result.bestTranscription.formattedString

                DispatchQueue.main.async {
                    self.transcript = transcription
                }

                if !result.isFinal {
                    self.onSnippet?(transcription)
                } else {
                    self.onFinalTranscript?(transcription)
                }
            }
        }

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()

        DispatchQueue.main.async {
            self.isRecording = true
            self.transcript = ""
            self.error = nil
        }
    }

    /// Restart recognition after silence timeout (preserves accumulated transcript)
    private func restartRecognition() {
        guard isRecording, let speechRecognizer = speechRecognizer else { return }

        recognitionRequest?.endAudio()
        recognitionTask?.cancel()

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest = recognitionRequest else { return }

        recognitionRequest.shouldReportPartialResults = true
        if speechRecognizer.supportsOnDeviceRecognition {
            recognitionRequest.requiresOnDeviceRecognition = true
        }

        recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }

            if let error = error {
                let nsError = error as NSError
                if nsError.domain == "kAFAssistantErrorDomain" && nsError.code == 1110 {
                    DispatchQueue.main.async {
                        self.restartRecognition()
                    }
                    return
                }
                self.handleError(error)
                return
            }

            if let result = result {
                let transcription = result.bestTranscription.formattedString

                DispatchQueue.main.async {
                    self.transcript = transcription
                }

                if !result.isFinal {
                    self.onSnippet?(transcription)
                } else {
                    self.onFinalTranscript?(transcription)
                }
            }
        }

        let inputNode = audioEngine.inputNode
        inputNode.removeTap(onBus: 0)
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }
    }

    func stopRecording() {
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }

        recognitionRequest?.endAudio()

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self = self else { return }

            if !self.transcript.isEmpty {
                self.onFinalTranscript?(self.transcript)
            }

            self.recognitionRequest = nil
            self.recognitionTask?.cancel()
            self.recognitionTask = nil
            self.isRecording = false
        }
    }

    // MARK: - Error Handling

    private func handleError(_ error: Error) {
        DispatchQueue.main.async {
            self.error = error
            self.isRecording = false
        }
        onError?(error)
        stopRecording()
    }
}

// MARK: - Errors

enum SpeechRecognizerError: LocalizedError {
    case recognizerNotAvailable
    case requestCreationFailed
    case permissionDenied

    var errorDescription: String? {
        switch self {
        case .recognizerNotAvailable:
            return "Speech recognition is not available on this device."
        case .requestCreationFailed:
            return "Failed to create speech recognition request."
        case .permissionDenied:
            return "Speech recognition permission was denied."
        }
    }
}

// MARK: - Authorization

extension SpeechRecognizer {
    static func requestAuthorization(completion: @escaping (Bool) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            DispatchQueue.main.async {
                completion(status == .authorized)
            }
        }
    }

    static var authorizationStatus: SFSpeechRecognizerAuthorizationStatus {
        SFSpeechRecognizer.authorizationStatus()
    }

    static var isAuthorized: Bool {
        authorizationStatus == .authorized
    }
}
