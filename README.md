# Note Taker - Minimalist Always-On-Top Notes App

A simple, text-driven note-taking application for Mac that stays always-on-top and focuses on quick note capture with actionable items and connections.

## Features

### 🎯 **Text-First Design**
- 95% text area with minimal UI chrome
- Distraction-free writing environment
- Always-on-top window (300x400px)
- System tray integration with global hotkey (Cmd+Shift+N)

### 📝 **Smart Note Format**
- **Metadata**: `@group:Product @audience:Sarah,DevTeam`
- **Actions**: `[]` (incomplete) → `[x]` (completed)
- **Connections**: `Subject -> Subject` (incomplete) → `Subject -x> Subject` (completed)
- **Reverse Connections**: `Subject <- Subject` (incomplete) → `Subject <x- Subject` (completed)

### 🎨 **Syntax Highlighting**
- Colour-coded metadata, actions, and connections
- Visual distinction between completed and incomplete items
- Headers and markdown support

### ✨ **Interactive Features**
- **Click-to-complete**: Click on `[]` or `->` to toggle completion
- **Autocomplete**: Smart suggestions for groups and audience members
- **Auto-save**: Automatically saves after 1 second of inactivity

### 🔍 **Text Commands** (Cmd+K)
- `/today` - Today's notes
- `/recent` - Most recently updated note
- `/new` - Create new note
- `/search:keyword` - Search across all notes
- `/group:Product` - Filter by group
- `/audience:Sarah` - Filter by audience member
- `/incomplete` - Show all incomplete items summary

### 📊 **Completion Tracking**
- System tray badge shows incomplete items count
- Cross-note aggregation of all pending actions and connections
- Context menu displays completion status

## File Structure

Notes are stored as markdown files in `~/Documents/Notes/` with:
- **Filename**: `YYYY-MM-DD_Group_HHMM.md`
- **Format**: YAML frontmatter + markdown content
- **Metadata**: Extracted from `@group:` and `@audience:` tags

## Example Note

```markdown
---
date: 2025-08-24
group: Product
audience: ["Sarah", "Dev Team"]
created_at: 2025-08-24T10:30:00Z
updated_at: 2025-08-24T10:30:00Z
---

@group:Product @audience:Sarah,DevTeam

# Product Meeting Notes

## Actions
[] Follow up with engineering team on API changes
[x] Schedule review meeting for next week

## Connections
Sarah -> Security team for compliance discussion
Dev Team <x- Product requirements delivered

## Key Points
- Discussed new feature requirements
- Identified potential blockers
```

## Usage

### Getting Started
1. Launch the app - it appears as a small always-on-top window
2. Start typing immediately with the text-first interface
3. Use `@group:` and `@audience:` to add metadata
4. Add action items with `[]` and connections with `Subject -> Subject`

### Navigation
- **Cmd+Shift+N**: Show/hide the app globally
- **Cmd+K**: Open command palette
- **Click**: Toggle completion on actions and connections
- **Type**: Autocomplete suggestions for groups and audience

### System Tray
- Shows incomplete items count as badge
- Right-click for context menu with completion status
- Click to show/hide window

## Development

```bash
npm install
npm run dev        # Development mode
npm run build      # Build for production
npm run dist       # Create distributable
```

## Architecture

- **Frontend**: React + TypeScript + Monaco Editor
- **Backend**: Electron main process
- **Storage**: Local markdown files with abstracted interface
- **IPC**: Electron IPC for file operations and search