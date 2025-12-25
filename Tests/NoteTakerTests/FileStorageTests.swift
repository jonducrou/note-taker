import XCTest
@testable import NoteTaker

final class FileStorageTests: XCTestCase {
    var fileStorage: FileStorage!
    var testNotesDirectory: URL!

    override func setUp() {
        super.setUp()
        fileStorage = FileStorage()

        // Use a test-specific notes directory
        let tempDir = FileManager.default.temporaryDirectory
        testNotesDirectory = tempDir.appendingPathComponent("TestNotes-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: testNotesDirectory, withIntermediateDirectories: true)
    }

    override func tearDown() {
        // Clean up test directory
        try? FileManager.default.removeItem(at: testNotesDirectory)
        super.tearDown()
    }

    func testExtractMetadata() {
        let content = "#ProductTeam @Sarah @DevTeam\n\nMeeting notes here"
        let metadata = fileStorage.extractMetadata(from: content)

        XCTAssertEqual(metadata.group, "ProductTeam")
        XCTAssertEqual(metadata.audience?.count, 2)
        XCTAssertTrue(metadata.audience?.contains("Sarah") ?? false)
        XCTAssertTrue(metadata.audience?.contains("DevTeam") ?? false)
    }

    func testExtractMetadataOldFormat() {
        let content = "#Product @audience:Sarah,DevTeam\n\nNotes"
        let metadata = fileStorage.extractMetadata(from: content)

        XCTAssertEqual(metadata.group, "Product")
        XCTAssertEqual(metadata.audience?.count, 2)
        XCTAssertTrue(metadata.audience?.contains("Sarah") ?? false)
        XCTAssertTrue(metadata.audience?.contains("DevTeam") ?? false)
    }

    func testSaveNote() {
        let content = "#Test @Person\n\n[] Action item\n[x] Completed action"
        let result = fileStorage.saveNote(content)

        XCTAssertTrue(result.success)
        XCTAssertFalse(result.id.isEmpty)
        XCTAssertTrue(result.id.hasSuffix(".md"))
    }

    func testCountIncompleteItems() {
        let content = """
        [] First action
        [x] Completed action
        [] Second action
        Subject -> Object
        Completed -/> Done
        """

        let count = fileStorage.countIncompleteItems(in: content)
        XCTAssertEqual(count, 3) // 2 incomplete actions + 1 incomplete connection
    }

    func testCountIncompleteItemsWithBackwardConnections() {
        let content = """
        [] Action
        Object <- Subject
        Done <-/ Completed
        """

        let count = fileStorage.countIncompleteItems(in: content)
        XCTAssertEqual(count, 2) // 1 incomplete action + 1 incomplete backward connection
    }

    func testLoadNotes() {
        // Save a test note
        let content1 = "#Test1\n\nFirst note"
        let result1 = fileStorage.saveNote(content1)
        XCTAssertTrue(result1.success)

        let content2 = "#Test2\n\nSecond note"
        let result2 = fileStorage.saveNote(content2)
        XCTAssertTrue(result2.success)

        // Load notes
        let notes = fileStorage.loadNotes()
        XCTAssertGreaterThanOrEqual(notes.count, 2)
    }

    func testDeleteNote() {
        // Create a note
        let content = "#DeleteTest\n\nThis will be deleted"
        let result = fileStorage.saveNote(content)
        XCTAssertTrue(result.success)

        // Delete it
        let deleteResult = fileStorage.deleteNote(id: result.id)
        XCTAssertTrue(deleteResult)

        // Verify it's gone
        let notes = fileStorage.loadNotes()
        let foundNote = notes.first { $0.id == result.id }
        XCTAssertNil(foundNote)
    }

    func testGetRecentGroupSuggestions() {
        // Save notes with groups
        _ = fileStorage.saveNote("#Engineering\n\nNote 1")
        _ = fileStorage.saveNote("#Product\n\nNote 2")
        _ = fileStorage.saveNote("#Engineering\n\nNote 3")

        let suggestions = fileStorage.getRecentGroupSuggestions()
        XCTAssertTrue(suggestions.contains("Engineering"))
        XCTAssertTrue(suggestions.contains("Product"))
    }

    func testGetRecentGroupSuggestionsWithPrefix() {
        _ = fileStorage.saveNote("#Engineering\n\nNote 1")
        _ = fileStorage.saveNote("#Product\n\nNote 2")

        let suggestions = fileStorage.getRecentGroupSuggestions(prefix: "Eng")
        XCTAssertTrue(suggestions.contains("Engineering"))
        XCTAssertFalse(suggestions.contains("Product"))
    }

    func testGetRecentAudienceSuggestions() {
        _ = fileStorage.saveNote("@Sarah\n\nNote 1")
        _ = fileStorage.saveNote("@DevTeam\n\nNote 2")
        _ = fileStorage.saveNote("@Sarah @John\n\nNote 3")

        let suggestions = fileStorage.getRecentAudienceSuggestions()
        XCTAssertTrue(suggestions.contains("Sarah"))
        XCTAssertTrue(suggestions.contains("DevTeam"))
        XCTAssertTrue(suggestions.contains("John"))
    }
}
