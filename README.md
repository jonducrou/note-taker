# Note Taker

A minimalist, always-on-top note-taking application for macOS built with **Swift** and **SwiftUI**.

![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%2013%2B-lightgrey.svg)
![Swift](https://img.shields.io/badge/Swift-5.9-orange.svg)

> **Major Update**: Version 3.0.0 is a complete rewrite in Swift for better performance, lower memory usage, and native macOS integration. All your notes remain compatible!

## Features

### 🎯 **Text-First Design**
- 95% text area with minimal UI chrome
- Distraction-free writing environment
- Always-on-top window (300x400px)

### 📝 **Smart Note Format**
- **Metadata**: `#group @person` format for organization
- **Actions**: `[]` (incomplete) → `[x]` (completed)
- **Connections**: `Subject -> Subject` (incomplete) → `Subject -/>` (completed)
- **Reverse Connections**: `Subject <- Subject` (incomplete) → `Subject </-` (completed)

### 🎨 **Syntax Highlighting**
- Colour-coded metadata, actions, and connections
- Visual distinction between completed and incomplete items
- **Incomplete Actions**: `[]` - Bold red
- **Complete Actions**: `[x]` - Bold green
- **Incomplete Connections**: `->`, `<-` - Bold orange
- **Complete Connections**: `-/>`, `</-` - Bold green
- **Group Tags**: `#tag` - Bold blue
- **Audience Tags**: `@person` - Bold purple

### ✨ **Interactive Features**
- **Smart autocomplete**: Recent suggestions for `#groups` and `@audience` from last 2 weeks
- **Auto-save**: Automatically saves after 250ms of inactivity
- **Keyboard navigation**: Browse through notes with shortcuts
- **Dynamic window title**: Shows note creation date/time in format "Tue 26 Aug 14:31"
- **Global hotkey**: Press ⌘⇧N (Command + Shift + N) to show/hide from anywhere

### 📊 **Smart Organization**
- **Open Notes**: Shows notes with incomplete items
- **Time-based sections**: Today, Recent notes
- **System tray**: Quick access with dock badge for incomplete items
- **Completion tracking**: Automatic badge count updates

## File Structure

Notes are stored as markdown files in `~/Documents/Notes/` with:
- **Filename**: `YYYY-MM-DD_HHMMSS.md`
- **Format**: YAML frontmatter + markdown content
- **Metadata**: Extracted from `#group` and `@person` tags

## Example Note

```markdown
---
date: '2025-08-26'
group: Product
audience: ["Sarah", "DevTeam"]
created_at: '2025-08-26T10:30:00Z'
updated_at: '2025-08-26T10:30:00Z'
---

#Product @Sarah @DevTeam

# Product Meeting Notes

## Actions
[] Follow up with engineering team on API changes
[x] Schedule review meeting for next week

## Connections
Sarah -> Security team for compliance discussion  
DevTeam <x- Product requirements delivered

## Key Points
- Discussed new feature requirements
- Identified potential blockers
```

## Usage

### Getting Started
1. Download and install the DMG from [releases](https://github.com/jonducrou/note-taker/releases)
2. Launch - appears as always-on-top window in bottom-right corner  
3. Start typing with text-first interface (auto-saves after 250ms)
4. Use `#group` and `@person` tags for organization
5. Add actions with `[]` and connections with `Subject -> Subject`

### Navigation
- **System tray**: Left-click show/hide, right-click for menu
- **Double-click**: Complete `[]` actions and `->` connections
- **Tab/Shift-Tab**: Indent/outdent bullet points
- **Type `#` or `@`**: Smart autocomplete from recent notes
- **Delete note**: Right-click tray → "Delete Current Note" → confirm deletion

### Menu Organization
- **Open Notes**: Recent notes with incomplete items
- **Today/Yesterday/Prior Week**: Time-based groupings  
- **With...**: Notes grouped by audience member (shows all notes from last month)
- All sections show completion counts in parentheses

## Installation

### From Source

Requires macOS 13+ and Swift 5.9+

```bash
# Clone the repository
git clone https://github.com/yourusername/note-taker.git
cd note-taker

# Build the app
./build.sh

# Install to Applications
cp -r ".build/release/Note Taker.app" /Applications/
```

### Using Swift Package Manager

```bash
swift build -c release
```

## Usage

### Global Hotkey

Press **⌘⇧N** (Command + Shift + N) to show/hide the note window from anywhere.

### Keyboard Shortcuts

- **⌘⇧N** - Toggle note window
- **⌥↑** - Previous note (newer)
- **⌥↓** - Next note (older)
- **⌥←** - Previous note with open actions
- **⌥→** - Next note with open actions

### System Tray Menu

Right-click the tray icon to access:
- Show Notes
- Today's notes
- Recent notes
- Quit application

Left-click to toggle the note window.

## Development

### Building

```bash
swift build
```

### Running in Debug Mode

```bash
swift run
```

### Running Tests

```bash
swift test
```

## Architecture

### Technology Stack

- **Language**: Swift 5.9
- **UI Framework**: SwiftUI + AppKit (for system integration)
- **Storage**: FileManager with Markdown + YAML
- **Build System**: Swift Package Manager

### Project Structure

```
Sources/NoteTaker/
├── Models/
│   └── Note.swift              # Data models
├── Views/
│   ├── ContentView.swift       # Main UI
│   └── SyntaxTextView.swift    # Text editor with highlighting
├── Services/
│   ├── FileStorage.swift       # Note storage and retrieval
│   ├── WindowManager.swift     # Always-on-top window management
│   ├── SystemTrayManager.swift # Tray icon and menu
│   └── HotKeyManager.swift     # Global hotkey registration
└── NoteTakerApp.swift          # App entry point
```

### Key Design Decisions

- **Native Swift**: Rewrote from Electron to Swift for better performance and macOS integration
- **SwiftUI + AppKit**: SwiftUI for modern UI, AppKit for system-level features
- **Custom Text Editor**: NSTextView wrapper with real-time syntax highlighting
- **File-Based Storage**: Simple, transparent Markdown files in `~/Documents/Notes`
- **No External Dependencies**: Pure Swift implementation

## Version History

### 3.0.0 (2025-12-24)
- **Complete Swift Rewrite**: Migrated from Electron + React + TypeScript to native Swift + SwiftUI
- **Performance**: Significantly faster startup and lower memory usage
- **Native Integration**: Better macOS integration with native APIs
- **Simplified Architecture**: Removed Node.js dependencies and build complexity
- **Always-on-Top**: Native window management
- **Global Hotkey**: System-level hotkey registration
- **System Tray**: Native menu bar integration

### 2.x.x (Previous Electron Version)
- Electron + React + TypeScript implementation
- Monaco editor integration
- Audio transcription with Vosk
- Comprehensive testing suite

## Migration from Electron Version

If you're upgrading from the previous Electron version (2.x.x):

1. Your notes in `~/Documents/Notes` are fully compatible - no migration needed!
2. The YAML frontmatter format remains the same
3. All core features are preserved (except audio transcription - coming in a future release)
4. The new Swift version is faster and uses less memory
5. Global hotkey changed from Cmd+Shift+N (same shortcut, native implementation)

## Roadmap

- [ ] Audio transcription (Swift port)
- [ ] iCloud sync
- [ ] iOS companion app
- [ ] Advanced search with filters
- [ ] Export to PDF/HTML
- [ ] Customizable themes
- [ ] Plugin system

## License

MIT License

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Author

Built with ❤️ for macOS

---

**Note**: This is version 3.0 - a complete rewrite in Swift. The previous Electron-based version (2.x.x) is preserved in git history.