# Note Taker App - Development Context

## Project Overview
A minimalist, always-on-top note-taking application for Mac. Two versions exist:
- **Swift version** (in `NoteTaker/`): Native macOS app with dual-source transcription
- **Electron version** (legacy): React + TypeScript + Monaco Editor

## Swift Version (Active Development)

### Technology Stack
- **Framework**: SwiftUI + AppKit
- **Speech**: SFSpeechRecognizer (mic) + SpeechAnalyzer (system audio)
- **Audio Capture**: ScreenCaptureKit for system audio
- **Storage**: Local markdown files with YAML frontmatter in `~/Documents/Notes`
- **Dependencies**: Yams (YAML parsing)

### Development Commands
```bash
cd NoteTaker
swift build              # Debug build
swift build -c release   # Release build
.build/release/NoteTaker # Run release version
```

### Key Features
- Dual-source transcription with speaker attribution ([You]/[Other])
- LLM action extraction (actions, commitments, expectations)
- Hybrid transcription: SFSpeechRecognizer + SpeechAnalyzer APIs

## Electron Version (Legacy)

### Technology Stack
- **Frontend**: React + TypeScript + Monaco Editor for rich text editing
- **Backend**: Electron main process with IPC communication
- **Storage**: Local markdown files with YAML frontmatter in `~/Documents/Notes`
- **Build**: Vite for renderer, TypeScript compiler for main process

### Design Philosophy
- **Text-first**: 95% text area, minimal UI chrome
- **Always available**: Global hotkey (Cmd+Shift+N) and system tray
- **Smart but simple**: Understands structure without complex UI
- **Fast**: Keyboard-driven with 250ms auto-save

### Electron Architecture Principles
- **Clear Process Separation**: Main process handles all file operations, system integration, and business logic
- **Renderer Responsibility**: UI rendering, user interactions, and simple IPC communication only
- **No File Operations in Renderer**: All FileStorage access must be through the main process via IPC
- **Minimal IPC Surface**: Keep communication between processes simple and focused
- **Main Process as Single Source of Truth**: Badge counts, completion tracking, and data aggregation happen in main process

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

### Swift File Structure
```
NoteTaker/NoteTaker/
├── App/                    # AppDelegate, entry point
├── Models/                 # Note, Action, Connection
├── Services/
│   ├── ActionExtraction/   # LLM action extraction
│   ├── FileStorage/        # Markdown file operations
│   ├── Transcription/      # Dual-source speech recognition
│   └── System/             # Hotkey, permissions
├── Views/                  # SwiftUI views
└── ViewModels/             # State management
```

### Electron File Structure (Legacy)
```
src/
├── main/           # Electron main process
├── renderer/       # React UI components
├── storage/        # File storage abstraction
├── types/          # TypeScript definitions
└── utils/          # Utility functions
```

## Completed Features (Swift Version)
- ✅ Text-first minimalist UI with always-on-top window
- ✅ Smart syntax highlighting for actions, connections, metadata
- ✅ Click-to-complete functionality for actions and connections
- ✅ Dual-source transcription (microphone + system audio)
- ✅ Speaker attribution in transcripts ([You]/[Other])
- ✅ LLM action extraction with importance ratings
- ✅ Auto-save with markdown file generation
- ✅ System tray integration with menu bar icon
- ✅ Global hotkey (Cmd+Shift+N)
- ✅ Cross-note completion tracking

## Development Commands

### Swift Version
- `swift build` - Debug build
- `swift build -c release` - Release build
- `.build/release/NoteTaker` - Run release version

### Electron Version (Legacy)
- `npm run dev` - Development mode with hot reload
- `npm run build` - Build production version
- `npm run typecheck` - TypeScript type checking
- `npm run lint` - ESLint code quality checks
- `npm run test` - Run core unit tests
- `npm run test:coverage` - Run tests with coverage report
- `npm run dist` - Create distributable package

## Testing
- **Framework**: Jest with TypeScript support
- **Coverage**: 26+ tests covering FileStorage and core functionality
- **Mocking**: Proper isolation of file system and Electron APIs
- **Test Files**: `src/__tests__/FileStorage.test.ts`, `src/__tests__/basic.test.ts`

## Notes Directory Structure
- **Location**: `~/Documents/Notes/`
- **Filename**: `YYYY-MM-DD_HHMMSS.md`
- **Format**: YAML frontmatter + markdown content
- **Metadata**: Extracted from inline `#group` and `@audience:` tags

## Commit Messages
- NEVER include URLs or email addresses in commit messages
- Co-authored lines should not include emails (use `Co-Authored-By: Claude` without email)

## Decisions Reference
See `DECISIONS.md` for architectural decisions and rejected approaches. Check this before attempting solutions to avoid repeating approaches that didn't work.

## Debugging Reference
See `DEBUGGING.md` for comprehensive debugging guide. Worker logs are located in `~/Documents/Notes/worker-log-*.log`. Always check recent worker logs when investigating audio transcription issues.