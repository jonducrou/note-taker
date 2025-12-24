import SwiftUI
import AppKit

@main
struct NoteTakerApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    private var windowManager: WindowManager!
    private var trayManager: SystemTrayManager!
    private var hotKeyManager: HotKeyManager!
    private let fileStorage = FileStorage()
    private let contentViewModel = ContentViewModel()

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Hide dock icon
        NSApp.setActivationPolicy(.accessory)

        // Setup window manager
        windowManager = WindowManager(contentViewModel: contentViewModel)
        let window = windowManager.createWindow()
        window.makeKeyAndOrderFront(nil)

        // Setup system tray
        trayManager = SystemTrayManager(fileStorage: fileStorage, windowManager: windowManager)
        trayManager.setup()

        // Setup global hotkey (Cmd+Shift+N)
        hotKeyManager = HotKeyManager(windowManager: windowManager)
        hotKeyManager.registerHotKey()

        // Update badge periodically
        Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            self?.trayManager.updateBadge()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false
    }

    func applicationWillTerminate(_ notification: Notification) {
        hotKeyManager.unregisterHotKey()
    }
}
