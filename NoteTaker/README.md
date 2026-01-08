# Note Taker - Swift Rewrite

A minimalist, always-on-top note-taking application for macOS, rewritten in native Swift.

## Features

- **Text-first design**: 95% text area, minimal UI
- **Syntax highlighting**: Actions, connections, groups, and audience tags
- **Dual-source transcription**: Captures both microphone and system audio with speaker attribution
- **LLM action extraction**: Automatically extracts actions, commitments, and expectations from transcripts
- **Always available**: Global hotkey (Cmd+Shift+N) and menu bar icon
- **Auto-save**: Changes saved automatically after 250ms

## Building

### Option 1: Swift Package Manager (Recommended)

```bash
cd NoteTaker

# Debug build
swift build

# Release build
swift build -c release

# Run debug build
.build/debug/NoteTaker

# Run release build
.build/release/NoteTaker
```

### Option 2: Xcode Project

1. Generate Xcode project (requires xcodegen):
   ```bash
   brew install xcodegen
   cd NoteTaker
   xcodegen generate
   open NoteTaker.xcodeproj
   ```

2. Or create manually:
   - Create new macOS App project
   - Add all files from the `NoteTaker/` directory
   - Add Yams package dependency: `https://github.com/jpsim/Yams`
   - Configure entitlements for microphone and screen recording access

## Project Structure

```
NoteTaker/
├── App/                    # App entry point and delegate
├── Models/                 # Note, Action, Connection models
├── Services/
│   ├── ActionExtraction/   # LLM-based action extraction
│   ├── FileStorage/        # Markdown file operations
│   ├── Transcription/      # Speech recognition (dual-source)
│   │   ├── HybridDualTranscriber.swift   # Main transcriber
│   │   ├── ScreenCaptureAudio.swift      # System audio capture
│   │   └── SpeechAnalyzerTranscriber.swift
│   └── System/             # Hotkey, permissions
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

## Dual-Source Transcription

The app captures audio from two sources simultaneously:
- **Microphone** → Tagged as `[You]` in transcripts
- **System Audio** → Tagged as `[Other]` in transcripts (captures call participants)

Uses a hybrid approach:
- `SFSpeechRecognizer` for microphone (traditional API)
- `SpeechAnalyzer` for system audio (macOS 26+ API)

This avoids the concurrent SFSpeechRecognizer limitation while preserving speaker attribution.

## LLM Action Extraction

Automatically extracts actionable items from transcripts:
- **Actions**: Tasks and next steps with owner and deadline
- **Commitments**: Promises made during discussions
- **Expectations**: Things people are expecting to happen

Configure via UserDefaults:
```bash
defaults write NoteTaker llm_endpoint "https://api.openai.com/v1/chat/completions"
defaults write NoteTaker llm_api_key "your-api-key"
defaults write NoteTaker llm_model "gpt-4o-mini"
```

Actions are saved to `.actions` files alongside notes and displayed in the Actions tab.

## Requirements

- macOS 26.0 (Tahoe) or later for dual-source transcription
- macOS 13.0 (Ventura) for single-source transcription
- Microphone permission for audio transcription
- Screen recording permission for system audio capture
- Speech recognition permission

## Benefits over Electron Version

| Aspect | Electron | Swift |
|--------|----------|-------|
| Bundle Size | ~150MB | ~2.4MB |
| Startup Time | ~2-3s | <0.3s |
| Memory Usage | ~200MB | ~30-50MB |
| Audio | External Node process | Native Speech APIs |
| System Audio | Not supported | ScreenCaptureKit |
| Speaker Attribution | Not supported | [You] / [Other] |
