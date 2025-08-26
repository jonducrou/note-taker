# Note Taker - Minimalist Always-On-Top Notes App

A minimalist, text-driven note-taking application for Mac that stays always-on-top and focuses on quick note capture with actionable items and connections.

> **Current Status**: Full-featured v1.3 with Monaco editor, smart autocomplete, syntax highlighting, system tray integration, and comprehensive note organization.

## Features

### 🎯 **Text-First Design**
- 95% text area with minimal UI chrome
- Distraction-free writing environment
- Always-on-top window (300x400px)
- System tray integration with global hotkey (Cmd+Shift+N)

### 📝 **Smart Note Format**
- **Metadata**: `#group @person` (new simplified format)
- **Actions**: `[]` (incomplete) → `[x]` (completed)  
- **Connections**: `Subject -> Subject` (incomplete) → `Subject -/> Subject` (completed using `/` or `\`)
- **Reverse Connections**: `Subject <- Subject` (incomplete) → `Subject </- Subject` (completed using `/` or `\`)

### 🎨 **Syntax Highlighting**
- Colour-coded metadata, actions, and connections
- Visual distinction between completed and incomplete items
- Headers and markdown support

### ✨ **Interactive Features**
- **Double-click to complete**: Double-click on `[]` or `->` to toggle completion
- **Smart autocomplete**: Recent suggestions for `#groups` and `@audience` from last 2 weeks
- **Auto-save**: Automatically saves and updates existing notes after 1 second
- **Tab indentation**: Tab/Shift-Tab for bullet point indentation (tabs suppressed from editor)

### 📊 **Smart Organization**
- **Open Notes**: Shows notes with incomplete items from last month
- **Time-based sections**: Today, Yesterday, Prior Week, Previous Week
- **Audience grouping**: "With..." menu groups notes by person from last month
- **System tray**: Right-click menu with completion counts and quick access
- **Local timezone**: All date groupings use local time (not UTC)

## File Structure

Notes are stored as markdown files in `~/Documents/Notes/` with:
- **Filename**: `YYYY-MM-DD_HHMMSS.md`
- **Format**: YAML frontmatter + markdown content
- **Metadata**: Extracted from `#group` and `@audience:` tags

## Example Note

```markdown
---
date: '2025-08-24'
group: Product
audience: ["Sarah", "DevTeam"]
created_at: '2025-08-24T10:30:00Z'
updated_at: '2025-08-24T10:30:00Z'
---

#Product @Sarah @DevTeam

# Product Meeting Notes

## Actions
[] Follow up with engineering team on API changes
[x] Schedule review meeting for next week

## Connections
Sarah -> Security team for compliance discussion  
DevTeam </- Product requirements delivered

## Key Points
- Discussed new feature requirements
- Identified potential blockers
```

## Usage

### Getting Started
1. Download and install the DMG from releases
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
- **With...**: Notes grouped by audience member
- All sections show completion counts in parentheses

## Development

```bash
# Run the app
./run.sh

# Development mode with hot reload
npm run dev        

# Build for production
npm run build      

# Create distributable
npm run dist

# Code quality
npm run typecheck  # TypeScript checking
npm run lint       # ESLint checking
npm run test       # Unit tests
npm run test:coverage  # Coverage report
```

## Architecture

- **Frontend**: React + TypeScript + Monaco Editor
- **Backend**: Electron main process with SVG-based tray icon
- **Storage**: Local markdown files with abstracted interface
- **Testing**: Jest with comprehensive unit test coverage
- **IPC**: Electron IPC for file operations and search