import AppKit

/// Controller for the menu bar status item
class StatusBarController: NSObject {
    private let statusItem: NSStatusItem

    var onLeftClick: (() -> Void)?
    var onNewNote: (() -> Void)?
    var onPreferences: (() -> Void)?
    var onQuit: (() -> Void)?

    override init() {
        // Create status item first
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        super.init()
        setupStatusItem()
    }

    private func setupStatusItem() {
        if let button = statusItem.button {
            button.image = loadTrayIcon()
            button.target = self
            button.action = #selector(statusItemClicked(_:))
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }
    }

    private func loadTrayIcon() -> NSImage? {
        // Try to load from resource bundle (safe accessor that doesn't crash)
        if let bundle = Bundle.moduleOrNil,
           let iconURL = bundle.url(forResource: "tray-icon@2x", withExtension: "png",
                                    subdirectory: "Assets.xcassets/TrayIcon.imageset"),
           let image = NSImage(contentsOf: iconURL) {
            image.size = NSSize(width: 18, height: 18)
            image.isTemplate = true
            return image
        }

        // Fallback to system symbol
        let image = NSImage(systemSymbolName: "square.and.pencil", accessibilityDescription: "Note Taker")
        image?.isTemplate = true
        return image
    }

    @objc private func statusItemClicked(_ sender: NSStatusBarButton) {
        guard let event = NSApp.currentEvent else { return }

        if event.type == .rightMouseUp {
            showMenu()
        } else {
            onLeftClick?()
        }
    }

    private func showMenu() {
        let menu = NSMenu()

        // Show Notes
        let showItem = NSMenuItem(title: "Show Notes", action: #selector(showNotesClicked), keyEquivalent: "")
        showItem.target = self
        menu.addItem(showItem)

        menu.addItem(NSMenuItem.separator())

        // New Note
        let newItem = NSMenuItem(title: "New Note", action: #selector(newNoteClicked), keyEquivalent: "n")
        newItem.target = self
        menu.addItem(newItem)

        menu.addItem(NSMenuItem.separator())

        // Today submenu
        let todayItem = NSMenuItem(title: "Today", action: nil, keyEquivalent: "")
        let todayMenu = NSMenu()
        Task {
            await populateDateMenu(todayMenu, notes: try? await FileStorageService.shared.getNotesForToday())
        }
        todayItem.submenu = todayMenu
        menu.addItem(todayItem)

        // Yesterday submenu
        let yesterdayItem = NSMenuItem(title: "Yesterday", action: nil, keyEquivalent: "")
        let yesterdayMenu = NSMenu()
        Task {
            await populateDateMenu(yesterdayMenu, notes: try? await FileStorageService.shared.getNotesForYesterday())
        }
        yesterdayItem.submenu = yesterdayMenu
        menu.addItem(yesterdayItem)

        // Prior Week submenu
        let priorWeekItem = NSMenuItem(title: "Prior Week", action: nil, keyEquivalent: "")
        let priorWeekMenu = NSMenu()
        Task {
            await populateDateMenu(priorWeekMenu, notes: try? await FileStorageService.shared.getNotesForPriorWeek())
        }
        priorWeekItem.submenu = priorWeekMenu
        menu.addItem(priorWeekItem)

        menu.addItem(NSMenuItem.separator())

        // Version
        if let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String {
            let versionItem = NSMenuItem(title: "Version \(version)", action: nil, keyEquivalent: "")
            versionItem.isEnabled = false
            menu.addItem(versionItem)
        }

        menu.addItem(NSMenuItem.separator())

        // Preferences
        let prefsItem = NSMenuItem(title: "Preferences...", action: #selector(preferencesClicked), keyEquivalent: ",")
        prefsItem.target = self
        menu.addItem(prefsItem)

        menu.addItem(NSMenuItem.separator())

        // Quit
        let quitItem = NSMenuItem(title: "Quit Note Taker", action: #selector(quitClicked), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem.menu = menu
        statusItem.button?.performClick(nil)
        statusItem.menu = nil
    }

    @MainActor
    private func populateDateMenu(_ menu: NSMenu, notes: [Note]?) {
        guard let notes = notes, !notes.isEmpty else {
            let emptyItem = NSMenuItem(title: "No notes", action: nil, keyEquivalent: "")
            emptyItem.isEnabled = false
            menu.addItem(emptyItem)
            return
        }

        for note in notes {
            let title = note.group ?? note.formattedDate
            let count = note.incompleteItemCount
            let displayTitle = count > 0 ? "\(title) (\(count))" : title

            let item = NSMenuItem(title: displayTitle, action: #selector(noteClicked(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = note.id
            menu.addItem(item)
        }
    }

    // MARK: - Actions

    @objc private func showNotesClicked() {
        onLeftClick?()
    }

    @objc private func newNoteClicked() {
        onNewNote?()
        onLeftClick?()
    }

    @objc private func noteClicked(_ sender: NSMenuItem) {
        guard let noteId = sender.representedObject as? String else { return }
        NotificationCenter.default.post(name: .loadNote, object: noteId)
        onLeftClick?()
    }

    @objc private func preferencesClicked() {
        onPreferences?()
    }

    @objc private func quitClicked() {
        onQuit?()
        NSApplication.shared.terminate(nil)
    }

    // MARK: - Badge Updates

    func updateBadge(count: Int) {
        if let button = statusItem.button {
            if count > 0 {
                button.title = "\(count)"
                button.image = nil
            } else {
                button.title = ""
                button.image = loadTrayIcon()
            }
        }
    }
}
