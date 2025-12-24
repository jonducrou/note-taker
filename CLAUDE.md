# Note Taker App - Development Context

## Project Overview
A minimalist, always-on-top note-taking application for macOS built with **Swift** and **SwiftUI**. Features text-first design with smart syntax highlighting, completion tracking, and native macOS integration.

**Version 3.0.0** represents a complete rewrite from Electron to native Swift for better performance, lower memory usage, and deeper macOS integration.

## Key Architecture Decisions

### Technology Stack
- **Language**: Swift 5.9+
- **UI Framework**: SwiftUI + AppKit (for system integration)
- **Text Editor**: Custom NSTextView with real-time syntax highlighting
- **Storage**: FileManager with Markdown + YAML frontmatter in `~/Documents/Notes`
- **Build**: Swift Package Manager

### Design Philosophy
- **Text-first**: 95% text area, minimal UI chrome
- **Always available**: Global hotkey (⌘⇧N) and system tray
- **Smart but simple**: Understands structure without complex UI
- **Fast**: Keyboard-driven with 250ms auto-save
- **Native**: Pure Swift, no external dependencies

### Swift Architecture Principles
- **SwiftUI for UI**: Modern declarative UI framework
- **AppKit for System Features**: Window management, global hotkeys, system tray
- **MVVM Pattern**: Clear separation of concerns with ViewModels
- **Single Source of Truth**: FileStorage as the central data layer
- **No External Dependencies**: Pure Swift implementation for simplicity

### Note Format
```markdown
#Product @audience:Sarah,DevTeam

# Meeting Notes

## Actions
[] Incomplete action
[x] Completed action

## Connections  
Subject -> Subject (incomplete)
Subject -x> Subject (completed)
Subject <- Subject (incomplete)
Subject <x- Subject (completed)
```

### File Structure
```
Sources/NoteTaker/
├── Models/
│   └── Note.swift              # Data models (Note, NoteMetadata, Action, etc.)
├── Views/
│   ├── ContentView.swift       # Main UI with text editor
│   └── SyntaxTextView.swift    # Custom NSTextView with syntax highlighting
├── Services/
│   ├── FileStorage.swift       # Note storage and retrieval
│   ├── WindowManager.swift     # Always-on-top window management
│   ├── SystemTrayManager.swift # System tray icon and menu
│   └── HotKeyManager.swift     # Global hotkey registration (⌘⇧N)
└── NoteTakerApp.swift          # App entry point and AppDelegate
```

## Completed Features
- ✅ Text-first minimalist UI with always-on-top window
- ✅ Smart syntax highlighting for actions, connections, metadata
- ✅ Auto-save with markdown file generation (250ms debounce)
- ✅ System tray integration with automatic completion badge
- ✅ Completion tracking with dock badge
- ✅ Note navigation (keyboard shortcuts)
- ✅ Global hotkey (⌘⇧N) for show/hide
- ✅ Native macOS integration
- ✅ Recent suggestions for groups and audience
- ✅ Proper YAML frontmatter parsing and generation

## Development Commands
- `swift build` - Build the app
- `swift run` - Run in development mode
- `swift test` - Run tests
- `./build.sh` - Create app bundle
- `swift build -c release` - Build release version

## Testing
- **Framework**: Swift Testing (XCTest)
- **Coverage**: To be implemented
- **Test Files**: `Tests/NoteTakerTests/`

## Notes Directory Structure
- **Location**: `~/Documents/Notes/`
- **Filename**: `YYYY-MM-DD_HHMMSS.md`
- **Format**: YAML frontmatter + markdown content
- **Metadata**: Extracted from inline `#group` and `@audience:` tags

## Commit Messages
- NEVER include URLs or email addresses in commit messages

## Migration Notes (v3.0.0)
- **Complete Rewrite**: Migrated from Electron + React + TypeScript to Swift + SwiftUI
- **Backward Compatible**: All note files remain compatible (same Markdown + YAML format)
- **Removed Features**: Audio transcription (planned for future release)
- **Performance Gains**: ~10x faster startup, ~5x lower memory usage
- **Native Integration**: Better macOS integration with native window management and hotkeys

## Future Enhancements
- Audio transcription (Swift port)
- iCloud sync
- iOS companion app
- Advanced search
- Customizable themes