import Foundation
import AVFoundation
import ScreenCaptureKit

/// Captures system audio (other participants in calls) using ScreenCaptureKit
@available(macOS 13.0, *)
class SystemAudioCapture: NSObject {
    private var stream: SCStream?
    private var streamOutput: AudioStreamOutput?

    // Callback for audio buffers
    var onAudioBuffer: ((AVAudioPCMBuffer) -> Void)?
    var onError: ((Error) -> Void)?

    private(set) var isCapturing = false

    /// Start capturing system audio
    func startCapture() async throws {
        guard !isCapturing else { return }

        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)

        guard let display = content.displays.first else {
            throw SystemAudioCaptureError.noDisplayAvailable
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])

        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.width = 1
        config.height = 1
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)

        config.sampleRate = 16000
        config.channelCount = 1

        let stream = SCStream(filter: filter, configuration: config, delegate: nil)
        self.stream = stream

        let output = AudioStreamOutput { [weak self] buffer in
            self?.onAudioBuffer?(buffer)
        }
        self.streamOutput = output

        try stream.addStreamOutput(output, type: .audio, sampleHandlerQueue: .global(qos: .userInteractive))

        try await stream.startCapture()

        isCapturing = true
    }

    /// Stop capturing
    func stopCapture() async {
        guard isCapturing, let stream = stream else { return }

        do {
            try await stream.stopCapture()
        } catch {
            // Stop capture failed
        }

        self.stream = nil
        self.streamOutput = nil
        isCapturing = false
    }
}

/// Stream output handler for audio
@available(macOS 13.0, *)
private class AudioStreamOutput: NSObject, SCStreamOutput {
    let onBuffer: (AVAudioPCMBuffer) -> Void

    init(onBuffer: @escaping (AVAudioPCMBuffer) -> Void) {
        self.onBuffer = onBuffer
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }

        guard let formatDescription = sampleBuffer.formatDescription,
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription) else {
            return
        }

        guard let audioFormat = AVAudioFormat(streamDescription: asbd) else {
            return
        }

        guard let blockBuffer = sampleBuffer.dataBuffer else {
            return
        }

        let frameCount = AVAudioFrameCount(sampleBuffer.numSamples)
        guard let pcmBuffer = AVAudioPCMBuffer(pcmFormat: audioFormat, frameCapacity: frameCount) else {
            return
        }

        pcmBuffer.frameLength = frameCount

        var dataPointer: UnsafeMutablePointer<Int8>?
        var length: Int = 0

        CMBlockBufferGetDataPointer(blockBuffer, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &length, dataPointerOut: &dataPointer)

        if let dataPointer = dataPointer, let floatData = pcmBuffer.floatChannelData {
            memcpy(floatData[0], dataPointer, length)
        }

        onBuffer(pcmBuffer)
    }
}

/// Errors for system audio capture
enum SystemAudioCaptureError: LocalizedError {
    case noDisplayAvailable
    case captureNotSupported
    case permissionDenied

    var errorDescription: String? {
        switch self {
        case .noDisplayAvailable:
            return "No display available for screen capture"
        case .captureNotSupported:
            return "System audio capture is not supported on this device"
        case .permissionDenied:
            return "Screen recording permission is required for system audio capture"
        }
    }
}
