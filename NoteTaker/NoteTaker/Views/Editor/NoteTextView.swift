import AppKit

/// Custom NSTextView with syntax highlighting and special behaviours
class NoteTextView: NSTextView {
    private let syntaxHighlighter = SyntaxHighlighter()
    private var lastClickTime: Date = .distantPast
    private var lastClickLocation: Int = 0

    override init(frame frameRect: NSRect, textContainer container: NSTextContainer?) {
        super.init(frame: frameRect, textContainer: container)
        setup()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setup()
    }

    convenience init() {
        self.init(frame: .zero, textContainer: nil)
    }

    private func setup() {
        // Focus ring
        focusRingType = .none

        // Make editable and selectable
        isEditable = true
        isSelectable = true
    }

    // MARK: - Syntax Highlighting

    func applySyntaxHighlighting() {
        guard let textStorage = textStorage else { return }

        // Save selection
        let selectedRanges = self.selectedRanges

        // Apply highlighting
        let fullRange = NSRange(location: 0, length: textStorage.length)
        textStorage.beginEditing()

        // Reset to default style
        textStorage.setAttributes([
            .font: font ?? NSFont.monospacedSystemFont(ofSize: 12, weight: .regular),
            .foregroundColor: NSColor.labelColor
        ], range: fullRange)

        // Apply syntax highlighting
        syntaxHighlighter.highlight(textStorage)

        textStorage.endEditing()

        // Restore selection
        self.selectedRanges = selectedRanges
    }

    // MARK: - Double-Click Handling

    override func mouseDown(with event: NSEvent) {
        let now = Date()
        let location = characterIndexForInsertion(at: convert(event.locationInWindow, from: nil))

        // Check for double-click (within 300ms and same general location)
        if now.timeIntervalSince(lastClickTime) < 0.3 && abs(location - lastClickLocation) <= 2 {
            if handleDoubleClick(at: location) {
                lastClickTime = .distantPast
                return
            }
        }

        lastClickTime = now
        lastClickLocation = location
        super.mouseDown(with: event)
    }

    private func handleDoubleClick(at location: Int) -> Bool {
        guard let lineRange = getLineRange(containing: location) else { return false }
        let lineContent = (string as NSString).substring(with: lineRange)

        // Try to toggle action
        if toggleAction(in: lineRange, lineContent: lineContent) {
            return true
        }

        // Try to toggle connection
        if toggleConnection(in: lineRange, lineContent: lineContent) {
            return true
        }

        return false
    }

    private func toggleAction(in lineRange: NSRange, lineContent: String) -> Bool {
        // Check for incomplete action: []
        if let match = lineContent.range(of: #"\[\s*\]"#, options: .regularExpression) {
            let nsRange = NSRange(match, in: lineContent)
            let absoluteRange = NSRange(location: lineRange.location + nsRange.location, length: nsRange.length)
            replaceText(in: absoluteRange, with: "[x]")
            return true
        }

        // Check for complete action: [x] or [X]
        if let match = lineContent.range(of: #"\[[xX]\]"#, options: .regularExpression) {
            let nsRange = NSRange(match, in: lineContent)
            let absoluteRange = NSRange(location: lineRange.location + nsRange.location, length: nsRange.length)
            replaceText(in: absoluteRange, with: "[]")
            return true
        }

        return false
    }

    private func toggleConnection(in lineRange: NSRange, lineContent: String) -> Bool {
        // Patterns to match
        let patterns: [(String, String)] = [
            (#"-/>"#, "->"),       // Complete right -> incomplete
            (#"-\\>"#, "->"),      // Complete right (backslash) -> incomplete
            (#"->"#, "-/>"),      // Incomplete right -> complete
            (#"</-"#, "<-"),      // Complete left -> incomplete
            (#"<\\-"#, "<-"),     // Complete left (backslash) -> incomplete
            (#"<-"#, "</-")       // Incomplete left -> complete
        ]

        for (pattern, replacement) in patterns {
            if let match = lineContent.range(of: pattern, options: .regularExpression) {
                let nsRange = NSRange(match, in: lineContent)
                let absoluteRange = NSRange(location: lineRange.location + nsRange.location, length: nsRange.length)
                replaceText(in: absoluteRange, with: replacement)
                return true
            }
        }

        return false
    }

    // MARK: - Special Key Handling

    /// Handle Enter key - auto-insert bullet points after line 2
    func handleEnterKey() -> Bool {
        guard let selectedRange = selectedRanges.first as? NSRange else { return false }

        // Get current line info
        let lines = string.components(separatedBy: "\n")
        var charCount = 0
        var currentLineIndex = 0

        for (index, line) in lines.enumerated() {
            if charCount + line.count >= selectedRange.location {
                currentLineIndex = index
                break
            }
            charCount += line.count + 1  // +1 for newline
        }

        // Only auto-bullet after line 2 (index >= 2)
        guard currentLineIndex >= 2 else { return false }

        let currentLine = lines[currentLineIndex]

        // If current line starts with "- ", add bullet to new line
        if currentLine.trimmingCharacters(in: .whitespaces).hasPrefix("- ") {
            // Get indentation of current line
            let indentation = currentLine.prefix(while: { $0 == " " || $0 == "\t" })
            insertText("\n\(indentation)- ", replacementRange: selectedRange)
            return true
        }

        return false
    }

    /// Handle Tab key - indent/dedent bullet points
    func handleTabKey(shift: Bool) -> Bool {
        guard let selectedRange = selectedRanges.first as? NSRange,
              let lineRange = getLineRange(containing: selectedRange.location) else {
            return false
        }

        let lineContent = (string as NSString).substring(with: lineRange)

        // Only handle bullet lines
        guard lineContent.trimmingCharacters(in: .whitespaces).hasPrefix("- ") else {
            return false
        }

        if shift {
            // Dedent: remove 2 spaces from start if present
            if lineContent.hasPrefix("  ") {
                let newLine = String(lineContent.dropFirst(2))
                replaceText(in: lineRange, with: newLine)
                return true
            }
        } else {
            // Indent: add 2 spaces at start
            let newLine = "  " + lineContent
            replaceCharacters(in: lineRange, with: newLine)

            // Adjust cursor position
            if let range = selectedRanges.first as? NSRange {
                setSelectedRange(NSRange(location: range.location + 2, length: 0))
            }
            return true
        }

        return false
    }

    // MARK: - Helpers

    private func getLineRange(containing location: Int) -> NSRange? {
        guard location >= 0 && location <= string.count else { return nil }
        return (string as NSString).lineRange(for: NSRange(location: location, length: 0))
    }

    private func replaceText(in range: NSRange, with newText: String) {
        guard let textStorage = textStorage else { return }
        textStorage.replaceCharacters(in: range, with: newText)
        applySyntaxHighlighting()

        // Trigger delegate
        NotificationCenter.default.post(name: NSText.didChangeNotification, object: self)
    }
}
