import XCTest
@testable import NoteTaker

final class ActionParsingTests: XCTestCase {

    func testParseIncompleteActions() {
        let content = """
        ## Actions
        [] Review the proposal
        [ ] Send email
        Some other text
        [] Another task
        """

        let actions = Action.parse(from: content)

        XCTAssertEqual(actions.count, 3)
        XCTAssertFalse(actions[0].isCompleted)
        XCTAssertEqual(actions[0].text, "Review the proposal")
        XCTAssertEqual(actions[0].lineNumber, 2)
    }

    func testParseCompletedActions() {
        let content = """
        ## Actions
        [x] Done task
        [X] Also done
        [] Not done
        """

        let actions = Action.parse(from: content)

        XCTAssertEqual(actions.count, 3)
        XCTAssertTrue(actions[0].isCompleted)
        XCTAssertTrue(actions[1].isCompleted)
        XCTAssertFalse(actions[2].isCompleted)
    }

    func testParseMixedActions() {
        let content = """
        #product @team

        ## Actions
        [] First task
        [x] Completed task
        [] Second task
        [X] Another completed

        ## Notes
        Some notes here
        """

        let actions = Action.parse(from: content)

        XCTAssertEqual(actions.count, 4)
        XCTAssertFalse(actions[0].isCompleted)
        XCTAssertTrue(actions[1].isCompleted)
        XCTAssertFalse(actions[2].isCompleted)
        XCTAssertTrue(actions[3].isCompleted)
    }
}

final class ConnectionParsingTests: XCTestCase {

    func testParseIncompleteConnections() {
        let content = """
        ## Connections
        Sarah -> Mike
        Design <- Implementation
        """

        let connections = Connection.parse(from: content)

        XCTAssertEqual(connections.count, 2)

        XCTAssertEqual(connections[0].direction, .right)
        XCTAssertFalse(connections[0].isCompleted)
        XCTAssertEqual(connections[0].subject, "Sarah -> Mike")

        XCTAssertEqual(connections[1].direction, .left)
        XCTAssertFalse(connections[1].isCompleted)
    }

    func testParseCompletedConnections() {
        let content = """
        ## Connections
        Sarah -/> Mike
        Design </- Implementation
        Task -\\> Done
        """

        let connections = Connection.parse(from: content)

        XCTAssertEqual(connections.count, 3)
        XCTAssertTrue(connections[0].isCompleted)
        XCTAssertTrue(connections[1].isCompleted)
        XCTAssertTrue(connections[2].isCompleted)
    }

    func testParseMixedConnections() {
        let content = """
        #project @team

        ## Connections
        Feature -> Requirement
        Bug -/> Fix
        User <- Feedback
        Issue </- Resolution
        """

        let connections = Connection.parse(from: content)

        XCTAssertEqual(connections.count, 4)
        XCTAssertFalse(connections[0].isCompleted)
        XCTAssertTrue(connections[1].isCompleted)
        XCTAssertFalse(connections[2].isCompleted)
        XCTAssertTrue(connections[3].isCompleted)
    }
}

final class NoteIncompleteCountTests: XCTestCase {

    func testIncompleteItemCount() {
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
            ## Actions
            [] Task 1
            [x] Done task
            [] Task 2
            [ ] Task 3

            ## Connections
            A -> B
            C -/> D
            E <- F
            """
        )

        // Should count: 3 incomplete actions + 2 incomplete connections = 5
        XCTAssertEqual(note.incompleteItemCount, 5)
    }

    func testZeroIncompleteItems() {
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
            ## Actions
            [x] All done

            ## Connections
            A -/> B
            """
        )

        XCTAssertEqual(note.incompleteItemCount, 0)
    }
}
