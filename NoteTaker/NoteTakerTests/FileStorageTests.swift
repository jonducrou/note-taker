import XCTest
@testable import NoteTaker

final class RelatedActionsMatchingTests: XCTestCase {

    func testAudienceOverlapDetection() {
        // Test the Set.isDisjoint logic used in getRelatedActions
        let noteAudience = Set(["sarah", "mike", "devteam"])
        let queryAudience = Set(["sarah", "john"])

        // Should overlap (sarah is in both)
        XCTAssertFalse(noteAudience.isDisjoint(with: queryAudience))
    }

    func testNoAudienceOverlap() {
        let noteAudience = Set(["alice", "bob"])
        let queryAudience = Set(["sarah", "john"])

        // Should not overlap
        XCTAssertTrue(noteAudience.isDisjoint(with: queryAudience))
    }

    func testCaseInsensitiveMatching() {
        // The service lowercases audience for comparison
        let noteAudience = Set(["Sarah", "Mike"].map { $0.lowercased() })
        let queryAudience = Set(["sarah", "JOHN"].map { $0.lowercased() })

        // Should overlap (sarah matches)
        XCTAssertFalse(noteAudience.isDisjoint(with: queryAudience))
    }

    func testEmptyAudienceNoMatch() {
        let noteAudience = Set<String>()
        let queryAudience = Set(["sarah"])

        // Empty should not match anything
        XCTAssertTrue(noteAudience.isDisjoint(with: queryAudience))
    }
}

final class RelatedActionModelTests: XCTestCase {

    func testRelatedActionFormattedDateToday() {
        let related = RelatedAction(
            noteId: "2025-12-28_100000",
            noteTitle: "Test",
            noteDate: Date(),
            actions: [],
            connections: []
        )

        XCTAssertEqual(related.formattedDate, "Today")
    }

    func testRelatedActionFormattedDateYesterday() {
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Date())!
        let related = RelatedAction(
            noteId: "2025-12-27_100000",
            noteTitle: "Test",
            noteDate: yesterday,
            actions: [],
            connections: []
        )

        XCTAssertEqual(related.formattedDate, "Yesterday")
    }

    func testRelatedActionFormattedDateOlder() {
        let twoDaysAgo = Calendar.current.date(byAdding: .day, value: -2, to: Date())!
        let related = RelatedAction(
            noteId: "2025-12-26_100000",
            noteTitle: "Test",
            noteDate: twoDaysAgo,
            actions: [],
            connections: []
        )

        // Should be formatted as "EEE d MMM"
        XCTAssertNotEqual(related.formattedDate, "Today")
        XCTAssertNotEqual(related.formattedDate, "Yesterday")
    }

    func testRelatedActionWithActionsAndConnections() {
        let actions = [
            Action(text: "Task 1", isCompleted: false, lineNumber: 1),
            Action(text: "Task 2", isCompleted: false, lineNumber: 2)
        ]
        let connections = [
            Connection(subject: "A -> B", direction: .right, isCompleted: false, lineNumber: 3)
        ]

        let related = RelatedAction(
            noteId: "2025-12-28_100000",
            noteTitle: "Meeting",
            noteDate: Date(),
            actions: actions,
            connections: connections
        )

        XCTAssertEqual(related.actions.count, 2)
        XCTAssertEqual(related.connections.count, 1)
        XCTAssertEqual(related.noteTitle, "Meeting")
    }
}

final class NoteMetadataTests: XCTestCase {

    func testMetadataWithAllFields() {
        let metadata = NoteMetadata(
            date: "2025-12-28",
            group: "ProductMeeting",
            audience: ["sarah", "mike"],
            createdAt: Date(),
            updatedAt: Date()
        )

        XCTAssertEqual(metadata.date, "2025-12-28")
        XCTAssertEqual(metadata.group, "ProductMeeting")
        XCTAssertEqual(metadata.audience, ["sarah", "mike"])
    }

    func testMetadataWithNilFields() {
        let metadata = NoteMetadata(
            date: "2025-12-28",
            group: nil,
            audience: nil,
            createdAt: Date(),
            updatedAt: Date()
        )

        XCTAssertNil(metadata.group)
        XCTAssertNil(metadata.audience)
    }
}

final class FileStorageErrorTests: XCTestCase {

    func testNoteNotFoundError() {
        let error = FileStorageError.noteNotFound("2025-12-28_100000")
        XCTAssertEqual(error.errorDescription, "Note not found: 2025-12-28_100000")
    }

    func testParseError() {
        let error = FileStorageError.parseError("Invalid YAML")
        XCTAssertEqual(error.errorDescription, "Parse error: Invalid YAML")
    }
}

// MARK: - ExtractedAction Tests

final class ExtractedActionTests: XCTestCase {

    func testExtractedActionCreation() {
        let action = ExtractedAction(
            text: "Follow up with design team",
            type: .action,
            importance: .high,
            owner: "Sarah",
            deadline: "Friday",
            context: "Discussed in product sync",
            noteId: "2025-12-28_100000",
            tags: ["sarah", "design"],
            extractedAt: Date()
        )

        XCTAssertEqual(action.text, "Follow up with design team")
        XCTAssertEqual(action.type, .action)
        XCTAssertEqual(action.importance, .high)
        XCTAssertEqual(action.owner, "Sarah")
        XCTAssertEqual(action.deadline, "Friday")
        XCTAssertEqual(action.tags, ["sarah", "design"])
    }

    func testExtractedActionTypes() {
        let actionType = ExtractedAction.ActionType.action
        let commitmentType = ExtractedAction.ActionType.commitment
        let expectationType = ExtractedAction.ActionType.expectation

        XCTAssertEqual(actionType.rawValue, "action")
        XCTAssertEqual(commitmentType.rawValue, "commitment")
        XCTAssertEqual(expectationType.rawValue, "expectation")
    }

    func testImportanceComparison() {
        let low = ExtractedAction.Importance.low
        let medium = ExtractedAction.Importance.medium
        let high = ExtractedAction.Importance.high
        let critical = ExtractedAction.Importance.critical

        XCTAssertTrue(low < medium)
        XCTAssertTrue(medium < high)
        XCTAssertTrue(high < critical)
        XCTAssertFalse(critical < high)
    }

    func testImportanceRawValues() {
        XCTAssertEqual(ExtractedAction.Importance.low.rawValue, 0)
        XCTAssertEqual(ExtractedAction.Importance.medium.rawValue, 1)
        XCTAssertEqual(ExtractedAction.Importance.high.rawValue, 2)
        XCTAssertEqual(ExtractedAction.Importance.critical.rawValue, 3)
    }

    func testExtractedActionIdentifiable() {
        let action1 = ExtractedAction(
            text: "Task 1",
            type: .action,
            importance: .medium,
            owner: nil,
            deadline: nil,
            context: nil,
            noteId: "test",
            tags: [],
            extractedAt: nil
        )

        let action2 = ExtractedAction(
            text: "Task 1",
            type: .action,
            importance: .medium,
            owner: nil,
            deadline: nil,
            context: nil,
            noteId: "test",
            tags: [],
            extractedAt: nil
        )

        // Each action should have unique ID
        XCTAssertNotEqual(action1.id, action2.id)
    }
}

final class ExtractionErrorTests: XCTestCase {

    func testNotConfiguredError() {
        let error = ExtractionError.notConfigured
        XCTAssertEqual(error.errorDescription, "Action extraction not configured. Please set API endpoint and key.")
    }

    func testInvalidEndpointError() {
        let error = ExtractionError.invalidEndpoint
        XCTAssertEqual(error.errorDescription, "Invalid API endpoint URL")
    }

    func testInvalidResponseError() {
        let error = ExtractionError.invalidResponse
        XCTAssertEqual(error.errorDescription, "Invalid response from API")
    }

    func testParseErrorDescription() {
        let error = ExtractionError.parseError
        XCTAssertEqual(error.errorDescription, "Failed to parse API response")
    }

    func testApiError() {
        let error = ExtractionError.apiError("Rate limit exceeded")
        XCTAssertEqual(error.errorDescription, "API error: Rate limit exceeded")
    }
}
