# Changelog

All notable changes to Note Taker will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-01-09

### Changed
- **BREAKING**: Grace period reduced from 90 seconds to 25 seconds for more responsive privacy controls
- Updated ts-audio-transcriber library from v1.1.0 to v1.1.1 with critical race condition fix

### Fixed
- Fixed race condition causing first note's full transcript to be lost when creating second note
- Fixed issue where snippets stopped working on second and subsequent recordings
- Resolved "Error stopping AudioTranscriber" that prevented sessionTranscript events from being emitted
- Improved reliability of rapid stop/start sequences when switching between notes

### Technical
- Removed temporary 2-second delay workaround after library fix
- Enhanced IPC logging in audio-worker.mjs for better debugging
- Improved error context and logging in TranscriptionManager
- All transcription features now work reliably across multiple note sessions

## [1.7.0] - 2025-01-08

### Added
- **Audio Transcription**: Automatic recording and transcription for new notes
- **Vosk Speech Recognition**: Local, offline transcription with automatic model download
- **Real-time Snippets**: 5-second interval transcription chunks saved to `.snippet` files
- **Complete Transcripts**: Full session transcripts with word count and confidence in `.transcription` files
- **Recording Indicator**: Pulsing red dot shows active recording status
- **Grace Period**: 90-second window allows note navigation without stopping recording
- **Model Download-on-Demand**: Speech recognition model (~40MB) downloads automatically on first use
- **Privacy Controls**: Recording pauses with grace period when window hides

### Technical
- Integrated ts-audio-transcriber library with separate Node.js worker process
- Implemented TranscriptionManager service with newest-note tracking
- Added session-based file path routing to ensure correct note-transcript association
- ASAR packaging support with unpacked worker resources

## [1.6.2] - 2024-11-20

### Changed
- **Navigation Shortcuts**: Changed from `Cmd+arrows` to `Option+arrows` to avoid conflicts with text editing
- `Option+Up` navigates to newer notes
- `Option+Down` navigates to older notes
- `Option+Left` navigates to next note with actions
- `Option+Right` navigates to previous note with actions

### Fixed
- Preserved standard macOS text shortcuts (`Cmd+Left/Right`) for cursor movement
- Resolved user-reported issue about navigation interfering with typing workflow

### Removed
- Removed 827 lines of unused code for cleaner codebase

### Technical
- Enhanced test coverage to 52 comprehensive tests
- All tests passing with improved user experience

## [1.6.1] - 2024-11-15

### Changed
- Code cleanup and refactoring

## [1.6.0] - 2024-11-10

### Added
- Keyboard navigation between notes
- Dynamic window titles showing note creation date/time
- Manual note deletion with confirmation dialog

## [1.5.0] - 2024-10-25

### Added
- Comprehensive audience filtering in "With..." menu
- Shows all notes from last month grouped by audience member

### Changed
- Enhanced menu structure with complete audience note lists

## [1.4.0] - 2024-10-18

### Added
- Auto-update infrastructure with GitHub releases integration
- System tray improvements

## [1.3.0] - 2024-10-10

### Added
- Comprehensive test suite with Jest
- Test coverage reporting

## [1.2.0] - 2024-10-05

### Added
- SVG-based tray icons with automatic PNG conversion
- Improved system tray integration

## [1.1.2] - 2024-09-28

### Fixed
- Various bug fixes and stability improvements

## [1.1.1] - 2024-09-25

### Fixed
- Minor bug fixes

## [1.1.0] - 2024-09-20

### Added
- Cross-note completion tracking
- System tray badge with completion counts

## [1.0.0] - 2024-08-26

### Added
- Text-first minimalist interface with always-on-top window
- Smart syntax highlighting for actions, connections, metadata
- Click-to-complete functionality for actions and connections
- Autocomplete for groups and audience members
- Auto-save with markdown file generation
- Text command system (/today, /recent, /search:)
- System tray integration with completion badge
- Monaco Editor integration
- Global hotkey (Cmd+Shift+N)
- Local markdown storage in ~/Documents/Notes

[2.0.0]: https://github.com/jonducrou/note-taker/compare/v1.7.0...v2.0.0
[1.7.0]: https://github.com/jonducrou/note-taker/compare/v1.6.2...v1.7.0
[1.6.2]: https://github.com/jonducrou/note-taker/compare/v1.6.1...v1.6.2
[1.6.1]: https://github.com/jonducrou/note-taker/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/jonducrou/note-taker/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/jonducrou/note-taker/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/jonducrou/note-taker/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/jonducrou/note-taker/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/jonducrou/note-taker/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/jonducrou/note-taker/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/jonducrou/note-taker/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/jonducrou/note-taker/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/jonducrou/note-taker/releases/tag/v1.0.0
