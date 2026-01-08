import Foundation
import AVFoundation
import Speech

/// Modern speech-to-text using macOS 26's SpeechAnalyzer API
/// Supports multiple audio sources feeding into a single transcription pipeline
@available(macOS 26.0, *)
class SpeechAnalyzerTranscriber {
    // MARK: - Properties

    private var transcriber: SpeechTranscriber?
    private var analyzer: SpeechAnalyzer?
    private var analyzerFormat: AVAudioFormat?
    private var inputBuilder: AsyncStream<AnalyzerInput>.Continuation?
    private var recognizerTask: Task<Void, Never>?

    // Audio format converter for each source
    private var micConverter: AVAudioConverter?
    private var sysConverter: AVAudioConverter?

    // Track source of current audio for annotation
    private var lastMicBufferTime: Date?
    private var lastSysBufferTime: Date?

    // Accumulated transcript - finalized segments
    private var finalizedTranscript = ""
    // Current volatile (in-progress) segment
    private var volatileTranscript = ""

    // Callbacks
    var onSnippet: ((String) -> Void)?
    var onFinalTranscript: ((String) -> Void)?
    var onError: ((Error) -> Void)?

    private(set) var isRecording = false

    // MARK: - Initialisation

    init() {}

    // MARK: - Recording Control

    func startRecording() async throws {
        guard !isRecording else { return }

        finalizedTranscript = ""
        volatileTranscript = ""
        isRecording = true

        // Create transcriber with Australian English locale
        let locale = Locale(identifier: "en-AU")
        transcriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: [.audioTimeRange]
        )

        guard let transcriber = transcriber else {
            throw SpeechRecognizerError.requestCreationFailed
        }

        // Check if locale is installed
        let installedLocales = await SpeechTranscriber.installedLocales
        let isInstalled = installedLocales.contains { $0.identifier == locale.identifier }

        if !isInstalled {
            if let downloader = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
                try await downloader.downloadAndInstall()
            }
        }

        analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber])

        // Create analyzer
        analyzer = SpeechAnalyzer(modules: [transcriber])

        // Create input stream
        let (inputSequence, inputBuilder) = AsyncStream<AnalyzerInput>.makeStream()
        self.inputBuilder = inputBuilder

        // Start result processing task
        recognizerTask = Task { [weak self] in
            guard let self = self else { return }
            do {
                for try await result in transcriber.results {
                    let text = String(result.text.characters)

                    if result.isFinal {
                        if !self.finalizedTranscript.isEmpty && !text.isEmpty {
                            self.finalizedTranscript += " "
                        }
                        self.finalizedTranscript += text.trimmingCharacters(in: .whitespaces)
                        self.volatileTranscript = ""
                    } else {
                        self.volatileTranscript = text
                        let fullText = self.finalizedTranscript + (self.finalizedTranscript.isEmpty ? "" : " ") + text
                        await MainActor.run {
                            self.onSnippet?(fullText)
                        }
                    }
                }
            } catch {
                await MainActor.run {
                    self.onError?(error)
                }
            }
        }

        try await analyzer?.start(inputSequence: inputSequence)
    }

    func stopRecording() async {
        guard isRecording else { return }

        inputBuilder?.finish()

        do {
            try await analyzer?.finalizeAndFinishThroughEndOfInput()
        } catch {
            // Finalize may fail if already stopped
        }

        recognizerTask?.cancel()
        recognizerTask = nil

        analyzer = nil
        transcriber = nil
        inputBuilder = nil
        micConverter = nil
        sysConverter = nil

        isRecording = false

        let finalText = finalizedTranscript + (volatileTranscript.isEmpty ? "" : " " + volatileTranscript)

        await MainActor.run {
            self.onFinalTranscript?(finalText)
        }
    }

    // MARK: - Audio Buffer Input

    /// Append audio buffer from microphone
    func appendMicrophoneBuffer(_ buffer: AVAudioPCMBuffer) {
        lastMicBufferTime = Date()
        appendBuffer(buffer, source: "mic", converter: &micConverter)
    }

    /// Append audio buffer from system audio
    func appendSystemBuffer(_ buffer: AVAudioPCMBuffer) {
        lastSysBufferTime = Date()
        appendBuffer(buffer, source: "sys", converter: &sysConverter)
    }

    private func appendBuffer(_ buffer: AVAudioPCMBuffer, source: String, converter: inout AVAudioConverter?) {
        guard isRecording, let inputBuilder = inputBuilder, let analyzerFormat = analyzerFormat else {
            return
        }

        // Convert buffer to analyzer format if needed
        let convertedBuffer: AVAudioPCMBuffer

        if buffer.format == analyzerFormat {
            convertedBuffer = buffer
        } else {
            // Create converter if needed
            if converter == nil {
                converter = AVAudioConverter(from: buffer.format, to: analyzerFormat)
            }

            guard let conv = converter else { return }

            // Calculate output frame count based on sample rate ratio
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

            if error != nil { return }

            convertedBuffer = outputBuffer
        }

        // Yield to analyzer
        let input = AnalyzerInput(buffer: convertedBuffer)
        inputBuilder.yield(input)
    }

    // MARK: - Transcript

    var transcript: String {
        let full = finalizedTranscript + (volatileTranscript.isEmpty ? "" : " " + volatileTranscript)
        return full.trimmingCharacters(in: .whitespaces)
    }
}
