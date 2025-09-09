# Note Taker App - Development Context

## Project Overview
A minimalist, always-on-top note-taking application for Mac built with Electron + React + TypeScript. Features text-first design with smart syntax highlighting, completion tracking, and text-based commands.

## Key Architecture Decisions

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

### File Structure
```
src/
├── main/           # Electron main process
├── renderer/       # React UI components  
├── storage/        # File storage abstraction
├── types/          # TypeScript definitions
└── utils/          # Utility functions
```

## Completed Features
- ✅ Text-first minimalist UI with always-on-top window
- ✅ Smart syntax highlighting for actions, connections, metadata
- ✅ Click-to-complete functionality for actions and connections
- ✅ Autocomplete for groups and audience members
- ✅ Auto-save with markdown file generation
- ✅ Text command system (/today, /recent, /search:, etc.)
- ✅ System tray integration with automatic completion badge
- ✅ Cross-note completion tracking and aggregation
- ✅ Dynamic context menu with left-click/right-click separation
- ✅ SVG-based tray icon with automatic PNG conversion
- ✅ Comprehensive unit testing suite with Jest

## Development Commands
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