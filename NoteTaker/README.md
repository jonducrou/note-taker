# Note Taker - Swift Rewrite

A minimalist, always-on-top note-taking application for macOS, rewritten in native Swift.

## Features

- **Text-first design**: 95% text area, minimal UI
- **Syntax highlighting**: Actions, connections, groups, and audience tags
- **Audio transcription**: Built-in speech recognition using Apple Speech framework
- **LLM cleanup**: Optional transcript cleanup using OpenAI-compatible API
- **Always available**: Global hotkey (Cmd+Shift+N) and menu bar icon
- **Auto-save**: Changes saved automatically after 250ms

## Building

### Option 1: Using Xcodegen (Recommended)

1. Install xcodegen:
   ```bash
   brew install xcodegen
   ```

2. Generate Xcode project:
   ```bash
   cd NoteTaker
   xcodegen generate
   ```

3. Open and build:
   ```bash
   open NoteTaker.xcodeproj
   ```

### Option 2: Create Xcode Project Manually

1. Open Xcode
2. Create new macOS App project
3. Add all files from the `NoteTaker/` directory
4. Add Yams package dependency: `https://github.com/jpsim/Yams`
5. Configure entitlements for microphone access

## Project Structure

```
NoteTaker/
├── App/                    # App entry point and delegate
├── Models/                 # Note, Action, Connection models
├── Services/
│   ├── FileStorage/        # Markdown file operations
│   ├── Transcription/      # Speech recognition
│   └── System/             # Hotkey, permissions, badge
├── Views/
│   ├── MainWindow/         # Main window and header
│   ├── Editor/             # NSTextView with syntax highlighting
│   └── StatusBar/          # Menu bar integration
└── ViewModels/             # State management
```

## Note Format

Compatible with the existing Electron version. Notes are stored in `~/Documents/Notes/` as markdown files with YAML frontmatter.

```markdown
---
date: 2025-12-28
group: product
audience:
  - sarah
  - team
created_at: 2025-12-28T10:00:00.000Z
updated_at: 2025-12-28T10:30:00.000Z
---

#product @sarah @team

Meeting Notes

## Actions
[] Review the proposal
[x] Send follow-up email

## Connections
Sarah -> Mike
Design -/> Implementation
```

## Keyboard Shortcuts

- `Cmd+Shift+N`: Show/hide window (global)
- `Cmd+N`: New note
- `Option+Down`: Previous note (older)
- `Option+Up`: Next note (newer)
- `Option+Left`: Next note with actions
- `Option+Right`: Previous note with actions
- Double-click on `[]` or `[x]`: Toggle action completion
- Double-click on `->` or `-/>`: Toggle connection completion

## LLM Transcript Cleanup

Configure via the app settings:
- API Endpoint: OpenAI-compatible endpoint URL
- API Key: Your API key
- Model: Default is `gpt-4o-mini`
- Speaker identification: Enable to identify different speakers

## Requirements

- macOS 13.0 (Ventura) or later
- Microphone permission for audio transcription
- Speech recognition permission

## Benefits over Electron Version

| Aspect | Electron | Swift |
|--------|----------|-------|
| Bundle Size | ~150MB | ~5-10MB |
| Startup Time | ~2-3s | <0.5s |
| Memory Usage | ~200MB | ~30-50MB |
| Audio | External Node process | Native SFSpeechRecognizer |
