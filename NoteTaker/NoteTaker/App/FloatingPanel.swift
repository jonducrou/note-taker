import AppKit

/// A floating panel that can become key window and accept keyboard input
class FloatingPanel: NSPanel {
    override var canBecomeKey: Bool {
        return true
    }

    override var canBecomeMain: Bool {
        return true
    }
}
