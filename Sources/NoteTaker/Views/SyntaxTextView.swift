import SwiftUI
import AppKit

/// Custom NSTextView with syntax highlighting
class SyntaxHighlightingTextView: NSTextView {
    private let highlighter = SyntaxHighlighter()

    override func didChangeText() {
        super.didChangeText()
        applySyntaxHighlighting()
    }

    private func applySyntaxHighlighting() {
        guard let textStorage = textStorage else { return }

        let fullRange = NSRange(location: 0, length: textStorage.length)
        textStorage.beginEditing()

        // Reset to default attributes
        textStorage.removeAttribute(.foregroundColor, range: fullRange)
        textStorage.removeAttribute(.font, range: fullRange)
        textStorage.addAttribute(.foregroundColor, value: NSColor.textColor, range: fullRange)
        textStorage.addAttribute(.font, value: NSFont.monospacedSystemFont(ofSize: 12, weight: .regular), range: fullRange)

        // Apply syntax highlighting
        highlighter.highlight(textStorage)

        textStorage.endEditing()
    }
}

/// Handles syntax highlighting logic
class SyntaxHighlighter {
    func highlight(_ textStorage: NSTextStorage) {
        let text = textStorage.string
        let lines = text.components(separatedBy: .newlines)

        var currentPosition = 0
        for line in lines {
            let lineRange = NSRange(location: currentPosition, length: line.utf16.count)

            // Highlight actions
            highlightActions(in: line, range: lineRange, textStorage: textStorage)

            // Highlight connections
            highlightConnections(in: line, range: lineRange, textStorage: textStorage)

            // Highlight tags (groups and audience) - these override line colors
            highlightTags(in: line, range: lineRange, textStorage: textStorage)

            currentPosition += line.utf16.count + 1 // +1 for newline
        }
    }

    private func highlightActions(in line: String, range: NSRange, textStorage: NSTextStorage) {
        // Incomplete actions: [] in red
        if line.contains("[]") {
            textStorage.addAttribute(.foregroundColor, value: NSColor(red: 1.0, green: 0.231, blue: 0.188, alpha: 1.0), range: range)
            textStorage.addAttribute(.font, value: NSFont.monospacedSystemFont(ofSize: 12, weight: .bold), range: range)
        }

        // Complete actions: [x] in green
        if line.contains("[x]") {
            textStorage.addAttribute(.foregroundColor, value: NSColor(red: 0.204, green: 0.780, blue: 0.349, alpha: 1.0), range: range)
            textStorage.addAttribute(.font, value: NSFont.monospacedSystemFont(ofSize: 12, weight: .bold), range: range)
        }
    }

    private func highlightConnections(in line: String, range: NSRange, textStorage: NSTextStorage) {
        // Complete connections: -/> or </- in green
        if line.contains("-/>") || line.contains("</-") || line.contains("-\\>") || line.contains("<\\-") {
            textStorage.addAttribute(.foregroundColor, value: NSColor(red: 0.204, green: 0.780, blue: 0.349, alpha: 1.0), range: range)
            textStorage.addAttribute(.font, value: NSFont.monospacedSystemFont(ofSize: 12, weight: .bold), range: range)
        }
        // Incomplete connections: -> or <- in orange
        else if line.contains("->") || line.contains("<-") {
            textStorage.addAttribute(.foregroundColor, value: NSColor(red: 1.0, green: 0.584, blue: 0.0, alpha: 1.0), range: range)
            textStorage.addAttribute(.font, value: NSFont.monospacedSystemFont(ofSize: 12, weight: .bold), range: range)
        }
    }

    private func highlightTags(in line: String, range: NSRange, textStorage: NSTextStorage) {
        let nsLine = line as NSString

        // Highlight group tags: #tag
        let groupPattern = #"#[a-zA-Z][a-zA-Z0-9_-]*"#
        if let groupRegex = try? NSRegularExpression(pattern: groupPattern) {
            let matches = groupRegex.matches(in: line, range: NSRange(location: 0, length: nsLine.length))
            for match in matches {
                let absoluteRange = NSRange(location: range.location + match.range.location, length: match.range.length)
                textStorage.addAttribute(.foregroundColor, value: NSColor(red: 0.0, green: 0.4, blue: 0.8, alpha: 1.0), range: absoluteRange)
                textStorage.addAttribute(.font, value: NSFont.monospacedSystemFont(ofSize: 12, weight: .bold), range: absoluteRange)
            }
        }

        // Highlight audience tags: @tag
        let audiencePattern = #"@[a-zA-Z][a-zA-Z0-9_-]*"#
        if let audienceRegex = try? NSRegularExpression(pattern: audiencePattern) {
            let matches = audienceRegex.matches(in: line, range: NSRange(location: 0, length: nsLine.length))
            for match in matches {
                let absoluteRange = NSRange(location: range.location + match.range.location, length: match.range.length)
                textStorage.addAttribute(.foregroundColor, value: NSColor(red: 0.557, green: 0.267, blue: 0.678, alpha: 1.0), range: absoluteRange)
                textStorage.addAttribute(.font, value: NSFont.monospacedSystemFont(ofSize: 12, weight: .bold), range: absoluteRange)
            }
        }
    }
}

/// SwiftUI wrapper for NSTextView
struct SyntaxTextView: NSViewRepresentable {
    @Binding var text: String
    var onTextChange: ((String) -> Void)?

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSTextView.scrollableTextView()
        let textView = scrollView.documentView as! SyntaxHighlightingTextView

        textView.delegate = context.coordinator
        textView.isRichText = false
        textView.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        textView.backgroundColor = .clear
        textView.drawsBackground = true
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false

        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let textView = scrollView.documentView as? SyntaxHighlightingTextView else { return }

        if textView.string != text {
            textView.string = text
            textView.applySyntaxHighlighting()
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, NSTextViewDelegate {
        var parent: SyntaxTextView

        init(_ parent: SyntaxTextView) {
            self.parent = parent
        }

        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            parent.text = textView.string
            parent.onTextChange?(textView.string)
        }
    }
}
