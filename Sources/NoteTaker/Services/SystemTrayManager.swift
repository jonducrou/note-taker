import AppKit

/// Manages the system tray icon and menu
class SystemTrayManager: NSObject {
    private var statusItem: NSStatusItem?
    private let fileStorage: FileStorage
    private weak var windowManager: WindowManager?

    init(fileStorage: FileStorage, windowManager: WindowManager) {
        self.fileStorage = fileStorage
        self.windowManager = windowManager
        super.init()
    }

    func setup() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)

        if let button = statusItem?.button {
            button.image = createTrayIcon()
            button.action = #selector(trayIconClicked)
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
            button.target = self
        }

        updateBadge()
    }

    @objc private func trayIconClicked() {
        guard let event = NSApp.currentEvent else { return }

        if event.type == .rightMouseUp {
            showMenu()
        } else {
            windowManager?.toggle()
        }
    }

    private func showMenu() {
        let menu = NSMenu()

        // Show Notes
        menu.addItem(NSMenuItem(title: "Show Notes", action: #selector(showNotes), keyEquivalent: ""))

        menu.addItem(NSMenuItem.separator())

        // Today's notes
        let todayNotes = getNotesForToday()
        let todayMenu = NSMenuItem(title: "Today", action: nil, keyEquivalent: "")
        todayMenu.submenu = createNotesSubmenu(todayNotes)
        menu.addItem(todayMenu)

        // Recent notes
        let recentNotes = getRecentNotes()
        let recentMenu = NSMenuItem(title: "Recent", action: nil, keyEquivalent: "")
        recentMenu.submenu = createNotesSubmenu(recentNotes)
        menu.addItem(recentMenu)

        menu.addItem(NSMenuItem.separator())

        // Quit
        menu.addItem(NSMenuItem(title: "Quit Note Taker", action: #selector(quit), keyEquivalent: "q"))

        statusItem?.menu = menu
        statusItem?.button?.performClick(nil)
        statusItem?.menu = nil
    }

    private func createNotesSubmenu(_ notes: [Note]) -> NSMenu {
        let submenu = NSMenu()

        if notes.isEmpty {
            let item = NSMenuItem(title: "No notes", action: nil, keyEquivalent: "")
            item.isEnabled = false
            submenu.addItem(item)
        } else {
            for note in notes.prefix(10) {
                let title = extractTitle(from: note.content)
                let incompleteCount = fileStorage.countIncompleteItems(in: note.content)
                let label = incompleteCount > 0 ? "\(title) (\(incompleteCount))" : title

                let item = NSMenuItem(title: label, action: #selector(loadNote(_:)), keyEquivalent: "")
                item.representedObject = note.id
                item.target = self
                submenu.addItem(item)
            }
        }

        return submenu
    }

    @objc private func showNotes() {
        windowManager?.show()
    }

    @objc private func loadNote(_ sender: NSMenuItem) {
        guard let noteId = sender.representedObject as? String else { return }
        // TODO: Notify ContentViewModel to load this note
        windowManager?.show()
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    func updateBadge() {
        let openNotes = getOpenNotes()
        let totalIncomplete = openNotes.reduce(0) { sum, note in
            sum + fileStorage.countIncompleteItems(in: note.content)
        }

        NSApp.dockTile.badgeLabel = totalIncomplete > 0 ? "\(totalIncomplete)" : nil
    }

    private func createTrayIcon() -> NSImage {
        let size = NSSize(width: 18, height: 18)
        let image = NSImage(size: size)

        image.lockFocus()

        // Draw a simple note icon
        let path = NSBezierPath(roundedRect: NSRect(x: 3, y: 3, width: 12, height: 12), xRadius: 2, yRadius: 2)
        NSColor.labelColor.setFill()
        path.fill()

        // Draw lines
        NSColor.windowBackgroundColor.setStroke()
        let line1 = NSBezierPath()
        line1.move(to: NSPoint(x: 5, y: 11))
        line1.line(to: NSPoint(x: 13, y: 11))
        line1.lineWidth = 1
        line1.stroke()

        let line2 = NSBezierPath()
        line2.move(to: NSPoint(x: 5, y: 8))
        line2.line(to: NSPoint(x: 13, y: 8))
        line2.lineWidth = 1
        line2.stroke()

        image.unlockFocus()
        image.isTemplate = true

        return image
    }

    // MARK: - Data Helpers

    private func getNotesForToday() -> [Note] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())

        return fileStorage.loadNotes().filter { note in
            calendar.isDate(note.metadata.createdAt, inSameDayAs: today)
        }
    }

    private func getRecentNotes() -> [Note] {
        return Array(fileStorage.loadNotes().prefix(10))
    }

    private func getOpenNotes() -> [Note] {
        let oneMonthAgo = Calendar.current.date(byAdding: .month, value: -1, to: Date()) ?? Date()

        return fileStorage.loadNotes().filter { note in
            note.metadata.createdAt >= oneMonthAgo &&
            fileStorage.countIncompleteItems(in: note.content) > 0
        }
    }

    private func extractTitle(from content: String) -> String {
        let lines = content.components(separatedBy: .newlines)
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if !trimmed.isEmpty {
                return String(trimmed.prefix(50))
            }
        }
        return "Untitled"
    }
}
