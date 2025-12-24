import Foundation

/// Metadata stored in YAML frontmatter
struct NoteMetadata: Codable {
    var date: String
    var group: String?
    var audience: [String]?
    var createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case date
        case group
        case audience
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

/// Represents a single note
struct Note: Identifiable, Equatable {
    let id: String
    let filename: String
    var metadata: NoteMetadata
    var content: String

    static func == (lhs: Note, rhs: Note) -> Bool {
        lhs.id == rhs.id
    }
}

/// Action item within a note
struct Action {
    let text: String
    let completed: Bool
    let lineNumber: Int
}

/// Connection between subjects
struct RelatedConnection {
    let subject: String
    let direction: ConnectionDirection
    let completed: Bool
    let lineNumber: Int

    enum ConnectionDirection: String {
        case left
        case right
    }
}

/// Aggregated actions from related notes
struct RelatedAction {
    let noteId: String
    let noteTitle: String
    let noteDate: Date
    let actions: [Action]
    let connections: [RelatedConnection]
}
