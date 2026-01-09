import Foundation

struct NoteMetadata: Codable, Equatable {
    var date: String           // "2025-12-28"
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

    init(date: String, group: String?, audience: [String]?, createdAt: Date, updatedAt: Date) {
        self.date = date
        self.group = group
        self.audience = audience
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        date = try container.decode(String.self, forKey: .date)
        group = try container.decodeIfPresent(String.self, forKey: .group)
        audience = try container.decodeIfPresent([String].self, forKey: .audience)

        // Handle date parsing - could be ISO8601 string or already Date
        if let createdString = try? container.decode(String.self, forKey: .createdAt) {
            createdAt = ISO8601DateFormatter().date(from: createdString) ?? Date()
        } else {
            createdAt = try container.decode(Date.self, forKey: .createdAt)
        }

        if let updatedString = try? container.decode(String.self, forKey: .updatedAt) {
            updatedAt = ISO8601DateFormatter().date(from: updatedString) ?? Date()
        } else {
            updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        try container.encode(date, forKey: .date)
        try container.encodeIfPresent(group, forKey: .group)
        try container.encodeIfPresent(audience, forKey: .audience)

        let formatter = ISO8601DateFormatter()
        try container.encode(formatter.string(from: createdAt), forKey: .createdAt)
        try container.encode(formatter.string(from: updatedAt), forKey: .updatedAt)
    }
}
