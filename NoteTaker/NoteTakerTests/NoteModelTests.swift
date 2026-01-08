import XCTest
@testable import NoteTaker

final class NoteAudienceTests: XCTestCase {

    func testParseAudienceFromFirstLine() {
        let note = Note(
            id: "2025-12-28_100000",
            metadata: NoteMetadata(
                date: "2025-12-28",
                group: nil,
                audience: nil,
                createdAt: Date(),
                updatedAt: Date()
            ),
            content: """
            #project @sarah @mike @devteam

            ## Notes
            Some content here
            """
        )

        XCTAssertEqual(note.audience.count, 3)
        XCTAssertTrue(note.audience.contains("sarah"))
        XCTAssertTrue(note.audience.contains("mike"))
        XCTAssertTrue(note.audience.contains("devteam"))
    }

    func testAudienceOnlyFromFirstLine() {
        let note = Note(
            id: "2025-12-28_100000",
            metadata: NoteMetadata(
                date: "2025-12-28",
                group: nil,
                audience: nil,
                createdAt: Date(),
                updatedAt: Date()
            ),
            content: """
            #project @sarah

            ## Notes
            This mentions @mike but should not be in audience
            """
        )

        XCTAssertEqual(note.audience.count, 1)
        XCTAssertTrue(note.audience.contains("sarah"))
        XCTAssertFalse(note.audience.contains("mike"))
    }

    func testEmptyAudience() {
        let note = Note(
            id: "2025-12-28_100000",
            metadata: NoteMetadata(
                date: "2025-12-28",
                group: nil,
                audience: nil,
                createdAt: Date(),
                updatedAt: Date()
            ),
            content: """
            #project

            ## Notes
            No audience tags here
            """
        )

        XCTAssertTrue(note.audience.isEmpty)
    }

    func testAudienceWithHyphensAndNumbers() {
        let note = Note(
            id: "2025-12-28_100000",
            metadata: NoteMetadata(
                date: "2025-12-28",
                group: nil,
                audience: nil,
                createdAt: Date(),
                updatedAt: Date()
            ),
            content: "@dev-team @user123 @project_x"
        )

        XCTAssertEqual(note.audience.count, 3)
        XCTAssertTrue(note.audience.contains("dev-team"))
        XCTAssertTrue(note.audience.contains("user123"))
        XCTAssertTrue(note.audience.contains("project_x"))
    }
}

final class NoteGroupTests: XCTestCase {

    func testParseGroupFromContent() {
        let note = Note(
            id: "2025-12-28_100000",
            metadata: NoteMetadata(
                date: "2025-12-28",
                group: nil,
                audience: nil,
                createdAt: Date(),
                updatedAt: Date()
            ),
            content: "#ProductMeeting @sarah\n\n## Notes"
        )

        XCTAssertEqual(note.group, "ProductMeeting")
    }

    func testGroupWithHyphens() {
        let note = Note(
            id: "2025-12-28_100000",
            metadata: NoteMetadata(
                date: "2025-12-28",
                group: nil,
                audience: nil,
                createdAt: Date(),
                updatedAt: Date()
            ),
            content: "#sprint-planning @team"
        )

        XCTAssertEqual(note.group, "sprint-planning")
    }

    func testNoGroup() {
        let note = Note(
            id: "2025-12-28_100000",
            metadata: NoteMetadata(
                date: "2025-12-28",
                group: nil,
                audience: nil,
                createdAt: Date(),
                updatedAt: Date()
            ),
            content: "@sarah\n\n## Notes"
        )

        XCTAssertNil(note.group)
    }

    func testFirstGroupOnly() {
        let note = Note(
            id: "2025-12-28_100000",
            metadata: NoteMetadata(
                date: "2025-12-28",
                group: nil,
                audience: nil,
                createdAt: Date(),
                updatedAt: Date()
            ),
            content: "#firstgroup #secondgroup\n\n## Notes"
        )

        XCTAssertEqual(note.group, "firstgroup")
    }
}

final class NoteFormattedDateTests: XCTestCase {

    func testFormattedDate() {
        let note = Note(
            id: "2025-12-28_143100",
            metadata: NoteMetadata(
                date: "2025-12-28",
                group: nil,
                audience: nil,
                createdAt: Date(),
                updatedAt: Date()
            ),
            content: ""
        )

        // Should format as "Sat 28 Dec 14:31"
        XCTAssertTrue(note.formattedDate.contains("28"))
        XCTAssertTrue(note.formattedDate.contains("Dec"))
        XCTAssertTrue(note.formattedDate.contains("14:31"))
    }

    func testInvalidIdFallback() {
        let note = Note(
            id: "invalid-id",
            metadata: NoteMetadata(
                date: "2025-12-28",
                group: nil,
                audience: nil,
                createdAt: Date(),
                updatedAt: Date()
            ),
            content: ""
        )

        XCTAssertEqual(note.formattedDate, "Note Taker")
    }
}

final class NoteCreationTests: XCTestCase {

    func testCreateNewNote() {
        let note = Note.create(content: "Test content")

        // ID should be date-based
        XCTAssertTrue(note.id.contains("-"))
        XCTAssertTrue(note.id.contains("_"))

        // Content should be set
        XCTAssertEqual(note.content, "Test content")

        // Metadata should have dates
        XCTAssertNotNil(note.metadata.createdAt)
        XCTAssertNotNil(note.metadata.updatedAt)
    }

    func testCreateEmptyNote() {
        let note = Note.create()

        XCTAssertEqual(note.content, "")
    }
}
