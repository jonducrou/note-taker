# Note Taker App - Architecture & Implementation Decisions

## 🚀 Technology Stack Decisions

### **Electron + React + TypeScript** ✅ CHOSEN
**Why**: Perfect balance of development speed, native integration, and maintainability
- **Pros**: Hot reload, component architecture, strong typing, cross-platform potential
- **Cons**: Larger bundle size than native Swift
- **Alternative Considered**: Swift + SwiftUI (rejected due to development complexity)

### **Monaco Editor** ✅ CHOSEN  
**Why**: Provides rich text editing with custom language support
- **Pros**: Syntax highlighting, autocompletion, familiar VS Code experience
- **Cons**: Larger than simple textarea
- **Alternative Considered**: CodeMirror (rejected due to less TypeScript support)

### **Local Markdown Storage** ✅ CHOSEN
**Why**: User-owned, version-controllable, human-readable
- **Pros**: No vendor lock-in, works offline, familiar format
- **Cons**: No built-in collaboration
- **Alternative Considered**: SQLite (rejected due to opacity and complexity)

## 🎨 Design Decisions

### **Text-First Interface** ✅ CHOSEN
**Why**: Minimises cognitive overhead and maximises writing space
- **Implementation**: 95% text area, minimal UI chrome
- **Rationale**: Note-taking should feel like thinking, not software operation
- **Alternative Considered**: Traditional form-based UI (rejected as too complex)

### **Inline Metadata with `@tags`** ✅ CHOSEN
**Why**: Keeps structure visible and editable within content
- **Format**: `@group:Product @audience:Sarah,DevTeam`
- **Benefit**: No separate fields to fill, visible in exported text
- **Alternative Considered**: Separate metadata fields (rejected as disruptive)

### **Click-to-Complete Interactions** ✅ CHOSEN
**Why**: Makes static text interactive without complex UI
- **Implementation**: Click `[]` to toggle `[x]`, click `->` to toggle `-x>`
- **Rationale**: Natural interaction model, visual feedback
- **Alternative Considered**: Keyboard shortcuts only (rejected as less discoverable)

### **Pulsing Dot Status Indicators** ✅ CHOSEN (v2.2.10)
**Why**: Consistent, minimal UI feedback without text clutter
- **Implementation**: Colour-coded 8px pulsing dots for audio system states:
  - 🟡 Yellow: Audio system starting (worker initialising)
  - 🔵 Blue: Audio system restarting
  - 🔴 Red: Recording active
  - ⚫ Grey: Idle/ready
- **Rationale**: Dots are consistent across all states; text labels ("Starting audio...") broke visual consistency
- **Previous Approach**: Text labels for some states, dots for others (inconsistent)
- **Alternative Considered**: Text-only status (rejected as visually cluttered and inconsistent)

## 🔧 Technical Implementation Decisions

### **Custom Monaco Language ('notes')** ✅ CHOSEN
**Why**: Enables syntax highlighting and intelligent autocompletion
- **Features**: Colour-coded actions, connections, metadata
- **Benefit**: Visual distinction without UI complexity
- **Alternative Considered**: Plain markdown (rejected due to limited highlighting)

### **IPC Communication Pattern** ✅ CHOSEN
**Why**: Clean separation between UI and file operations
- **Implementation**: Electron IPC with typed handlers
- **Benefit**: Type safety, testable storage layer
- **Alternative Considered**: Direct file access from renderer (rejected for security)

### **Auto-save with Debouncing** ✅ CHOSEN
**Why**: Never lose work without performance impact
- **Implementation**: 1-second delay after typing stops
- **Rationale**: Balance between safety and performance
- **Alternative Considered**: Manual save (rejected as error-prone)

## 🎯 User Experience Decisions

### **Always-on-Top with Auto-Hide** ✅ CHOSEN
**Why**: Available when needed, invisible when not
- **Behaviour**: Show on hotkey, hide on focus loss
- **Rationale**: Reduces context switching while avoiding distraction
- **Alternative Considered**: Normal window (rejected as less accessible)

### **Global Hotkey (Cmd+Shift+N)** ✅ CHOSEN
**Why**: Instant access from any application
- **Choice**: Standard modifier pattern, 'N' for Notes
- **Rationale**: Muscle memory for quick access
- **Alternative Considered**: Menu bar only (rejected as slower)

### **Text Commands (Cmd+K)** ✅ CHOSEN
**Why**: Keyboard-driven navigation without menu complexity
- **Implementation**: Command palette with `/` prefixed commands
- **Benefit**: Fast, discoverable, extensible
- **Alternative Considered**: Traditional menus (rejected as mouse-dependent)

## 📁 File Organisation Decisions

### **Date-First Naming: `YYYY-MM-DD_Group_HHMM.md`** ✅ CHOSEN
**Why**: Chronological sorting while maintaining context grouping
- **Benefit**: Natural ordering, unique names, context visible
- **Rationale**: Time is primary organising principle for meeting notes
- **Alternative Considered**: Group-first naming (rejected due to poor chronological sorting)

### **YAML Frontmatter + Markdown** ✅ CHOSEN
**Why**: Structured metadata with human-readable content
- **Format**: Standard Jekyll/Hugo pattern
- **Benefit**: Parseable by many tools, clean separation
- **Alternative Considered**: JSON metadata (rejected as less readable)

### **~/Documents/Notes Directory** ✅ CHOSEN
**Why**: User-accessible, standard location, easy backup
- **Rationale**: Users should own their data in familiar location
- **Alternative Considered**: Application data directory (rejected as hidden)

## 🎹 Navigation & UX Decisions

### **Keyboard Navigation (Option+Arrows)** ✅ CHOSEN
**Why**: Fast chronological note browsing without conflicting with text editing
- **Implementation**: Option+Down for older notes, Option+Up for newer notes, Option+Left/Right for action navigation
- **Benefit**: Natural timeline navigation without interfering with cursor movement shortcuts
- **Evolution**: Changed from Cmd+arrows in v1.6.2 due to user feedback about typing conflicts
- **Alternative Considered**: Arrow keys only (rejected due to editor conflicts)

### **Dynamic Window Titles** ✅ CHOSEN
**Why**: Provides context without taking screen space
- **Format**: "Tue 26 Aug 14:31" extracted from note IDs
- **Benefit**: Shows note timestamp in both system title and UI header
- **Alternative Considered**: Static "Note Taker" title (rejected as less informative)

### **No Navigation Wrapping** ✅ CHOSEN
**Why**: Predictable boundary behaviour prevents confusion
- **Implementation**: Navigation stops at first/last note
- **Rationale**: Users expect clear start/end points in chronological lists
- **Alternative Considered**: Circular navigation (rejected after user feedback)

## 🧪 Testing & Quality Decisions

### **Test-Driven Navigation Development** ✅ CHOSEN
**Why**: Complex navigation logic required upfront verification
- **Implementation**: Comprehensive test suite before UI integration
- **Benefit**: Caught edge cases early, confident feature delivery
- **Alternative Considered**: Manual testing only (rejected as error-prone)

### **Jest + TypeScript Testing** ✅ CHOSEN
**Why**: Type-safe testing with mocking capabilities
- **Features**: 26+ tests covering FileStorage, IPC, navigation
- **Benefit**: Prevents regressions, documents expected behaviour
- **Alternative Considered**: No testing framework (rejected for production code)

### **Coverage-Driven Development** ✅ CHOSEN
**Why**: Ensures all critical paths are verified
- **Implementation**: Coverage reports show untested code
- **Target**: Focus on business logic and edge cases
- **Alternative Considered**: Feature testing only (rejected as incomplete)

## 📋 Process & Tooling Decisions

### **Simplified GitHub Issue Templates** ✅ CHOSEN
**Why**: Faster issue reporting encourages community engagement
- **Implementation**: Minimal required fields, clear placeholders
- **Rationale**: Simple is fast, essential info only
- **Alternative Considered**: Comprehensive templates (rejected as barriers)

### **Australian English Documentation** ✅ CHOSEN
**Why**: Consistent voice and developer preference
- **Implementation**: "colour" not "color", "realise" not "realize"
- **Benefit**: Authentic communication style
- **Alternative Considered**: US English (rejected for consistency)

## ⚡ Electron Architecture Lessons

### **Renderer Process File Operations** ❌ ARCHITECTURAL VIOLATION → ✅ FIXED
**Problem**: Badge counting logic in App.tsx making IPC calls to load all notes violates Electron process separation
**Why Wrong**: 
- Renderer should only handle UI, not business logic
- Creates performance issues with large datasets
- Blurs responsibility boundaries between processes
- Makes testing and debugging more complex
**Solution Applied**: Created `updateDockBadge()` function in main process using existing FileStorage methods
- Reused `getOpenNotesFromLastMonth()` and `countIncompleteItems()` 
- Added automatic triggers to save/update/delete handlers
- Removed manual IPC badge system entirely
**Lesson**: Strict process separation is essential for maintainable Electron apps

### **Complex IPC Communication** ❌ REJECTED
**Attempted**: Detailed data passing between main and renderer for badge calculations
**Problem**: Created tight coupling and performance overhead
**Solution**: Keep IPC surface minimal - simple triggers and results only
**Principle**: Main process owns data, renderer owns presentation

## 🎙️ Audio Transcription Decisions (v1.7.0)

### **ts-audio-transcriber Library** ✅ CHOSEN
**Why**: Avoids maintaining complex audio code in the main repo
- **Benefit**: Focused on note-taking features, audio handled by specialized library
- **Implementation**: Separate Node.js worker process with Vosk speech recognition
- **Alternative Considered**: Building custom audio pipeline (rejected as out of scope)

### **Newest-Note Recording Strategy** ✅ CHOSEN
**Why**: Simplest user mental model without external triggers
- **Behaviour**: New note creation → auto-start recording
- **Rationale**: One active recording at a time prevents confusion
- **Alternative Considered**: Zoom-based triggers (rejected as too complex)

### **90-Second Grace Period** ✅ CHOSEN
**Why**: Allows brief navigation without stopping recording
- **Implementation**: Timer starts on note switch/window hide, cancels on return
- **Benefit**: Natural workflow doesn't interrupt recording for quick actions
- **Alternative Considered**: Immediate stop (rejected as disruptive)

### **Local Vosk Model** ✅ CHOSEN
**Why**: Offline, private, no API costs
- **Model**: vosk-model-en-us-0.22 (English)
- **Confidence Threshold**: 0.3 (balances accuracy and completeness)
- **Alternative Considered**: Cloud-based Whisper API (rejected for privacy/cost)

### **Model Download-on-Demand** ✅ CHOSEN
**Why**: Keeps repository and distributable size minimal
- **Implementation**: ModelDownloader service checks and downloads model on first initialization
- **Benefit**: ~40MB model not stored in git or DMG, downloaded only when needed
- **Location**: Downloaded to `~/Library/Application Support/Note Taker/models/vosk-model-en-us-0.22`
- **Rationale**: Application Support directory survives app updates and is the standard macOS location for user data
- **Alternative Considered**: Bundling model (rejected due to size)

### **Dual Output Files (.snippet + .transcription)** ✅ CHOSEN
**Why**: Different use cases for real-time vs final transcript
- **Snippets**: 5-second intervals for monitoring progress
- **Transcript**: Complete session with word count and confidence
- **Alternative Considered**: Single file (rejected as less flexible)

### **ts-audio-transcriber Library Update to v1.1.1** ✅ CHOSEN (v2.0.0)
**Why**: Critical race condition fix for multi-note reliability
- **Problem**: v1.1.0 had race condition when stop() called during processing, preventing sessionTranscript emission
- **Impact**: First note's full transcript lost when creating second note, snippets stopped working
- **Solution**: Library developer released v1.1.1 with proper async event handling
- **Alternative Considered**: 2-second delay workaround (rejected after library fix available)
- **Lesson**: External library fixes preferred over workarounds when available

### **25-Second Grace Period** ✅ CHOSEN (v2.0.0)
**Why**: More responsive privacy controls than original 90 seconds
- **Rationale**: 25 seconds sufficient for quick note navigation without being intrusive
- **Benefit**: Faster response to user hiding window or switching contexts
- **Alternative Considered**: 90 seconds (rejected as too long for privacy-focused users)
- **Future Consideration**: May make this user-configurable if requested

## 🔄 What Didn't Work - Lessons Learned

### **Zoom-Based Recording Triggers** ❌ REJECTED
**Attempted**: Automatically start/stop recording based on Zoom meeting detection
**Problem**:
- Complex process monitoring with edge cases
- Required BlackHole virtual audio driver for system audio
- Whisper.cpp packaging issues with Electron's ASAR
- Too many dependencies and failure points
**Solution**: Simplified to newest-note strategy with manual control via note creation
**Lesson**: External triggers add complexity; align with existing user workflows instead
**Cleanup (v2.2.10)**: Removed ZoomDetectionService.ts as dead code - was never integrated into main.ts

### **Initial Complex UI Approach** ❌ REJECTED
**Attempted**: Traditional form-based interface with separate fields
**Problem**: Disrupted writing flow, felt like software not thinking
**Solution**: Pivoted to text-first design with inline metadata

### **First Navigation Implementation** ❌ REJECTED
**Attempted**: Initial keyboard navigation with wrapping
**Problem**: User reported confusing direction and unwanted looping
**Solution**: Fixed direction mapping and removed wrap-around behaviour

### **Cmd+Arrow Navigation Shortcuts** ❌ REJECTED
**Attempted**: Cmd+Up/Down/Left/Right for note navigation
**Problem**: Conflicted with standard text editing shortcuts (Cmd+Left/Right for cursor to start/end of line)
**Solution**: Changed to Option+arrows in v1.6.2 to preserve normal typing workflow

### **Comprehensive Issue Templates** ❌ REJECTED
**Attempted**: Detailed GitHub forms with multiple required fields
**Problem**: Too time-consuming, discourages quick bug reports
**Solution**: Streamlined to essential information only

### **Build Artifact Caching** ❌ CRITICAL ISSUE → ✅ FIXED (v2.2.10)
**Problem**: Stale code in dist/ and release/ folders caused distribution packages to contain old code
**Symptoms**:
- Yellow "starting audio" dot stuck permanently in distributed app
- "Audio failed - retry" errors appearing in installed version
- Features working in dev mode but not in packaged app
- Confusion about whether dist version matched source code
**Root Cause**:
- `npm run build` did not clean dist/ folder before rebuilding
- `npm run dist` did not clean release/ folder before packaging
- Old compiled files persisted and were packaged instead of newly compiled code
**Solution Applied**: Added automatic cleanup to build scripts in package.json:
```json
"clean": "rm -rf dist release",
"clean:dist": "rm -rf dist",
"build": "npm run clean:dist && npm run build:main && npm run build:renderer",
"dist": "rm -rf release && electron-builder",
```
**Lesson**: Always clean build artifacts before rebuilding to ensure consistent, predictable builds
**Debugging Tip**: When dist version behaves differently from dev, first verify builds are clean by manually deleting dist/ and release/ folders

### **Dual-Source Transcription (Mic + System Audio)** ✅ IMPLEMENTED
**Goal**: Capture both microphone (user) and system audio (other participants) for annotated transcripts
**Implementation**:
- `DualSourceTranscriber.swift` coordinates dual audio pipelines with independent speech recognizers
- Microphone capture uses AVAudioEngine tap + dedicated SFSpeechRecognizer
- System audio uses `ScreenCaptureAudio.swift` (ScreenCaptureKit, macOS 13+) with Core Audio Taps as fallback
**Key Architecture (Jan 2026)**:
- **Two completely independent pipelines** to avoid interference:
  - Separate `SFSpeechRecognizer` instance for each source
  - Separate `SFSpeechAudioBufferRecognitionRequest` for each source
  - Microphone has its own AVAudioEngine with tap
  - System audio uses ScreenCaptureKit or Core Audio Taps
- System audio setup runs asynchronously to avoid blocking microphone capture
- Transcripts annotated with `[You]` for user and `[Other]` for system audio

**System Audio Capture Evolution**:
1. **Core Audio Taps (macOS 14.4+)** - Initial implementation
   - Uses `CATapDescription(monoGlobalTapButExcludeProcesses: [])`
   - Creates process tap + aggregate device
   - **Issue on macOS 26.2**: Returns zero-value audio buffers despite permissions enabled
   - Multiple attempts to fix (privateTap, muteBehavior, exclusive properties) did not resolve

2. **ScreenCaptureKit (macOS 13+)** ✅ WORKING - Current primary method
   - Uses `SCStream` with audio-only configuration (minimal video: 2x2px, 1fps)
   - Successfully captures system audio with actual audio data
   - Speech recognition confirmed working ("Gentlemen" detected in test)
   - Fallback to Core Audio Taps if ScreenCaptureKit fails

**ScreenCaptureKit Setup** (in `ScreenCaptureAudio.swift`):
1. Get `SCShareableContent` - enumerate displays
2. Create `SCContentFilter` for display
3. Configure `SCStreamConfiguration` with `capturesAudio = true`
4. Create `SCStream` and add audio output handler
5. Convert `CMSampleBuffer` to `AVAudioPCMBuffer` for speech recognition

**Core Audio Taps Setup** (in `CoreAudioTapCapture.swift`, fallback):
1. `CATapDescription(monoGlobalTapButExcludeProcesses: [])` - captures all system audio
2. `AudioHardwareCreateProcessTap()` - creates the tap
3. Create aggregate device with ONLY the tap (no sub-devices)
4. Use `AVAudioEngine` with aggregate device as input
5. Install tap on input node for audio buffers

**Concurrent SFSpeechRecognizer Limitation** ❌ DISCOVERED (Jan 2026):
- When running two separate SFSpeechRecognizer instances (one for mic, one for system audio), only the first to receive audio buffers produces results
- The second recognizer silently fails with silence timeouts
- Each recognizer works perfectly when run individually
- This appears to be an undocumented Apple limitation

**Solution: Hybrid Approach (SFSpeechRecognizer + SpeechAnalyzer)** ✅ WORKING:
- Uses **different APIs** for each audio source to avoid conflicts:
  - **Microphone**: Traditional `SFSpeechRecognizer` → `[You]` annotation
  - **System Audio**: New `SpeechAnalyzer` API (macOS 26) → `[Other]` annotation
- Successfully transcribes both sources simultaneously with speaker separation
- Each API uses independent speech recognition systems that don't conflict

**Implementation** (`HybridDualTranscriber.swift`):
1. Create `SFSpeechRecognizer` for microphone with `AVAudioEngine` tap
2. Create `SpeechTranscriber` + `SpeechAnalyzer` for system audio via ScreenCaptureKit
3. Mic buffers → `SFSpeechAudioBufferRecognitionRequest.append()`
4. System buffers → Convert to analyzer format → `AsyncStream<AnalyzerInput>.yield()`
5. Results from mic tagged as `[You]`, results from system tagged as `[Other]`
6. Combined snippet shows both transcripts in real-time

**Test Results** (Jan 2026):
- Microphone: "I'm testing the audio and I'm talking right now..."
- System audio: "Gentlemen, this is Democracy Manifest. What is the charge? A succulent Chinese meal..."
- Both transcribed simultaneously with correct speaker attribution

**Requirements**:
- macOS 26+ for SpeechAnalyzer API (new requirement)
- macOS 13+ for ScreenCaptureKit system audio capture
- `NSAudioCaptureUsageDescription` in Info.plist for system audio permission
- Screen recording permission required for ScreenCaptureKit
- Language models downloaded on-demand via `AssetInventory`

**Research Sources**:
- [Apple Core Audio Taps Documentation](https://developer.apple.com/documentation/CoreAudio/capturing-system-audio-with-core-audio-taps)
- [AudioCap](https://github.com/insidegui/AudioCap) - Sample code for macOS 14.4+
- [AudioTee](https://github.com/makeusabrew/audiotee) - Swift CLI tool using Core Audio Taps
- [WWDC25 - SpeechAnalyzer](https://developer.apple.com/videos/play/wwdc2025/277/)
- [iOS 26 SpeechAnalyzer Guide](https://antongubarenko.substack.com/p/ios-26-speechanalyzer-guide)
- [Apple Developer Forums - Concurrent Recognition](https://developer.apple.com/forums/thread/696502)

### **LLM Action Extraction** ✅ IMPLEMENTED (Jan 2026)
**Goal**: Automatically extract actionable items from meeting transcripts
**Implementation** (`ActionExtractionService.swift`):
- Uses OpenAI-compatible API (configurable endpoint, key, model)
- Extracts three types: actions, commitments, expectations
- Each item has importance rating (critical/high/medium/low)
- Includes owner, deadline, and context where mentioned
- Saves to `.actions` JSON files alongside notes
- Tags from `@audience:` used for filtering by context

**Async Completion Handling**:
- `pendingExtractions` counter tracks in-flight LLM calls
- `waitForPendingExtractions(timeout:)` blocks app termination
- AppDelegate uses `terminateLater` to ensure extraction completes before quit

**Configuration** (via UserDefaults):
```bash
defaults write NoteTaker llm_endpoint "https://api.openai.com/v1/chat/completions"
defaults write NoteTaker llm_api_key "your-api-key"
defaults write NoteTaker llm_model "gpt-4o-mini"
```

### **Separate Command Window** ❌ REJECTED
**Attempted**: Dedicated command window for navigation
**Problem**: Added complexity, broke single-window simplicity
**Solution**: Modal command palette overlay

### **Rich Text Formatting** ❌ REJECTED
**Attempted**: Bold, italic, colours in text editor
**Problem**: Complexity without clear benefit for note-taking use case  
**Solution**: Focus on structural highlighting (actions, connections)

### **Multiple Window Support** ❌ REJECTED
**Attempted**: Allow multiple notes open simultaneously
**Problem**: Violated simplicity principle, increased cognitive load
**Solution**: Single window with fast switching via commands

## 🎯 Key Success Factors

### **Ruthless Simplicity**
Every feature decision asked: "Does this make note-taking faster or better?" If not, it was removed or simplified.

### **Text as Primary Interface**
Treating text content as the main interaction surface rather than building complex UI reduced both development time and user cognitive overhead.

### **Performance First**
Optimising for immediate availability (< 1 second from hotkey to typing) shaped all architecture decisions including storage format and UI complexity.

### **User Data Ownership**
Choosing local markdown files over proprietary formats ensures user control and tool longevity.

## 🔮 Future Architecture Considerations

### **Cloud Sync Abstraction** 
Storage interface designed for easy extension to Dropbox, iCloud, or custom sync without UI changes.

### **Plugin Architecture**
Monaco language system and IPC handlers structured to allow future extensions (templates, integrations, export formats).

### **Performance Monitoring**
Built-in telemetry hooks for understanding real-world usage patterns and performance bottlenecks.

### **Cross-Platform Potential**  
Electron foundation enables future Windows/Linux versions with minimal changes to core functionality.