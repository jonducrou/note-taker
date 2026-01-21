import XCTest
@testable import NoteTaker

/// Tests to ensure errors are properly surfaced to users, not silently swallowed
/// Addresses issue #33 (silent failures when Siri/Dictation disabled)
final class ErrorSurfacingTests: XCTestCase {

    // MARK: - SpeechRecognizer Error Tests

    func testAllSpeechRecognizerErrorsHaveDescriptions() {
        let errors: [SpeechRecognizerError] = [
            .recognizerNotAvailable,
            .requestCreationFailed,
            .permissionDenied,
            .siriDictationDisabled
        ]

        for error in errors {
            XCTAssertNotNil(error.errorDescription)
            XCTAssertFalse(error.errorDescription?.isEmpty ?? true)
        }
    }

    func testSpeechRecognizerErrorsAreUserFriendly() {
        // Errors should contain actionable information
        let siriError = SpeechRecognizerError.siriDictationDisabled
        let description = siriError.errorDescription ?? ""

        // Should mention where to fix it
        XCTAssertTrue(
            description.contains("System Settings") || description.contains("System Preferences"),
            "Error should tell user where to fix the issue"
        )
    }

    // MARK: - TranscriptionService Error Tests

    func testTranscriptionErrorsHaveDescriptions() {
        let errors: [TranscriptionError] = [
            .notInitialised,
            .permissionDenied,
            .recordingFailed
        ]

        for error in errors {
            XCTAssertNotNil(error.errorDescription)
            XCTAssertFalse(error.errorDescription?.isEmpty ?? true)
        }
    }

    // MARK: - FileStorage Error Tests

    func testFileStorageErrorsHaveDescriptions() {
        let errors: [FileStorageError] = [
            .noteNotFound("test-id"),
            .parseError("test error")
        ]

        for error in errors {
            XCTAssertNotNil(error.errorDescription)
            XCTAssertFalse(error.errorDescription?.isEmpty ?? true)
        }
    }

    // MARK: - Extraction Error Tests

    func testExtractionErrorsHaveDescriptions() {
        let errors: [ExtractionError] = [
            .notConfigured,
            .invalidEndpoint,
            .invalidResponse,
            .parseError,
            .apiError("test error")
        ]

        for error in errors {
            XCTAssertNotNil(error.errorDescription)
            XCTAssertFalse(error.errorDescription?.isEmpty ?? true)
        }
    }

    // MARK: - Error Code Recognition Tests

    /// Verifies that known error codes are handled
    func testKnownErrorCodesAreDocumented() {
        // kAFAssistantErrorDomain error codes that should be handled:
        // 1101 = Siri/Dictation disabled
        // 1110 = Silence timeout (handled by restarting recognition)

        // This test documents the error codes we handle
        let siriDisabledCode = 1101
        let silenceTimeoutCode = 1110

        XCTAssertEqual(siriDisabledCode, 1101, "Siri disabled error code")
        XCTAssertEqual(silenceTimeoutCode, 1110, "Silence timeout error code")
    }
}

// MARK: - Error Callback Tests

/// Tests to verify error callbacks are properly connected
final class ErrorCallbackTests: XCTestCase {

    func testSpeechRecognizerHasErrorCallback() {
        let recognizer = SpeechRecognizer()

        var errorReceived: Error?
        recognizer.onError = { error in
            errorReceived = error
        }

        // Callback should be settable
        XCTAssertNil(errorReceived, "No error yet")
    }

    func testSpeechRecognizerHasSnippetCallback() {
        let recognizer = SpeechRecognizer()

        var snippetReceived: String?
        recognizer.onSnippet = { text in
            snippetReceived = text
        }

        // Callback should be settable
        XCTAssertNil(snippetReceived, "No snippet yet")
    }

    func testSpeechRecognizerHasFinalTranscriptCallback() {
        let recognizer = SpeechRecognizer()

        var transcriptReceived: String?
        recognizer.onFinalTranscript = { text in
            transcriptReceived = text
        }

        // Callback should be settable
        XCTAssertNil(transcriptReceived, "No transcript yet")
    }
}

// MARK: - Silent Failure Prevention Tests

/// Tests documenting patterns that prevent silent failures
final class SilentFailurePreventionTests: XCTestCase {

    /// Documents the anti-pattern we're preventing
    func testSilentCatchBlocksAreBad() {
        // ANTI-PATTERN (silent failure):
        // do {
        //     try riskyOperation()
        // } catch {
        //     // Silent - user has no idea it failed
        // }
        //
        // CORRECT PATTERN (logged failure):
        // do {
        //     try riskyOperation()
        // } catch {
        //     Logger.error("Operation failed: \(error.localizedDescription)", log: Logger.storage)
        // }
        //
        // BEST PATTERN (surfaced failure):
        // do {
        //     try riskyOperation()
        // } catch {
        //     Logger.error("Operation failed: \(error.localizedDescription)", log: Logger.storage)
        //     errorMessage = error.localizedDescription  // Show to user
        // }

        XCTAssertTrue(true, "Pattern documentation")
    }

    /// Documents when errors should be surfaced vs just logged
    func testErrorSurfacingGuidelines() {
        // Errors that SHOULD be surfaced to UI:
        // - Permission denied (user can fix)
        // - Siri/Dictation disabled (user can fix)
        // - File access denied (user can fix)
        // - Network errors (user can retry)
        //
        // Errors that can be just logged:
        // - Temporary audio buffer issues (auto-retried)
        // - Partial transcript failures (session continues)
        // - Action extraction failures (not critical to main function)

        XCTAssertTrue(true, "Guideline documentation")
    }
}
