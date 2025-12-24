import AppKit
import SwiftUI

/// Manages the always-on-top window
class WindowManager: NSObject, NSWindowDelegate {
    private var window: NSWindow?
    private let contentViewModel: ContentViewModel

    init(contentViewModel: ContentViewModel) {
        self.contentViewModel = contentViewModel
        super.init()
    }

    func createWindow() -> NSWindow {
        let screen = NSScreen.main!
        let screenFrame = screen.visibleFrame

        // Window dimensions
        let windowWidth: CGFloat = 300
        let windowHeight: CGFloat = 400
        let x = screenFrame.maxX - windowWidth - 20
        let y = screenFrame.minY + 20

        let window = NSWindow(
            contentRect: NSRect(x: x, y: y, width: windowWidth, height: windowHeight),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )

        window.title = "Note Taker"
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.isMovableByWindowBackground = true
        window.backgroundColor = NSColor.windowBackgroundColor
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.delegate = self

        // Set content view
        let contentView = ContentView()
            .environmentObject(contentViewModel)

        window.contentView = NSHostingView(rootView: contentView)

        self.window = window
        return window
    }

    func show() {
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func hide() {
        window?.orderOut(nil)
    }

    func toggle() {
        if window?.isVisible == true {
            hide()
        } else {
            show()
        }
    }

    // MARK: - NSWindowDelegate

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        hide()
        return false
    }
}
