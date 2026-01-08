# Note Taker

A minimalist, always-on-top note-taking application for macOS, built in native Swift.

## Features

- **Text-first design**: 95% text area, minimal UI
- **Syntax highlighting**: Actions, connections, groups, and audience tags
- **Dual-source transcription**: Captures both microphone and system audio with speaker attribution
- **LLM action extraction**: Automatically extracts actions, commitments, and expectations from transcripts
- **Always available**: Global hotkey (Cmd+Shift+N) and menu bar icon
- **Auto-save**: Changes saved automatically after 250ms

## Installation

### Build from Source

```bash
cd NoteTaker

# Release build
swift build -c release

# Run
.build/release/NoteTaker
```

### Xcode (Optional)

```bash
brew install xcodegen
cd NoteTaker
xcodegen generate
open NoteTaker.xcodeproj
```

## Note Format

Notes are stored as markdown files in `~/Documents/Notes/` with YAML frontmatter:

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

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+N` | Show/hide window (global) |
| `Cmd+N` | New note |
| `Cmd+,` | Preferences |
| `Option+Up` | Next note (newer) |
| `Option+Down` | Previous note (older) |
| `Option+Left` | Next note with actions |
| `Option+Right` | Previous note with actions |
| Double-click `[]` | Toggle action completion |
| Double-click `->` | Toggle connection completion |

## Dual-Source Transcription

Captures audio from two sources simultaneously:
- **Microphone** → Tagged as `[You]` in transcripts
- **System Audio** → Tagged as `[Other]` in transcripts (captures call participants)

Uses a hybrid approach:
- `SFSpeechRecognizer` for microphone
- `SpeechAnalyzer` for system audio (macOS 26+)

## LLM Action Extraction

Automatically extracts actionable items from transcripts:
- **Actions**: Tasks and next steps with owner and deadline
- **Commitments**: Promises made during discussions
- **Expectations**: Things people are expecting to happen

Configure via Preferences (Cmd+,) or:
```bash
defaults write NoteTaker llm_endpoint "https://api.openai.com/v1/chat/completions"
defaults write NoteTaker llm_api_key "your-api-key"
defaults write NoteTaker llm_model "gpt-4o-mini"
```

## Requirements

- macOS 26.0 (Tahoe) or later for dual-source transcription
- macOS 13.0 (Ventura) for single-source transcription
- Microphone permission
- Screen recording permission (for system audio)
- Speech recognition permission

## Project Structure

```
NoteTaker/
├── App/                    # App entry point and delegate
├── Models/                 # Note, Action, Connection models
├── Services/
│   ├── ActionExtraction/   # LLM-based action extraction
│   ├── FileStorage/        # Markdown file operations
│   ├── Transcription/      # Speech recognition (dual-source)
│   └── System/             # Hotkey, permissions
├── Views/
│   ├── MainWindow/         # Main window and header
│   ├── Editor/             # NSTextView with syntax highlighting
│   ├── Preferences/        # LLM configuration
│   └── StatusBar/          # Menu bar integration
└── ViewModels/             # State management
```

## Development

```bash
cd NoteTaker

# Debug build
swift build

# Run tests
swift test

# Release build
swift build -c release
```
