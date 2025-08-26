# Note Taker - Minimalist Always-On-Top Notes App

A minimalist, text-driven note-taking application for Mac that stays always-on-top and focuses on quick note capture with actionable items and connections.

> **Current Status**: Full-featured v1.4 with Monaco editor, smart autocomplete, syntax highlighting, system tray integration, comprehensive note organization, and intelligent audience filtering.

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

### 📊 **Smart Organization**
- **Open Notes**: Shows notes with incomplete items from last month
- **Time-based sections**: Today, Yesterday, Prior Week, Previous Week
- **Audience grouping**: "With..." menu groups notes by person from last month
- **Intelligent filtering**: Only shows audience members with open actions
- **System tray**: Right-click menu with completion counts and quick access
- **Local timezone**: All date groupings use local time (not UTC)

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
3. Start typing with text-first interface (auto-saves after 1s)
4. Use `#group` and `@person` tags for organization
5. Add actions with `[]` and connections with `Subject -> Subject`

### Navigation
- **System tray**: Left-click show/hide, right-click for menu
- **Double-click**: Complete `[]` actions and `->` connections
- **Tab/Shift-Tab**: Indent/outdent bullet points
- **Type `#` or `@`**: Smart autocomplete from recent notes

### Menu Organization
- **Open Notes**: Recent notes with incomplete items
- **Today/Yesterday/Prior Week**: Time-based groupings  
- **With...**: Notes grouped by audience member (only shows those with open actions)
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

## Recent Updates (v1.4.0)

- **Intelligent Audience Filtering**: "With..." menu only shows people with open actions
- **Enhanced Test Coverage**: 52 comprehensive tests covering core functionality
- **Improved Menu Logic**: Two-layer filtering for cleaner, action-focused menus
- **Better Error Handling**: Comprehensive edge case coverage and resilience
- **Code Quality**: Removed debug statements, improved TypeScript coverage

## Contributing

This project welcomes contributions! Please see the comprehensive test suite for examples of the expected code quality and coverage standards.