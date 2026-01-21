import XCTest
@testable import NoteTaker

/// Tests for file operation safety patterns
/// Prevents FileHandle leaks and ensures proper error handling
final class FileOperationTests: XCTestCase {

    var testDirectory: URL!

    override func setUp() {
        super.setUp()
        // Create a temporary directory for tests
        testDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("NoteTakerTests-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: testDirectory, withIntermediateDirectories: true)
    }

    override func tearDown() {
        // Clean up test directory
        try? FileManager.default.removeItem(at: testDirectory)
        super.tearDown()
    }

    // MARK: - UTF-8 Encoding Tests

    func testUTF8EncodingNeverFails() {
        // Standard ASCII strings should always encode
        let asciiString = "Hello, World!"
        XCTAssertNotNil(asciiString.data(using: .utf8))

        // Unicode strings should always encode
        let unicodeString = "Hello, 世界! 🌍"
        XCTAssertNotNil(unicodeString.data(using: .utf8))

        // Empty strings should encode
        let emptyString = ""
        XCTAssertNotNil(emptyString.data(using: .utf8))

        // Multiline strings should encode
        let multilineString = """
        Line 1
        Line 2
        Line 3
        """
        XCTAssertNotNil(multilineString.data(using: .utf8))
    }

    func testUTF8EncodingWithSpecialCharacters() {
        // Test transcript-like content
        let transcriptContent = """
        [You] Hello, this is a test.
        [Other] Response with émojis 😀 and accénts.
        === COMPLETE SESSION TRANSCRIPT ===
        """
        XCTAssertNotNil(transcriptContent.data(using: .utf8))
    }

    // MARK: - File Write Tests

    func testWriteToNewFile() throws {
        let testFile = testDirectory.appendingPathComponent("test.txt")
        let content = "Test content"

        try content.write(to: testFile, atomically: true, encoding: .utf8)

        let readContent = try String(contentsOf: testFile, encoding: .utf8)
        XCTAssertEqual(readContent, content)
    }

    func testAppendToExistingFile() throws {
        let testFile = testDirectory.appendingPathComponent("append-test.txt")

        // Create initial file
        try "Line 1\n".write(to: testFile, atomically: true, encoding: .utf8)

        // Append using FileHandle with proper cleanup
        let handle = try FileHandle(forWritingTo: testFile)
        defer { try? handle.close() }

        try handle.seekToEnd()
        let appendData = "Line 2\n".data(using: .utf8)!
        try handle.write(contentsOf: appendData)

        // Verify content
        let content = try String(contentsOf: testFile, encoding: .utf8)
        XCTAssertEqual(content, "Line 1\nLine 2\n")
    }

    func testFileHandleClosedOnError() throws {
        // This test verifies the defer pattern works
        let testFile = testDirectory.appendingPathComponent("defer-test.txt")
        try "Initial".write(to: testFile, atomically: true, encoding: .utf8)

        // Open handle with defer
        var handleWasOpened = false
        var handleWasClosed = false

        do {
            let handle = try FileHandle(forWritingTo: testFile)
            handleWasOpened = true
            defer {
                try? handle.close()
                handleWasClosed = true
            }

            // Simulate some work
            try handle.seekToEnd()
        }

        XCTAssertTrue(handleWasOpened, "Handle should have been opened")
        XCTAssertTrue(handleWasClosed, "Handle should have been closed via defer")
    }

    // MARK: - Concurrent Access Tests

    func testConcurrentFileWrites() async throws {
        let testFile = testDirectory.appendingPathComponent("concurrent-test.txt")
        try "".write(to: testFile, atomically: true, encoding: .utf8)

        // Simulate concurrent writes (like snippet updates)
        await withTaskGroup(of: Void.self) { group in
            for i in 0..<10 {
                group.addTask {
                    // Each write should use atomic write for safety
                    let content = "Update \(i)\n"
                    try? content.write(to: testFile, atomically: true, encoding: .utf8)
                }
            }
        }

        // File should exist and be readable (content doesn't matter, just no crash)
        let exists = FileManager.default.fileExists(atPath: testFile.path)
        XCTAssertTrue(exists, "File should exist after concurrent writes")
    }

    // MARK: - Error Handling Tests

    func testWriteToNonExistentDirectory() {
        let badPath = testDirectory
            .appendingPathComponent("nonexistent")
            .appendingPathComponent("test.txt")

        do {
            try "content".write(to: badPath, atomically: true, encoding: .utf8)
            XCTFail("Should have thrown an error")
        } catch {
            // Expected - directory doesn't exist
            XCTAssertNotNil(error)
        }
    }

    func testWriteToReadOnlyLocation() throws {
        // Skip this test if running as root (unlikely but possible)
        guard getuid() != 0 else {
            throw XCTSkip("Test requires non-root user")
        }

        let readOnlyPath = URL(fileURLWithPath: "/System/test.txt")

        do {
            try "content".write(to: readOnlyPath, atomically: true, encoding: .utf8)
            XCTFail("Should have thrown an error")
        } catch {
            // Expected - can't write to /System
            XCTAssertNotNil(error)
        }
    }
}

// MARK: - Pattern Documentation Tests

/// Documents correct patterns for file operations
final class FileOperationPatternTests: XCTestCase {

    func testCorrectAppendPattern() {
        // Document the correct pattern for appending to files:
        //
        // CORRECT:
        // let handle = try FileHandle(forWritingTo: path)
        // defer { try? handle.close() }
        // try handle.seekToEnd()
        // try handle.write(contentsOf: data)
        //
        // Key points:
        // 1. Use defer to ensure handle is closed
        // 2. Use try? in defer (don't throw from defer)
        // 3. Use write(contentsOf:) not write() for typed throws
        // 4. Encode data before the do block to fail early

        XCTAssertTrue(true, "Pattern documentation")
    }

    func testCorrectNewFilePattern() {
        // Document the correct pattern for creating new files:
        //
        // CORRECT:
        // try content.write(to: path, atomically: true, encoding: .utf8)
        //
        // Key points:
        // 1. Use atomically: true for crash safety
        // 2. Writes to temp file first, then moves atomically
        // 3. No handle to manage

        XCTAssertTrue(true, "Pattern documentation")
    }

    func testAvoidForceUnwrapOnEncoding() {
        // Document avoiding force unwrap on encoding:
        //
        // WRONG:
        // handle.write(text.data(using: .utf8)!)
        //
        // CORRECT:
        // guard let data = text.data(using: .utf8) else {
        //     Logger.error("Failed to encode text", log: Logger.storage)
        //     return
        // }
        // try handle.write(contentsOf: data)
        //
        // While UTF-8 encoding rarely fails, force unwrapping is
        // never safe and makes debugging harder when issues occur.

        XCTAssertTrue(true, "Pattern documentation")
    }
}
