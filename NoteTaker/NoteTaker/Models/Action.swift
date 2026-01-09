import Foundation

struct Action: Equatable {
    let text: String
    let isCompleted: Bool
    let lineNumber: Int

    /// Parse actions from note content
    static func parse(from content: String) -> [Action] {
        var actions: [Action] = []
        let lines = content.components(separatedBy: "\n")

        // Incomplete action pattern: [] or [ ]
        let incompletePattern = #"\[\s*\](.*)$"#
        let incompleteRegex = try? NSRegularExpression(pattern: incompletePattern)

        // Complete action pattern: [x] or [X]
        let completePattern = #"\[[xX]\](.*)$"#
        let completeRegex = try? NSRegularExpression(pattern: completePattern)

        for (index, line) in lines.enumerated() {
            let range = NSRange(line.startIndex..., in: line)

            // Check for incomplete action
            if let match = incompleteRegex?.firstMatch(in: line, range: range),
               let textRange = Range(match.range(at: 1), in: line) {
                actions.append(Action(
                    text: String(line[textRange]).trimmingCharacters(in: .whitespaces),
                    isCompleted: false,
                    lineNumber: index + 1
                ))
                continue
            }

            // Check for complete action
            if let match = completeRegex?.firstMatch(in: line, range: range),
               let textRange = Range(match.range(at: 1), in: line) {
                actions.append(Action(
                    text: String(line[textRange]).trimmingCharacters(in: .whitespaces),
                    isCompleted: true,
                    lineNumber: index + 1
                ))
            }
        }

        return actions
    }
}
