import AppKit
import SwiftUI

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusBarController: StatusBarController?
    private var hotkeyManager: HotkeyManager?
    private var mainWindow: FloatingPanel?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Set activation policy to show in dock
        NSApplication.shared.setActivationPolicy(.regular)

        // Close any SwiftUI-created windows
        for window in NSApplication.shared.windows {
            window.close()
        }

        setupDockIcon()
        setupMainWindow()
        setupStatusBar()
        setupGlobalHotkey()
        requestPermissions()
        loadLLMConfiguration()
    }

    private func loadLLMConfiguration() {
        Task {
            await ActionExtractionService.shared.loadConfiguration()
        }
    }

    private func setupDockIcon() {
        if let iconURL = Bundle.module.url(forResource: "icon_512x512", withExtension: "png",
                                            subdirectory: "Assets.xcassets/AppIcon.appiconset"),
           let icon = NSImage(contentsOf: iconURL) {
            NSApplication.shared.applicationIconImage = icon
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            showMainWindow()
        }
        return true
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        Task {
            await TranscriptionService.shared.stop()

            try? await Task.sleep(nanoseconds: 500_000_000)

            let service = ActionExtractionService.shared
            if await service.hasPendingExtractions {
                await service.waitForPendingExtractions(timeout: 30)
            }

            DispatchQueue.main.async {
                NSApplication.shared.reply(toApplicationShouldTerminate: true)
            }
        }

        return .terminateLater
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
        // Create floating panel that can become key
        let screenFrame = NSScreen.main?.visibleFrame ?? .zero
        let windowSize = NSSize(width: 300, height: 400)
        let origin = NSPoint(
            x: screenFrame.maxX - windowSize.width - 20,
            y: screenFrame.minY + 20
        )

        let panel = FloatingPanel(
            contentRect: NSRect(origin: origin, size: windowSize),
            styleMask: [.titled, .closable, .resizable, .fullSizeContentView, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        // Configure panel
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isMovableByWindowBackground = true
        panel.titlebarAppearsTransparent = true
        panel.titleVisibility = .hidden
        panel.isReleasedWhenClosed = false
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = false

        // Set SwiftUI content
        let contentView = NSHostingView(rootView: MainWindowView())
        panel.contentView = contentView

        mainWindow = panel
        showMainWindow()
    }

    private func requestPermissions() {
        PermissionsManager.shared.requestMicrophonePermission { _ in }
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
