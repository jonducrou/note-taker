import AVFoundation
import Speech
import AppKit
import ApplicationServices

/// Manager for requesting and checking system permissions
class PermissionsManager {
    static let shared = PermissionsManager()

    private init() {}

    // MARK: - Accessibility (required for global hotkeys)

    /// Check if accessibility access is granted (required for global hotkeys)
    var hasAccessibilityPermission: Bool {
        AXIsProcessTrusted()
    }

    /// Request accessibility access - prompts the user if not granted
    /// Returns true if already granted, false if user needs to enable it
    @discardableResult
    func requestAccessibilityPermission() -> Bool {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        return AXIsProcessTrustedWithOptions(options)
    }

    // MARK: - Microphone

    /// Check if microphone access is granted
    var hasMicrophonePermission: Bool {
        AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
    }

    /// Request microphone access
    func requestMicrophonePermission(completion: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            completion(true)

        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                DispatchQueue.main.async {
                    completion(granted)
                }
            }

        case .denied, .restricted:
            completion(false)

        @unknown default:
            completion(false)
        }
    }

    // MARK: - Speech Recognition

    /// Check if speech recognition access is granted
    var hasSpeechRecognitionPermission: Bool {
        SFSpeechRecognizer.authorizationStatus() == .authorized
    }

    /// Request speech recognition access
    func requestSpeechRecognitionPermission(completion: @escaping (Bool) -> Void) {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized:
            completion(true)

        case .notDetermined:
            SFSpeechRecognizer.requestAuthorization { status in
                DispatchQueue.main.async {
                    completion(status == .authorized)
                }
            }

        case .denied, .restricted:
            completion(false)

        @unknown default:
            completion(false)
        }
    }

    // MARK: - Combined Permission Request

    /// Request all permissions needed for transcription
    func requestTranscriptionPermissions(completion: @escaping (Bool) -> Void) {
        requestMicrophonePermission { [weak self] micGranted in
            guard micGranted else {
                completion(false)
                return
            }

            self?.requestSpeechRecognitionPermission { speechGranted in
                completion(speechGranted)
            }
        }
    }

    /// Check if all transcription permissions are granted
    var hasTranscriptionPermissions: Bool {
        hasMicrophonePermission && hasSpeechRecognitionPermission
    }

    // MARK: - Open System Preferences

    /// Open System Preferences to the privacy section
    func openPrivacySettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone") {
            NSWorkspace.shared.open(url)
        }
    }
}
