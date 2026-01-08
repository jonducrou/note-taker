import SwiftUI
import AppKit

/// SwiftUI wrapper for NoteTextView (NSTextView)
struct NoteEditorView: NSViewRepresentable {
    @Binding var content: String
    var onContentChange: () -> Void
    var onNavigateNext: () -> Void = {}
    var onNavigatePrevious: () -> Void = {}
    var onNavigateNextWithActions: () -> Void = {}
    var onNavigatePreviousWithActions: () -> Void = {}

    func makeNSView(context: Context) -> NSScrollView {
        // Create scroll view
        let scrollView = NSScrollView()
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder
        scrollView.drawsBackground = false

        // Create text container
        let contentSize = scrollView.contentSize
        let textContainer = NSTextContainer(size: NSSize(
            width: contentSize.width,
            height: CGFloat.greatestFiniteMagnitude
        ))
        textContainer.widthTracksTextView = true

        // Create layout manager
        let layoutManager = NSLayoutManager()
        layoutManager.addTextContainer(textContainer)

        // Create text storage
        let textStorage = NSTextStorage()
        textStorage.addLayoutManager(layoutManager)

        // Create text view with navigation support
        let textView = NavigableTextView(frame: .zero, textContainer: textContainer)
        textView.onNavigateNext = onNavigateNext
        textView.onNavigatePrevious = onNavigatePrevious
        textView.onNavigateNextWithActions = onNavigateNextWithActions
        textView.onNavigatePreviousWithActions = onNavigatePreviousWithActions
        textView.minSize = NSSize(width: 0, height: contentSize.height)
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        textView.delegate = context.coordinator
        textView.string = content

        // Configure appearance
        textView.backgroundColor = .clear
        textView.drawsBackground = false
        textView.textContainerInset = NSSize(width: 12, height: 20)
        textView.isRichText = false
        textView.allowsUndo = true
        textView.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        textView.textColor = .labelColor
        textView.insertionPointColor = .labelColor

        // Disable auto-corrections
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.isAutomaticSpellingCorrectionEnabled = false
        textView.isContinuousSpellCheckingEnabled = false

        // Set up scroll view
        scrollView.documentView = textView
        scrollView.contentView.drawsBackground = false

        // Apply initial syntax highlighting
        textView.applySyntaxHighlighting()

        // Make text view first responder after a brief delay
        DispatchQueue.main.async {
            if let window = scrollView.window {
                window.makeFirstResponder(textView)
            }
        }

        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let textView = scrollView.documentView as? NavigableTextView else { return }

        // Only update if content actually changed (avoid cursor reset)
        if textView.string != content {
            let selectedRanges = textView.selectedRanges
            textView.string = content
            textView.selectedRanges = selectedRanges
            textView.applySyntaxHighlighting()
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, NSTextViewDelegate {
        var parent: NoteEditorView

        init(_ parent: NoteEditorView) {
            self.parent = parent
        }

        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NoteTextView else { return }
            parent.content = textView.string
            parent.onContentChange()
            textView.applySyntaxHighlighting()
            textView.checkForAutocomplete()
        }

        func textView(_ textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
            guard let noteTextView = textView as? NoteTextView else { return false }

            // Handle special key commands
            if commandSelector == #selector(NSResponder.insertNewline(_:)) {
                return noteTextView.handleEnterKey()
            }

            if commandSelector == #selector(NSResponder.insertTab(_:)) {
                return noteTextView.handleTabKey(shift: false)
            }

            if commandSelector == #selector(NSResponder.insertBacktab(_:)) {
                return noteTextView.handleTabKey(shift: true)
            }

            return false
        }
    }
}

/// Custom NSTextView that captures Option+Arrow keys for navigation
class NavigableTextView: NoteTextView {
    var onNavigateNext: (() -> Void)?
    var onNavigatePrevious: (() -> Void)?
    var onNavigateNextWithActions: (() -> Void)?
    var onNavigatePreviousWithActions: (() -> Void)?

    override func keyDown(with event: NSEvent) {
        // Check for Option modifier
        if event.modifierFlags.contains(.option) {
            switch event.keyCode {
            case 125: // Down arrow - previous (newer) note
                onNavigatePrevious?()
                return
            case 126: // Up arrow - next (older) note
                onNavigateNext?()
                return
            case 123: // Left arrow - next note with actions
                onNavigateNextWithActions?()
                return
            case 124: // Right arrow - previous note with actions
                onNavigatePreviousWithActions?()
                return
            default:
                break
            }
        }
        super.keyDown(with: event)
    }
}

#Preview {
    NoteEditorView(
        content: .constant("""
        #product @sarah @team

        Meeting Notes

        ## Actions
        [] Review the proposal
        [x] Send follow-up email

        ## Connections
        Sarah -> Mike
        Design Team -/> Implementation
        """),
        onContentChange: {}
    )
    .frame(width: 300, height: 400)
}
