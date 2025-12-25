import XCTest
@testable import NoteTaker

final class NoteModelTests: XCTestCase {

    func testNoteMetadataCreation() {
        let metadata = NoteMetadata(
            date: "2025-12-24",
            group: "Engineering",
            audience: ["Sarah", "DevTeam"],
            createdAt: Date(),
            updatedAt: Date()
        )

        XCTAssertEqual(metadata.date, "2025-12-24")
        XCTAssertEqual(metadata.group, "Engineering")
        XCTAssertEqual(metadata.audience?.count, 2)
    }

    func testNoteCreation() {
        let metadata = NoteMetadata(
            date: "2025-12-24",
            group: "Test",
            audience: nil,
            createdAt: Date(),
            updatedAt: Date()
        )

        let note = Note(
            id: "2025-12-24_120000.md",
            filename: "2025-12-24_120000.md",
            metadata: metadata,
            content: "Test content"
        )

        XCTAssertEqual(note.id, "2025-12-24_120000.md")
        XCTAssertEqual(note.content, "Test content")
        XCTAssertEqual(note.metadata.group, "Test")
    }

    func testNoteEquality() {
        let metadata = NoteMetadata(
            date: "2025-12-24",
            group: nil,
            audience: nil,
            createdAt: Date(),
            updatedAt: Date()
        )

        let note1 = Note(
            id: "test1.md",
            filename: "test1.md",
            metadata: metadata,
            content: "Content"
        )

        let note2 = Note(
            id: "test1.md",
            filename: "test1.md",
            metadata: metadata,
            content: "Different content"
        )

        let note3 = Note(
            id: "test2.md",
            filename: "test2.md",
            metadata: metadata,
            content: "Content"
        )

        XCTAssertEqual(note1, note2) // Same ID
        XCTAssertNotEqual(note1, note3) // Different ID
    }

    func testActionCreation() {
        let action = Action(text: "Review PR", completed: false, lineNumber: 5)

        XCTAssertEqual(action.text, "Review PR")
        XCTAssertFalse(action.completed)
        XCTAssertEqual(action.lineNumber, 5)
    }

    func testRelatedConnectionCreation() {
        let connection = RelatedConnection(
            subject: "Sarah -> DevTeam",
            direction: .right,
            completed: false,
            lineNumber: 10
        )

        XCTAssertEqual(connection.subject, "Sarah -> DevTeam")
        XCTAssertEqual(connection.direction, .right)
        XCTAssertFalse(connection.completed)
        XCTAssertEqual(connection.lineNumber, 10)
    }

    func testRelatedActionCreation() {
        let actions = [
            Action(text: "Task 1", completed: false, lineNumber: 1),
            Action(text: "Task 2", completed: true, lineNumber: 2)
        ]

        let connections = [
            RelatedConnection(subject: "A -> B", direction: .right, completed: false, lineNumber: 3)
        ]

        let relatedAction = RelatedAction(
            noteId: "2025-12-24_120000.md",
            noteTitle: "Meeting Notes",
            noteDate: Date(),
            actions: actions,
            connections: connections
        )

        XCTAssertEqual(relatedAction.noteId, "2025-12-24_120000.md")
        XCTAssertEqual(relatedAction.noteTitle, "Meeting Notes")
        XCTAssertEqual(relatedAction.actions.count, 2)
        XCTAssertEqual(relatedAction.connections.count, 1)
    }
}
