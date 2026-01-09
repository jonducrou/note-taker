import Foundation

struct Connection: Equatable {
    let subject: String      // Full text: "A -> B" or "A <- B"
    let direction: Direction
    let isCompleted: Bool
    let lineNumber: Int

    enum Direction: String {
        case right  // A -> B
        case left   // A <- B
    }

    /// Parse connections from note content
    static func parse(from content: String) -> [Connection] {
        var connections: [Connection] = []
        let lines = content.components(separatedBy: "\n")

        // Right arrow patterns: -> (incomplete) or -/> or -\> (complete)
        let rightIncompletePattern = #"(\w[\w\s]*)\s*->\s*(\w[\w\s]*)"#
        let rightCompletePattern = #"(\w[\w\s]*)\s*-[/\\]>\s*(\w[\w\s]*)"#

        // Left arrow patterns: <- (incomplete) or </- or <\- (complete)
        let leftIncompletePattern = #"(\w[\w\s]*)\s*<-\s*(\w[\w\s]*)"#
        let leftCompletePattern = #"(\w[\w\s]*)\s*<[/\\]-\s*(\w[\w\s]*)"#

        let rightIncompleteRegex = try? NSRegularExpression(pattern: rightIncompletePattern)
        let rightCompleteRegex = try? NSRegularExpression(pattern: rightCompletePattern)
        let leftIncompleteRegex = try? NSRegularExpression(pattern: leftIncompletePattern)
        let leftCompleteRegex = try? NSRegularExpression(pattern: leftCompletePattern)

        for (index, line) in lines.enumerated() {
            let range = NSRange(line.startIndex..., in: line)

            // Check complete patterns first (they contain the incomplete pattern)

            // Right complete: -/>
            if let match = rightCompleteRegex?.firstMatch(in: line, range: range),
               let leftRange = Range(match.range(at: 1), in: line),
               let rightRange = Range(match.range(at: 2), in: line) {
                let left = String(line[leftRange]).trimmingCharacters(in: .whitespaces)
                let right = String(line[rightRange]).trimmingCharacters(in: .whitespaces)
                connections.append(Connection(
                    subject: "\(left) -> \(right)",
                    direction: .right,
                    isCompleted: true,
                    lineNumber: index + 1
                ))
                continue
            }

            // Left complete: </-
            if let match = leftCompleteRegex?.firstMatch(in: line, range: range),
               let leftRange = Range(match.range(at: 1), in: line),
               let rightRange = Range(match.range(at: 2), in: line) {
                let left = String(line[leftRange]).trimmingCharacters(in: .whitespaces)
                let right = String(line[rightRange]).trimmingCharacters(in: .whitespaces)
                connections.append(Connection(
                    subject: "\(left) <- \(right)",
                    direction: .left,
                    isCompleted: true,
                    lineNumber: index + 1
                ))
                continue
            }

            // Right incomplete: ->
            if let match = rightIncompleteRegex?.firstMatch(in: line, range: range),
               let leftRange = Range(match.range(at: 1), in: line),
               let rightRange = Range(match.range(at: 2), in: line) {
                let left = String(line[leftRange]).trimmingCharacters(in: .whitespaces)
                let right = String(line[rightRange]).trimmingCharacters(in: .whitespaces)
                connections.append(Connection(
                    subject: "\(left) -> \(right)",
                    direction: .right,
                    isCompleted: false,
                    lineNumber: index + 1
                ))
                continue
            }

            // Left incomplete: <-
            if let match = leftIncompleteRegex?.firstMatch(in: line, range: range),
               let leftRange = Range(match.range(at: 1), in: line),
               let rightRange = Range(match.range(at: 2), in: line) {
                let left = String(line[leftRange]).trimmingCharacters(in: .whitespaces)
                let right = String(line[rightRange]).trimmingCharacters(in: .whitespaces)
                connections.append(Connection(
                    subject: "\(left) <- \(right)",
                    direction: .left,
                    isCompleted: false,
                    lineNumber: index + 1
                ))
            }
        }

        return connections
    }
}
