import XCTest
@testable import NoteTaker

final class NoteParserTests: XCTestCase {

    func testParseNoteWithFrontmatter() throws {
        let content = """
        ---
        date: 2025-12-28
        group: product
        audience:
          - sarah
          - team
        created_at: 2025-12-28T10:00:00.000Z
        updated_at: 2025-12-28T10:30:00.000Z
        ---

        #product @sarah @team

        Meeting Notes

        ## Actions
        [] Review the proposal
        [x] Send follow-up email
        """

        let (metadata, body) = try NoteParser.parse(content)

        XCTAssertEqual(metadata.date, "2025-12-28")
        XCTAssertEqual(metadata.group, "product")
        XCTAssertEqual(metadata.audience, ["sarah", "team"])
        XCTAssertTrue(body.contains("#product @sarah @team"))
        XCTAssertTrue(body.contains("[] Review the proposal"))
    }

    func testParseNoteWithoutFrontmatter() throws {
        let content = """
        #product @sarah

        Some meeting notes
        [] Do something
        """

        let (metadata, body) = try NoteParser.parse(content)

        // Should have default metadata
        XCTAssertNotNil(metadata.date)
        XCTAssertNil(metadata.group)
        XCTAssertNil(metadata.audience)

        // Body should be the entire content
        XCTAssertEqual(body, content)
    }

    func testParseInlineArray() throws {
        let content = """
        ---
        date: 2025-12-28
        audience: [sarah, team]
        created_at: 2025-12-28T10:00:00.000Z
        updated_at: 2025-12-28T10:30:00.000Z
        ---

        Content here
        """

        let (metadata, _) = try NoteParser.parse(content)

        XCTAssertEqual(metadata.audience, ["sarah", "team"])
    }
}

final class NoteWriterTests: XCTestCase {

    func testWriteNote() throws {
        let metadata = NoteMetadata(
            date: "2025-12-28",
            group: "product",
            audience: ["sarah", "team"],
            createdAt: Date(),
            updatedAt: Date()
        )

        let note = Note(
            id: "2025-12-28_100000",
            metadata: metadata,
            content: "#product @sarah @team\n\nMeeting notes"
        )

        let output = try NoteWriter.write(note)

        XCTAssertTrue(output.hasPrefix("---\n"))
        XCTAssertTrue(output.contains("date: 2025-12-28"))
        XCTAssertTrue(output.contains("group: product"))
        XCTAssertTrue(output.contains("audience:"))
        XCTAssertTrue(output.contains("- sarah"))
        XCTAssertTrue(output.contains("- team"))
        XCTAssertTrue(output.contains("#product @sarah @team"))
    }

    func testStripAggregatedContent() throws {
        let metadata = NoteMetadata(
            date: "2025-12-28",
            group: nil,
            audience: nil,
            createdAt: Date(),
            updatedAt: Date()
        )

        let note = Note(
            id: "2025-12-28_100000",
            metadata: metadata,
            content: """
            Original content

            --------
            Related Note (Today)
            [] Some action
            """
        )

        let output = try NoteWriter.write(note)

        XCTAssertTrue(output.contains("Original content"))
        XCTAssertFalse(output.contains("--------"))
        XCTAssertFalse(output.contains("Related Note"))
    }
}
