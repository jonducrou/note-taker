import AppKit
import SwiftUI

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusBarController: StatusBarController?
    private var hotkeyManager: HotkeyManager?
    private var mainWindow: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupStatusBar()
        setupGlobalHotkey()
        setupMainWindow()
        requestPermissions()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            showMainWindow()
        }
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        hotkeyManager?.unregister()
    }

    // MARK: - Setup

    private func setupStatusBar() {
        statusBarController = StatusBarController()
        statusBarController?.onLeftClick = { [weak self] in
            self?.toggleMainWindow()
        }
    }

    private func setupGlobalHotkey() {
        hotkeyManager = HotkeyManager()
        hotkeyManager?.register(keyCode: 45, modifiers: [.command, .shift]) { [weak self] in
            self?.toggleMainWindow()
        }
    }

    private func setupMainWindow() {
        DispatchQueue.main.async { [weak self] in
            guard let window = NSApplication.shared.windows.first else { return }
            self?.mainWindow = window
            self?.configureWindow(window)
        }
    }

    private func configureWindow(_ window: NSWindow) {
        // Window size and position
        let screenFrame = NSScreen.main?.visibleFrame ?? .zero
        let windowSize = NSSize(width: 300, height: 400)
        let origin = NSPoint(
            x: screenFrame.maxX - windowSize.width - 20,
            y: screenFrame.minY + 20
        )
        window.setFrame(NSRect(origin: origin, size: windowSize), display: true)

        // Window behaviour
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.isMovableByWindowBackground = true
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.styleMask.insert(.fullSizeContentView)
    }

    private func requestPermissions() {
        PermissionsManager.shared.requestMicrophonePermission { granted in
            if !granted {
                print("Microphone permission not granted")
            }
        }
    }

    // MARK: - Window Management

    func toggleMainWindow() {
        guard let window = mainWindow else { return }

        if window.isVisible {
            window.orderOut(nil)
        } else {
            showMainWindow()
        }
    }

    func showMainWindow() {
        guard let window = mainWindow else { return }
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    // MARK: - Badge

    func updateDockBadge(count: Int) {
        if count > 0 {
            NSApplication.shared.dockTile.badgeLabel = "\(count)"
        } else {
            NSApplication.shared.dockTile.badgeLabel = nil
        }
    }
}
