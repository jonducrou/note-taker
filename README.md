# Note Taker - Minimalist Always-On-Top Notes App

A minimalist, text-driven note-taking application for Mac that stays always-on-top and focuses on quick note capture with actionable items and connections.

> **Current Status**: Full-featured v2.0.0 with Monaco editor, smart autocomplete, syntax highlighting, system tray integration, comprehensive note organisation, complete audience filtering, improved keyboard navigation, dynamic note timestamps, and **reliable automatic audio transcription**.

## Features

### 🎯 **Text-First Design**
- 95% text area with minimal UI chrome
- Distraction-free writing environment
- Always-on-top window (300x400px)

### 📝 **Smart Note Format**
- **Metadata**: `#group @person` format for organization
- **Actions**: `[]` (incomplete) → `[x]` (completed)  
- **Connections**: `Subject -> Subject` (incomplete) → `Subject -x> Subject` (completed)
- **Reverse Connections**: `Subject <- Subject` (incomplete) → `Subject <x- Subject` (completed)

### 🎨 **Syntax Highlighting**
- Colour-coded metadata, actions, and connections
- Visual distinction between completed and incomplete items
- Headers and markdown support

### ✨ **Interactive Features**
- **Double-click to complete**: Double-click on `[]` or `->` to toggle completion
- **Smart autocomplete**: Recent suggestions for `#groups` and `@audience` from last 2 weeks
- **Auto-save**: Automatically saves and updates existing notes after 1 second
- **Tab indentation**: Tab/Shift-Tab for bullet point indentation
- **Keyboard navigation**: `Option+Up` (newer notes) and `Option+Down` (older notes) to navigate between notes
- **Navigation with actions**: `Option+Left` (next with actions) and `Option+Right` (previous with actions)
- **Dynamic window title**: Shows note creation date/time in format "Tue 26 Aug 14:31"
- **Delete current note**: Right-click system tray → "Delete Current Note" with confirmation dialog

### 📊 **Smart Organization**
- **Open Notes**: Shows notes with incomplete items from last month
- **Time-based sections**: Today, Yesterday, Prior Week, Previous Week
- **Audience grouping**: "With..." menu groups notes by person from last month
- **Comprehensive filtering**: Shows all audience members with notes from last month
- **System tray**: Right-click menu with completion counts and quick access
- **Local timezone**: All date groupings use local time (not UTC)

### 🎙️ **Audio Transcription** (v2.0.0 - Enhanced Reliability)
- **Automatic recording**: Starts when creating a new note, visible red dot indicator
- **Newest-note tracking**: Only the most recently created note records
- **25-second grace period**: Navigate away for up to 25 seconds without stopping recording
- **Local speech recognition**: Uses Vosk engine (offline, no cloud)
- **Automatic model download**: Speech recognition model (~40MB) downloads automatically on first use
- **Real-time snippets**: 5-second interval transcription chunks
- **Complete transcript**: Full session transcript with word count and confidence
- **Files created**: `.snippet` and `.transcription` files alongside each note
- **Privacy-focused**: Recording pauses with grace period when window hides
- **Reliable multi-note support**: Fixed race conditions for consistent transcription across multiple recordings

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

## Development

```bash
# Run the app in development mode
./run.sh                # Quick start script
npm run dev            # Development with hot reload

# Build and package
npm run build          # Build for production
npm run dist          # Create distributable DMG

# Code quality
npm run typecheck     # TypeScript checking
npm run lint          # ESLint checking
npm test              # Run comprehensive test suite (52 tests)
npm run test:coverage # Full coverage report
npm run test:all      # Run all tests including integration
```

## Architecture

- **Frontend**: React + TypeScript + Monaco Editor
- **Backend**: Electron main process with SVG-based tray icon
- **Storage**: Local markdown files with abstracted interface
- **Testing**: Jest with comprehensive unit test coverage (49.57% FileStorage coverage)
- **IPC**: Electron IPC for file operations, search, and menu structure

## Recent Updates

### v2.0.0 - Enhanced Audio Transcription Reliability
- **Fixed Race Conditions**: Resolved issue where first note's full transcript was lost when creating second note
- **Multi-Note Support**: Snippets and transcripts now work reliably across multiple recording sessions
- **Updated Library**: ts-audio-transcriber v1.1.1 with critical stop/start sequence fixes
- **Faster Grace Period**: Reduced from 90 seconds to 25 seconds for more responsive privacy controls
- **Improved Logging**: Enhanced debugging capabilities for transcription pipeline

### v1.7.0 - Audio Transcription
- **Automatic Recording**: New notes trigger automatic audio transcription
- **Newest-Note Strategy**: Only the most recent note records to simplify UX
- **Vosk Speech Recognition**: Local, offline transcription with real-time snippets
- **Model Download-on-Demand**: Speech recognition model (~40MB) downloads automatically on first use
- **Visual Indicator**: Pulsing red dot shows active recording
- **Privacy Controls**: Window hide/show triggers grace period (not immediate stop)

### v1.6.2 - Navigation Improvements
- **Improved Navigation UX**: Changed shortcuts from `Cmd+arrows` to `Option+arrows` to avoid conflicts with text editing
- **Better Typing Experience**: `Cmd+Left/Right` now work normally for cursor movement without triggering navigation
- **Enhanced Test Coverage**: 52 comprehensive tests covering core functionality
- **Code Cleanup**: Removed 827 lines of unused code in v1.6.1
- **Stable Release**: All tests passing with improved user experience

## Contributing

This project welcomes contributions! Please see the comprehensive test suite for examples of the expected code quality and coverage standards.