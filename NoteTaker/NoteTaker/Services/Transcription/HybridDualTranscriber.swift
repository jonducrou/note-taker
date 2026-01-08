import Foundation
import AVFoundation
import Speech

/// Hybrid transcription using two different APIs to avoid conflicts:
/// - SFSpeechRecognizer for microphone (traditional API) → [You]
/// - SpeechAnalyzer for system audio (macOS 26 API) → [Other]
@available(macOS 26.0, *)
class HybridDualTranscriber {
    // MARK: - Properties

    // Microphone: Traditional SFSpeechRecognizer
    private let micSpeechRecognizer: SFSpeechRecognizer?
    private var micRecognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var micRecognitionTask: SFSpeechRecognitionTask?
    private let micAudioEngine = AVAudioEngine()

    // System audio: New SpeechAnalyzer API
    private var sysTranscriber: SpeechTranscriber?
    private var sysAnalyzer: SpeechAnalyzer?
    private var sysAnalyzerFormat: AVAudioFormat?
    private var sysInputBuilder: AsyncStream<AnalyzerInput>.Continuation?
    private var sysRecognizerTask: Task<Void, Never>?
    private var sysAudioConverter: AVAudioConverter?

    // System audio capture
    private var systemAudioCapture: ScreenCaptureAudio?

    // Transcripts - separate for each source
    private var userTranscript = ""
    private var systemTranscript = ""

    // Callbacks
    var onSnippet: ((String) -> Void)?
    var onFinalTranscript: ((String) -> Void)?
    var onError: ((Error) -> Void)?

    private(set) var isRecording = false

    // MARK: - Initialisation

    init(locale: Locale = Locale(identifier: "en-AU")) {
        micSpeechRecognizer = SFSpeechRecognizer(locale: locale)
    }

    // MARK: - Recording Control

    func startRecording() async throws {
        guard !isRecording else { return }

        userTranscript = ""
        systemTranscript = ""
        isRecording = true

        // Start system audio with SpeechAnalyzer FIRST
        try await startSystemAudioWithSpeechAnalyzer()

        // Then start microphone with SFSpeechRecognizer
        try startMicrophoneWithSFSpeechRecognizer()
    }

    func stopRecording() async {
        guard isRecording else { return }

        // Stop microphone
        stopMicrophoneCapture()

        // Stop system audio
        await stopSystemAudioCapture()

        isRecording = false

        // Generate final transcript
        let finalTranscript = generateAnnotatedTranscript()
        await MainActor.run {
            self.onFinalTranscript?(finalTranscript)
        }
    }

    // MARK: - Microphone with SFSpeechRecognizer

    private func startMicrophoneWithSFSpeechRecognizer() throws {
        guard let speechRecognizer = micSpeechRecognizer, speechRecognizer.isAvailable else {
            throw SpeechRecognizerError.recognizerNotAvailable
        }

        // Clean up any existing session
        if micAudioEngine.isRunning {
            micAudioEngine.stop()
            micAudioEngine.inputNode.removeTap(onBus: 0)
        }
        micRecognitionRequest?.endAudio()
        micRecognitionRequest = nil
        micRecognitionTask?.cancel()
        micRecognitionTask = nil

        // Create recognition request
        micRecognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let request = micRecognitionRequest else {
            throw SpeechRecognizerError.requestCreationFailed
        }

        request.shouldReportPartialResults = true

        // Create recognition task
        micRecognitionTask = speechRecognizer.recognitionTask(with: request) { [weak self] result, error in
            self?.handleMicrophoneResult(result: result, error: error)
        }

        // Configure audio engine
        let inputNode = micAudioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        guard recordingFormat.sampleRate > 0 else {
            throw NSError(domain: "HybridDualTranscriber", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid microphone audio format"])
        }

        // Install tap
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.micRecognitionRequest?.append(buffer)
        }

        // Start audio engine
        micAudioEngine.prepare()
        try micAudioEngine.start()
    }

    private func stopMicrophoneCapture() {
        if micAudioEngine.isRunning {
            micAudioEngine.stop()
            micAudioEngine.inputNode.removeTap(onBus: 0)
        }
        micRecognitionRequest?.endAudio()
        micRecognitionRequest = nil
        micRecognitionTask?.cancel()
        micRecognitionTask = nil
    }

    private func handleMicrophoneResult(result: SFSpeechRecognitionResult?, error: Error?) {
        if let error = error {
            let nsError = error as NSError

            // Silence timeout - restart recognition
            if nsError.domain == "kAFAssistantErrorDomain" && nsError.code == 1110 {
                restartMicrophoneRecognition()
                return
            }
            return
        }

        if let result = result {
            userTranscript = result.bestTranscription.formattedString

            // Emit combined snippet
            if !result.isFinal {
                emitCombinedSnippet()
            }
        }
    }

    private func restartMicrophoneRecognition() {
        guard isRecording, let speechRecognizer = micSpeechRecognizer else { return }

        let oldRequest = micRecognitionRequest
        let oldTask = micRecognitionTask

        let newRequest = SFSpeechAudioBufferRecognitionRequest()
        newRequest.shouldReportPartialResults = true

        let newTask = speechRecognizer.recognitionTask(with: newRequest) { [weak self] result, error in
            self?.handleMicrophoneResult(result: result, error: error)
        }

        micRecognitionRequest = newRequest
        micRecognitionTask = newTask

        oldRequest?.endAudio()
        oldTask?.cancel()
    }

    // MARK: - System Audio with SpeechAnalyzer

    private func startSystemAudioWithSpeechAnalyzer() async throws {
        // Create transcriber
        let locale = Locale(identifier: "en-AU")
        let transcriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: []
        )
        sysTranscriber = transcriber

        // Check if locale is installed
        let installedLocales = await SpeechTranscriber.installedLocales
        let isInstalled = installedLocales.contains { $0.identifier == locale.identifier }

        if !isInstalled {
            if let downloader = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
                try await downloader.downloadAndInstall()
            }
        }

        // Get best audio format
        sysAnalyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber])

        // Create analyzer
        sysAnalyzer = SpeechAnalyzer(modules: [transcriber])

        // Create input stream
        let (inputSequence, inputBuilder) = AsyncStream<AnalyzerInput>.makeStream()
        sysInputBuilder = inputBuilder

        // Start result processing task
        sysRecognizerTask = Task { [weak self] in
            guard let self = self else { return }
            do {
                for try await result in transcriber.results {
                    let text = String(result.text.characters)

                    if result.isFinal {
                        // Append to system transcript
                        if !self.systemTranscript.isEmpty && !text.isEmpty {
                            self.systemTranscript += " "
                        }
                        self.systemTranscript += text.trimmingCharacters(in: .whitespaces)
                    }

                    // Emit combined snippet
                    await MainActor.run {
                        self.emitCombinedSnippet()
                    }
                }
            } catch {
                // Recognition ended
            }
        }

        // Start analyzer
        try await sysAnalyzer?.start(inputSequence: inputSequence)

        // Now start ScreenCaptureKit
        let capture = ScreenCaptureAudio()
        systemAudioCapture = capture

        capture.onAudioBuffer = { [weak self] buffer in
            self?.handleSystemAudioBuffer(buffer)
        }

        capture.onError = { _ in }

        try await capture.startCapture()
    }

    private func handleSystemAudioBuffer(_ buffer: AVAudioPCMBuffer) {
        guard isRecording, let inputBuilder = sysInputBuilder, let analyzerFormat = sysAnalyzerFormat else {
            return
        }

        // Convert buffer to analyzer format if needed
        let convertedBuffer: AVAudioPCMBuffer

        if buffer.format == analyzerFormat {
            convertedBuffer = buffer
        } else {
            // Create converter if needed
            if sysAudioConverter == nil {
                sysAudioConverter = AVAudioConverter(from: buffer.format, to: analyzerFormat)
            }

            guard let conv = sysAudioConverter else {
                return
            }

            // Calculate output frame count
            let ratio = analyzerFormat.sampleRate / buffer.format.sampleRate
            let outputFrameCount = AVAudioFrameCount(Double(buffer.frameLength) * ratio)

            guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: analyzerFormat, frameCapacity: outputFrameCount) else {
                return
            }

            var error: NSError?
            conv.convert(to: outputBuffer, error: &error) { inNumPackets, outStatus in
                outStatus.pointee = .haveData
                return buffer
            }

            if error != nil {
                return
            }

            convertedBuffer = outputBuffer
        }

        // Yield to analyzer
        let input = AnalyzerInput(buffer: convertedBuffer)
        inputBuilder.yield(input)
    }

    private func stopSystemAudioCapture() async {
        systemAudioCapture?.stopCapture()
        systemAudioCapture = nil

        sysInputBuilder?.finish()

        do {
            try await sysAnalyzer?.finalizeAndFinishThroughEndOfInput()
        } catch {
            // Finalize may fail if already stopped
        }

        sysRecognizerTask?.cancel()
        sysRecognizerTask = nil
        sysAnalyzer = nil
        sysTranscriber = nil
        sysInputBuilder = nil
        sysAudioConverter = nil
    }

    // MARK: - Snippet Emission

    private func emitCombinedSnippet() {
        var parts: [String] = []

        if !userTranscript.isEmpty {
            parts.append("[You] \(userTranscript)")
        }

        if !systemTranscript.isEmpty {
            parts.append("[Other] \(systemTranscript)")
        }

        if !parts.isEmpty {
            onSnippet?(parts.joined(separator: "\n"))
        }
    }

    // MARK: - Transcript Generation

    func generateAnnotatedTranscript() -> String {
        var lines: [String] = []

        lines.append("=== ANNOTATED TRANSCRIPT ===")
        lines.append("[You] = Your microphone")
        lines.append("[Other] = System audio (other participants)")
        lines.append("")

        if !userTranscript.isEmpty {
            lines.append("[You] \(userTranscript)")
            lines.append("")
        }

        if !systemTranscript.isEmpty {
            lines.append("[Other] \(systemTranscript)")
        }

        if userTranscript.isEmpty && systemTranscript.isEmpty {
            lines.append("(No speech detected)")
        }

        return lines.joined(separator: "\n")
    }

    var mergedTranscript: String {
        var parts: [String] = []
        if !userTranscript.isEmpty {
            parts.append(userTranscript)
        }
        if !systemTranscript.isEmpty {
            parts.append(systemTranscript)
        }
        return parts.joined(separator: "\n\n")
    }
}
