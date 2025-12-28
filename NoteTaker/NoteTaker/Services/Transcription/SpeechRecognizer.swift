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

        // Check availability
        if speechRecognizer == nil {
            print("Speech recognizer not available for locale: \(locale.identifier)")
        }
    }

    // MARK: - Recording Control

    func startRecording() throws {
        guard let speechRecognizer = speechRecognizer, speechRecognizer.isAvailable else {
            throw SpeechRecognizerError.recognizerNotAvailable
        }

        // Cancel any existing task
        stopRecording()

        // Note: AVAudioSession is iOS only. On macOS, AVAudioEngine works directly.

        // Create recognition request
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()

        guard let recognitionRequest = recognitionRequest else {
            throw SpeechRecognizerError.requestCreationFailed
        }

        recognitionRequest.shouldReportPartialResults = true
        recognitionRequest.requiresOnDeviceRecognition = true  // Offline recognition

        // Create recognition task
        recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }

            if let error = error {
                self.handleError(error)
                return
            }

            if let result = result {
                let transcription = result.bestTranscription.formattedString

                DispatchQueue.main.async {
                    self.transcript = transcription
                }

                // Emit snippet for partial results
                if !result.isFinal {
                    self.onSnippet?(transcription)
                } else {
                    // Final result
                    self.onFinalTranscript?(transcription)
                }
            }
        }

        // Configure audio input
        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }

        // Start audio engine
        audioEngine.prepare()
        try audioEngine.start()

        DispatchQueue.main.async {
            self.isRecording = true
            self.transcript = ""
            self.error = nil
        }
    }

    func stopRecording() {
        // Stop audio engine
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }

        // End recognition request
        recognitionRequest?.endAudio()
        recognitionRequest = nil

        // Cancel recognition task
        recognitionTask?.cancel()
        recognitionTask = nil

        DispatchQueue.main.async {
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
