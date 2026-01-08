import Foundation
import AVFoundation
import ScreenCaptureKit

/// Captures system audio using ScreenCaptureKit (macOS 13+)
@available(macOS 13.0, *)
class ScreenCaptureAudio: NSObject {
    // MARK: - Properties

    private var stream: SCStream?
    private var isCapturing = false

    // Callback for audio buffers
    var onAudioBuffer: ((AVAudioPCMBuffer) -> Void)?
    var onError: ((Error) -> Void)?

    // MARK: - Capture Control

    func startCapture() async throws {
        guard !isCapturing else { return }

        // Get shareable content
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)

        // Get the main display
        guard let display = content.displays.first else {
            throw ScreenCaptureError.noDisplay
        }

        // Create filter for the display (we only want audio, but need a display for the stream)
        let filter = SCContentFilter(display: display, excludingWindows: [])

        // Configure stream for audio only
        let config = SCStreamConfiguration()
        config.width = 2  // Minimum size since we only want audio
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)  // 1 fps - we don't care about video
        config.capturesAudio = true
        config.sampleRate = 48000
        config.channelCount = 1

        // Create stream
        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        self.stream = stream

        // Add audio output
        try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: DispatchQueue(label: "audio.capture"))

        // Start capture
        try await stream.startCapture()

        isCapturing = true
    }

    func stopCapture() {
        guard isCapturing else { return }

        Task {
            try? await stream?.stopCapture()
            stream = nil
        }

        isCapturing = false
    }
}

// MARK: - SCStreamDelegate

@available(macOS 13.0, *)
extension ScreenCaptureAudio: SCStreamDelegate {
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        onError?(error)
    }
}

// MARK: - SCStreamOutput

@available(macOS 13.0, *)
extension ScreenCaptureAudio: SCStreamOutput {
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }

        // Convert CMSampleBuffer to AVAudioPCMBuffer
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

        // Copy audio data
        var length = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        CMBlockBufferGetDataPointer(blockBuffer, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &length, dataPointerOut: &dataPointer)

        if let data = dataPointer, let channelData = pcmBuffer.floatChannelData {
            memcpy(channelData[0], data, length)
        }

        DispatchQueue.main.async {
            self.onAudioBuffer?(pcmBuffer)
        }
    }
}

// MARK: - Errors

enum ScreenCaptureError: LocalizedError {
    case noDisplay
    case permissionDenied

    var errorDescription: String? {
        switch self {
        case .noDisplay:
            return "No display found for screen capture"
        case .permissionDenied:
            return "Screen capture permission denied"
        }
    }
}
