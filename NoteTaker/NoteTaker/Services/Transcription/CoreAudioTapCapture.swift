import Foundation
import AVFoundation
import CoreAudio

/// Captures system audio using Core Audio Taps API (macOS 14.4+)
/// Uses AVAudioEngine with the tap aggregate device as input
///
/// References:
/// - https://github.com/insidegui/AudioCap
/// - https://github.com/makeusabrew/audiotee
/// - https://developer.apple.com/documentation/CoreAudio/capturing-system-audio-with-core-audio-taps
@available(macOS 14.4, *)
class CoreAudioTapCapture {
    // MARK: - Properties

    private var tapObjectID: AudioObjectID = kAudioObjectUnknown
    private var aggregateDeviceID: AudioDeviceID = kAudioObjectUnknown
    private let tapUUID = UUID()

    private var audioEngine: AVAudioEngine?
    private var isCapturing = false

    // Callback for audio buffers
    var onAudioBuffer: ((AVAudioPCMBuffer) -> Void)?
    var onError: ((Error) -> Void)?

    // MARK: - Lifecycle

    deinit {
        stopCapture()
    }

    // MARK: - Capture Control

    func startCapture() throws {
        guard !isCapturing else { return }

        do {
            try createProcessTap()
            try createAggregateDevice()
            try setupAudioEngine()
            isCapturing = true
        } catch {
            cleanup()
            throw error
        }
    }

    func stopCapture() {
        guard isCapturing else { return }

        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine = nil

        cleanup()
        isCapturing = false
    }

    // MARK: - Private Setup

    private func createProcessTap() throws {
        let tapDescription = CATapDescription(monoGlobalTapButExcludeProcesses: [])

        tapDescription.name = "NoteTakerSystemAudioTap"
        tapDescription.uuid = tapUUID

        if tapDescription.responds(to: Selector(("setPrivateTap:"))) {
            tapDescription.setValue(true, forKey: "privateTap")
        }
        if tapDescription.responds(to: Selector(("setMuteBehavior:"))) {
            tapDescription.setValue(0, forKey: "muteBehavior")
        }
        if tapDescription.responds(to: Selector(("setExclusive:"))) {
            tapDescription.setValue(false, forKey: "exclusive")
        }

        var tapID: AudioObjectID = kAudioObjectUnknown
        let status = AudioHardwareCreateProcessTap(tapDescription, &tapID)

        guard status == noErr else {
            throw CoreAudioTapError.tapCreationFailed(status)
        }

        self.tapObjectID = tapID
    }

    private func createAggregateDevice() throws {
        let aggregateDescription: [String: Any] = [
            kAudioAggregateDeviceNameKey as String: "NoteTakerAggregateDevice",
            kAudioAggregateDeviceUIDKey as String: "com.notetaker.aggregate.\(UUID().uuidString)",
            kAudioAggregateDeviceSubDeviceListKey as String: [] as CFArray,
            kAudioAggregateDeviceIsPrivateKey as String: true,
            kAudioAggregateDeviceIsStackedKey as String: false
        ]

        var aggregateID: AudioDeviceID = kAudioObjectUnknown
        var status = AudioHardwareCreateAggregateDevice(
            aggregateDescription as CFDictionary,
            &aggregateID
        )

        guard status == noErr else {
            throw CoreAudioTapError.aggregateDeviceCreationFailed(status)
        }

        self.aggregateDeviceID = aggregateID

        var tapUID: CFString?
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioTapPropertyUID,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var dataSize = UInt32(MemoryLayout<CFString?>.size)

        status = AudioObjectGetPropertyData(
            tapObjectID,
            &propertyAddress,
            0, nil,
            &dataSize,
            &tapUID
        )

        guard status == noErr, let uid = tapUID else {
            throw CoreAudioTapError.propertyQueryFailed(status)
        }

        let tapArray = [uid] as CFArray
        var tapArrayRef = tapArray
        propertyAddress.mSelector = kAudioAggregateDevicePropertyTapList

        status = AudioObjectSetPropertyData(
            aggregateDeviceID,
            &propertyAddress,
            0, nil,
            UInt32(MemoryLayout<CFArray>.size),
            &tapArrayRef
        )

        guard status == noErr else {
            throw CoreAudioTapError.tapCreationFailed(status)
        }
    }

    private func setupAudioEngine() throws {
        let engine = AVAudioEngine()

        let audioUnit = engine.inputNode.audioUnit!
        var deviceID = aggregateDeviceID

        let status = AudioUnitSetProperty(
            audioUnit,
            kAudioOutputUnitProperty_CurrentDevice,
            kAudioUnitScope_Global,
            0,
            &deviceID,
            UInt32(MemoryLayout<AudioDeviceID>.size)
        )

        guard status == noErr else {
            throw CoreAudioTapError.deviceStartFailed(status)
        }

        let inputFormat = engine.inputNode.outputFormat(forBus: 0)

        guard inputFormat.sampleRate > 0 else {
            throw CoreAudioTapError.invalidFormat
        }

        engine.inputNode.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { [weak self] buffer, _ in
            guard let self = self else { return }

            DispatchQueue.main.async {
                self.onAudioBuffer?(buffer)
            }
        }

        engine.prepare()
        try engine.start()

        self.audioEngine = engine
    }

    private func cleanup() {
        if aggregateDeviceID != kAudioObjectUnknown {
            AudioHardwareDestroyAggregateDevice(aggregateDeviceID)
            aggregateDeviceID = kAudioObjectUnknown
        }

        if tapObjectID != kAudioObjectUnknown {
            AudioHardwareDestroyProcessTap(tapObjectID)
            tapObjectID = kAudioObjectUnknown
        }
    }
}

// MARK: - Error Types

enum CoreAudioTapError: LocalizedError {
    case tapCreationFailed(OSStatus)
    case aggregateDeviceCreationFailed(OSStatus)
    case propertyQueryFailed(OSStatus)
    case deviceStartFailed(OSStatus)
    case ioProcCreationFailed(OSStatus)
    case invalidFormat
    case notAvailable

    var errorDescription: String? {
        switch self {
        case .tapCreationFailed(let status):
            return "Failed to create audio tap (OSStatus: \(status))"
        case .aggregateDeviceCreationFailed(let status):
            return "Failed to create aggregate device (OSStatus: \(status))"
        case .propertyQueryFailed(let status):
            return "Failed to query audio property (OSStatus: \(status))"
        case .deviceStartFailed(let status):
            return "Failed to start audio device (OSStatus: \(status))"
        case .ioProcCreationFailed(let status):
            return "Failed to create IO procedure (OSStatus: \(status))"
        case .invalidFormat:
            return "Invalid audio format"
        case .notAvailable:
            return "Core Audio Taps not available (requires macOS 14.4+)"
        }
    }
}
