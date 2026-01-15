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
        // Try to load from resource bundle (safe accessor that doesn't crash)
        if let bundle = Bundle.moduleOrNil,
           let iconURL = bundle.url(forResource: "icon_512x512", withExtension: "png",
                                    subdirectory: "Assets.xcassets/AppIcon.appiconset"),
           let icon = NSImage(contentsOf: iconURL) {
            NSApplication.shared.applicationIconImage = icon
        }
        // Falls back to default app icon if resource bundle not found
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
        statusBarController?.onPreferences = {
            PreferencesWindowController.shared.showPreferences()
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
        checkNotesDirectoryAccess()
    }

    private func checkNotesDirectoryAccess() {
        // First try to restore from bookmark
        if restoreNotesDirectoryBookmark() {
            Logger.info("Restored notes directory access from bookmark", log: Logger.storage)
            return
        }

        let notesDir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Documents/Notes")

        // Try to read the directory
        do {
            _ = try FileManager.default.contentsOfDirectory(at: notesDir, includingPropertiesForKeys: nil)
            Logger.info("Notes directory accessible", log: Logger.storage)
        } catch {
            Logger.error("Cannot access notes directory: \(error.localizedDescription)", log: Logger.storage)
            // Prompt user to grant access
            DispatchQueue.main.async {
                self.requestNotesDirectoryAccess()
            }
        }
    }

    private func restoreNotesDirectoryBookmark() -> Bool {
        guard let bookmarkData = UserDefaults.standard.data(forKey: "notesDirectoryBookmark") else {
            return false
        }

        do {
            var isStale = false
            let url = try URL(
                resolvingBookmarkData: bookmarkData,
                options: .withSecurityScope,
                relativeTo: nil,
                bookmarkDataIsStale: &isStale
            )

            if isStale {
                Logger.info("Bookmark is stale, will request new access", log: Logger.storage)
                return false
            }

            // Start accessing the security-scoped resource
            if url.startAccessingSecurityScopedResource() {
                Logger.info("Started accessing security-scoped resource: \(url.path)", log: Logger.storage)
                return true
            }
        } catch {
            Logger.error("Failed to resolve bookmark: \(error.localizedDescription)", log: Logger.storage)
        }

        return false
    }

    private func requestNotesDirectoryAccess() {
        let alert = NSAlert()
        alert.messageText = "Notes Folder Access Required"
        alert.informativeText = "Note Taker needs access to your Documents folder to read and write notes. Please select your Notes folder to grant access."
        alert.alertStyle = .warning
        alert.addButton(withTitle: "Grant Access")
        alert.addButton(withTitle: "Cancel")

        if alert.runModal() == .alertFirstButtonReturn {
            let openPanel = NSOpenPanel()
            openPanel.directoryURL = FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Documents/Notes")
            openPanel.canChooseDirectories = true
            openPanel.canChooseFiles = false
            openPanel.canCreateDirectories = true
            openPanel.allowsMultipleSelection = false
            openPanel.message = "Select your Notes folder to grant access"
            openPanel.prompt = "Grant Access"

            openPanel.begin { response in
                if response == .OK, let url = openPanel.url {
                    Logger.info("User granted access to: \(url.path)", log: Logger.storage)
                    // Store security-scoped bookmark for future access
                    self.storeSecurityBookmark(for: url)

                    // Reload notes now that we have access
                    NotificationCenter.default.post(name: .reloadNotes, object: nil)
                }
            }
        }
    }

    private func storeSecurityBookmark(for url: URL) {
        do {
            let bookmarkData = try url.bookmarkData(
                options: .withSecurityScope,
                includingResourceValuesForKeys: nil,
                relativeTo: nil
            )
            UserDefaults.standard.set(bookmarkData, forKey: "notesDirectoryBookmark")
            Logger.info("Stored security bookmark for notes directory", log: Logger.storage)
        } catch {
            Logger.error("Failed to create security bookmark: \(error.localizedDescription)", log: Logger.storage)
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
