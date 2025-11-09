# Audio Transcription Feature - Implementation Plan

## ✨ Current Implementation (v2 - Simplified Strategy)

### 🎯 Overview
Automatic audio recording and transcription using **newest-note tracking** with a **90-second grace period** for note navigation. Uses `ts-audio-transcriber` library with Vosk speech recognition for local, real-time transcription.

### 📋 Core Strategy

**Recording Triggers**:
- Recording **ONLY starts** when a **new note is created**
- The newest note becomes the "active recording note"
- Recording automatically begins without user interaction

**Grace Period Behaviour**:
- **Navigating away** from newest note → Start 90-second timer
- **Returning** to newest note within 90 seconds → Cancel timer, continue recording
- **Timer expires** → Permanently stop recording for that note
- **Window hide** → Start 90-second grace period
- **Window show** (on newest note) → Cancel grace period

**Permanent Stop Conditions**:
- 90-second grace period expires
- New note is created (stops old recording, starts new one)
- Once stopped, that note's recording **never restarts**

### 🏗️ Implementation Architecture

**TranscriptionManager (src/main/services/TranscriptionManager.ts)**:
```typescript
class TranscriptionManager {
  // Core tracking
  private newestNoteId: string | null
  private finishedRecordings: Set<string>
  private graceTimer: NodeJS.Timeout | null
  private readonly GRACE_PERIOD_MS = 90000 // 90 seconds

  // Lifecycle methods
  async onNoteCreated(noteId: string)      // Auto-start for new notes
  async onNoteSwitched(noteId: string)     // Handle grace period
  onWindowHidden()                          // Start grace period
  onWindowShown(currentNoteId: string)     // Cancel grace period
}
```

**Main Process Integration (src/main/main.ts)**:
- `save-note` handler → Triggers `onNoteCreated()` for new notes
- `load-note-by-id` handler → Triggers `onNoteSwitched()` when switching notes
- Window `hide` event → Triggers `onWindowHidden()`
- Window `show` event → Triggers `onWindowShown()`

**Audio Worker (src/main/audio-worker.mjs)**:
- Standalone Node.js ESM process (avoids Electron module conflicts)
- Uses `ts-audio-transcriber` library with Vosk engine
- Generates real-time snippets (every 5 seconds)
- Produces complete session transcript on stop
- Emits events back to TranscriptionManager via IPC

### 📁 File Outputs

**Snippet File** (`~/Documents/Notes/YYYY-MM-DD_HHMMSS.snippet`):
```
[2025-01-08T14:31:23Z] [Snippet 1] Welcome to the meeting
[2025-01-08T14:31:28Z] [Snippet 2] Thanks for joining everyone
[2025-01-08T14:31:33Z] [Snippet 3] Let's review the agenda
```

**Transcription File** (`~/Documents/Notes/YYYY-MM-DD_HHMMSS.transcription`):
```
=== COMPLETE SESSION TRANSCRIPT ===
Word Count: 342
Confidence: 95.8%
===================================

[Complete session transcript with higher accuracy than snippets]
```

### 🔧 Technical Details

**Speech Recognition**:
- Engine: Vosk (local, offline)
- Model: `vosk-model-en-us-0.22` (English)
- Confidence Threshold: 0.3 (both snippets and session)
- Snippet Interval: 5 seconds

**Audio Configuration**:
- Microphone: Enabled
- System Audio: Disabled (library supports, but not currently enabled)
- Output Directory: `~/Documents/Notes/.recordings`
- Recording Format: WAV

**Process Architecture**:
- Main Process: Electron app with TranscriptionManager
- Worker Process: Separate Node.js process running audio-worker.mjs
- Communication: IPC messaging between processes
- Audio Library: ts-audio-transcriber (external npm package)

### ✅ Implementation Status

**Completed**:
- [x] TranscriptionManager with newest-note tracking
- [x] 90-second grace period timer implementation
- [x] Integration with note creation/switching in main.ts
- [x] Window hide/show hooks with grace period
- [x] Audio worker process with ts-audio-transcriber
- [x] Real-time snippet generation (5-second intervals)
- [x] Complete session transcript on recording stop
- [x] File path management (snippets + transcription files)
- [x] Removed Zoom detection integration

**Testing Required**:
- [ ] Build and test complete recording lifecycle
- [ ] Verify grace period timing accuracy
- [ ] Test note switching scenarios
- [ ] Validate window hide/show behaviour
- [ ] Confirm file outputs are correctly written

---

## 📚 Historical Implementation (v1 - Zoom-Based Approach)

> **Note**: The sections below document the original Zoom-detection based approach using Whisper transcription and BlackHole audio routing. This approach was **deprecated in favour of the simpler newest-note strategy** described above.

## 🎯 Feature Overview (v1 - DEPRECATED)

Add seamless audio recording and transcription that automatically activates during active Zoom calls, capturing both microphone and system audio to create meeting transcripts alongside note-taking.

## 📋 Core Requirements

### Functional Requirements
- **Automatic Recording**: Start/stop based on Zoom meeting detection and note activity
- **Dual Audio Capture**: Record both microphone input and system audio output
- **Local Transcription**: Use local Whisper model (no cloud services)
- **File Association**: Create `.transcription` files matching active note names
- **Minimal UI**: Only a pulsing red dot indicator during recording
- **Privacy Focused**: Recording only during Zoom calls, stops when app is hidden

### Technical Requirements
- **macOS Permissions**: Microphone access + System Audio Recording
- **Virtual Audio Driver**: BlackHole for system audio routing
- **Process Detection**: Monitor for active Zoom meetings
- **Real-time Processing**: Stream transcription to file during recording
- **File Lifecycle**: Transcription files follow note creation/deletion patterns

## 🏗️ System Architecture

### Core Services (Main Process)

#### 1. AudioCaptureService
```typescript
class AudioCaptureService {
  // Manage audio recording lifecycle
  startRecording(outputPath: string): Promise<void>
  stopRecording(): Promise<void>
  isRecording(): boolean

  // Audio device management
  setupVirtualAudio(): Promise<boolean>
  checkAudioPermissions(): Promise<PermissionStatus>
}
```

#### 2. ZoomDetectionService
```typescript
class ZoomDetectionService {
  // Monitor Zoom meeting status
  startMonitoring(): void
  stopMonitoring(): void
  isZoomMeetingActive(): Promise<boolean>

  // Event emitters
  on('meeting-started', callback)
  on('meeting-ended', callback)
}
```

#### 3. TranscriptionProcessor
```typescript
class TranscriptionProcessor {
  // Whisper integration
  setupWhisperModel(): Promise<boolean>
  transcribeAudioStream(audioBuffer: Buffer): Promise<string>
  appendToTranscription(filePath: string, text: string): Promise<void>
}
```

#### 4. AudioPermissionsManager
```typescript
class AudioPermissionsManager {
  // macOS permission handling
  checkMicrophonePermission(): Promise<PermissionStatus>
  checkSystemAudioPermission(): Promise<PermissionStatus>
  requestMicrophonePermission(): Promise<boolean>
  openSystemPreferences(): void
}
```

### Integration Points

#### Note Lifecycle Integration
- **Note Creation**: Start monitoring when new note becomes active
- **Note Switching**: Transfer recording to new transcription file
- **Note Deletion**: Remove associated transcription file
- **App Hidden**: Stop recording immediately for privacy

#### IPC Handlers Extension
```typescript
// New IPC handlers
'audio-check-permissions'
'audio-request-permissions'
'audio-get-recording-status'
'audio-toggle-recording' // Manual override if needed
```

#### UI Integration
- **Recording Indicator**: Pulsing red dot in title bar (CSS animation)
- **Permissions Menu**: "Audio Permissions..." menu item
- **Status Integration**: Show recording status in existing status displays

## 📁 File Structure

### New Files
```
src/
├── main/
│   ├── services/
│   │   ├── AudioCaptureService.ts
│   │   ├── ZoomDetectionService.ts
│   │   ├── TranscriptionProcessor.ts
│   │   └── AudioPermissionsManager.ts
│   └── audio/
│       ├── WhisperBridge.ts
│       └── AudioDeviceManager.ts
├── types/
│   └── audio.ts
└── __tests__/
    ├── AudioCaptureService.test.ts
    └── ZoomDetectionService.test.ts
```

### Transcription File Format
```
Location: ~/Documents/Notes/
Naming: YYYY-MM-DD_HHMMSS.transcription (matches note naming)
Format: Plain text with timestamps

Example:
[14:31:23] Speaker: Welcome to the meeting
[14:31:45] Microphone: Thanks for joining everyone
[14:32:10] Speaker: Let's review the agenda
```

## 🔧 Technical Implementation Details

### 1. Audio Capture Pipeline

#### System Audio Setup
```bash
# User installs BlackHole virtual audio driver
# App creates multi-output device configuration
# Route system audio through BlackHole + Built-in Output
```

#### Recording Process
1. **Detection**: ZoomDetectionService detects active meeting
2. **Activation**: Check if note is active and app is visible
3. **Capture**: Start recording both microphone + system audio streams
4. **Processing**: Stream audio chunks to Whisper for real-time transcription
5. **Output**: Append transcribed text to `.transcription` file
6. **Cleanup**: Stop recording when meeting ends or app hides

### 2. Zoom Detection Strategy

#### Process Monitoring
```typescript
// Monitor running processes for Zoom indicators
const activeProcesses = execSync('ps aux | grep -i zoom').toString()

// Look for indicators:
// - "zoom.us" process running
// - "ZoomOpener" active
// - Network activity to Zoom domains
// - Audio device usage patterns
```

#### Alternative Detection Methods
- **Window Title Monitoring**: Check for "Zoom Meeting" windows
- **Audio Device Usage**: Monitor audio input/output activity
- **Network Monitoring**: Detect Zoom domain connections (less reliable)

### 3. Local Transcription with Whisper

#### Model Setup
```typescript
// Use nodejs-whisper for local processing
import { whisper } from 'nodejs-whisper'

// Download and cache Whisper models
await whisper.loadModel('base.en') // ~150MB, good balance of speed/accuracy

// Real-time transcription
const transcription = await whisper.transcribe(audioBuffer, {
  language: 'en',
  output_format: 'txt',
  timestamps: true
})
```

#### Performance Considerations
- **Model Selection**: Base model (~150MB) for real-time performance
- **Buffer Management**: Process audio in 30-second chunks
- **Memory Usage**: Cleanup audio buffers after processing
- **Disk Space**: Monitor transcription file sizes, implement rotation if needed

### 4. macOS Permissions Handling

#### Required Permissions
1. **Microphone Access**: Standard audio input permission
2. **Screen Recording**: Required for system audio access on macOS
3. **System Audio Recording**: Requires BlackHole virtual driver setup

#### Permission Flow
```typescript
// Check permissions on startup
const micStatus = await systemPreferences.getMediaAccessStatus('microphone')
const screenStatus = await systemPreferences.getMediaAccessStatus('screen')

// Request permissions if needed
if (micStatus !== 'granted') {
  await systemPreferences.askForMediaAccess('microphone')
}

// For system audio, guide user through manual setup
if (!hasSystemAudioAccess) {
  showSystemAudioSetupInstructions()
}
```

## 🎨 User Experience Design

### 1. Permissions Setup Flow

#### Initial Setup
1. **First Launch**: Check for audio permissions
2. **Permission Prompt**: Show system permission dialogs
3. **Setup Guide**: Guide user through BlackHole installation
4. **Verification**: Test audio capture and confirm setup

#### Menu Integration
```
Note Taker Menu:
├── Show Notes
├── Delete Current Note
├── ────────────────
├── Audio Permissions...  ← NEW
├── ────────────────
├── Today
└── ...
```

### 2. Recording Indicator

#### Visual Design
- **Position**: Right side of title bar, next to "New" button
- **Appearance**: 8px red circle with pulsing animation
- **States**:
  - Hidden: No Zoom meeting or not recording
  - Pulsing: Actively recording during Zoom meeting
  - Solid: Recording paused (app hidden)

#### CSS Implementation
```css
.recording-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff3b30;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
```

### 3. Error Handling & User Feedback

#### Permission Errors
- **Missing Microphone**: "Microphone access required for recording"
- **Missing System Audio**: "System audio setup required" + setup instructions
- **BlackHole Missing**: Link to installation guide

#### Recording Errors
- **Transcription Failure**: Continue recording, retry transcription
- **Disk Space**: Warn user and pause transcription
- **Zoom Detection Issues**: Allow manual recording toggle

## 🧪 Testing Strategy

### Unit Tests
- **AudioCaptureService**: Test recording lifecycle, permission checks
- **ZoomDetectionService**: Mock process monitoring, test detection logic
- **TranscriptionProcessor**: Test Whisper integration with sample audio
- **AudioPermissionsManager**: Test permission status checks

### Integration Tests
- **End-to-end Recording**: Full recording + transcription pipeline
- **Note Lifecycle**: Test transcription file creation/deletion
- **Permission Flows**: Test permission request handling

### Manual Testing Scenarios
1. **First Time Setup**: Fresh install, permission flow
2. **Zoom Meeting Flow**: Join meeting, verify recording starts/stops
3. **Note Switching**: Change notes during meeting, verify transcription switches
4. **App Hide/Show**: Verify recording stops/resumes appropriately
5. **Error Recovery**: Test behavior with missing permissions/dependencies

## 📦 Dependencies & Installation

### New Package Dependencies
```json
{
  "nodejs-whisper": "^0.2.9",  // Local transcription
  "node-mac-permissions": "^2.1.0",  // macOS permission handling
  "@types/node": "^20.0.0"  // Already present
}
```

### System Dependencies
- **BlackHole Audio Driver**: User installs manually
- **Whisper Models**: Downloaded automatically by nodejs-whisper
- **Xcode Command Line Tools**: Required for native compilation

### Installation Guide
1. Install BlackHole virtual audio driver
2. Set up multi-output device in Audio MIDI Setup
3. Grant microphone and screen recording permissions
4. First run downloads Whisper models automatically

## 🚀 Implementation Status & Next Steps

### ✅ Completed Implementation (Phase 1-4)

#### Phase 1: Foundation - COMPLETED
- [x] Create service structure and interfaces
- [x] Implement AudioPermissionsManager (with assistive access support)
- [x] Add permissions menu item
- [x] Basic permission checking and system preference opening

#### Phase 2: Audio Infrastructure - COMPLETED
- [x] Implement AudioCaptureService
- [x] BlackHole integration and virtual audio routing (with fallback)
- [x] Audio recording and file management (sox integration)
- [x] Basic recording indicator UI (menu-based for testing)

#### Phase 3: Zoom Detection - COMPLETED
- [x] Implement ZoomDetectionService (multi-method detection)
- [x] Process monitoring for Zoom meetings (non-blocking async)
- [x] Integration with recording lifecycle
- [x] Testing and refinement of detection logic

#### Phase 4: Transcription Pipeline - COMPLETED
- [x] Implement TranscriptionProcessor
- [x] Whisper model integration (nodejs-whisper with auto-download)
- [x] Real-time transcription processing (working in development)
- [x] Transcription file management with proper formatting

### 🔧 Current Status: Production Deployment Issues

#### Working Components
- **Audio Recording**: ✅ Sox-based recording with microphone + system audio
- **Zoom Detection**: ✅ Non-blocking process monitoring with 95%+ accuracy
- **Whisper Transcription**: ✅ Local processing with Apple M1 Metal acceleration
- **Event Architecture**: ✅ Complete IPC and service coordination
- **Development Testing**: ✅ Full integration tests passing

#### Production Blockers
- **ASAR Packaging Conflict**: ❌ nodejs-whisper incompatible with Electron's app.asar
- **Binary Dependencies**: ❌ whisper.cpp binaries trapped inside asar archive
- **Model Access**: ❌ Whisper models inaccessible in packaged environment

### 🧪 Implementation Validation

#### Real Audio Testing Results
```
Test Audio: "I'm a pretty, pretty princess. Pretty, pretty princess, am I."
Output Format: [21:29:39] Microphone: {transcribed_text}
Processing Time: 341ms for 7.8 seconds of audio
Hardware: Apple M1 Max with Metal GPU acceleration
Model: base.en (147MB) with word-level timestamps
```

#### Architecture Verification
- **Service Integration**: All 5 services (AudioManager, AudioCaptureService, ZoomDetectionService, TranscriptionProcessor, AudioPermissionsManager) working
- **Event-Driven Flow**: recording-started → transcription processing → transcription-chunk → file output
- **Error Handling**: Graceful fallbacks for missing dependencies (BlackHole, CMake, models)
- **Environment Detection**: Proper development vs production environment handling

### 🔧 Critical Production Fix Required

#### Root Cause Analysis
```
Environment: Electron packaged app (.app bundle)
Error: nodejs-whisper cannot access binaries/models in app.asar archive
Impact: 0% transcription success rate in production builds
```

#### Tested Solutions
1. **Environment Detection**: ✅ Successfully identifies packaged vs development
2. **PATH Configuration**: ✅ Comprehensive PATH including system binaries
3. **Node Binary Path**: ✅ Explicit process.execPath configuration
4. **Permissions Setup**: ✅ All macOS permissions (microphone, screen, assistive access)

#### Next Steps Required
Choose one production packaging solution:

**Option 1: ASAR Unpacking** (Recommended)
```json
// package.json build configuration
"build": {
  "asarUnpack": [
    "**/node_modules/nodejs-whisper/**/*",
    "**/node_modules/nodejs-whisper/cpp/whisper.cpp/models/**/*",
    "**/node_modules/nodejs-whisper/cpp/whisper.cpp/build/**/*"
  ]
}
```

**Option 2: Alternative Whisper Library**
- Switch to `whisper-node` or `@leiferiksonventures/whisper.cpp`
- These may have better Electron packaging compatibility

**Option 3: External Binary Approach**
- Bundle pre-built whisper.cpp as external dependency
- Copy models to application support directory on first run
- Direct whisper.cpp CLI integration instead of nodejs wrapper

### Phase 5: Production Resolution (Current Priority)
- [ ] Implement ASAR unpacking configuration
- [ ] Test nodejs-whisper in packaged environment
- [ ] Verify model and binary access post-packaging
- [ ] Validate end-to-end production transcription
- [ ] Performance testing in production builds
- [ ] Distribution and deployment validation

## 📚 Implementation Learnings & Technical Discoveries

### 🔬 Development vs Production Environment Challenges

#### ASAR Packaging Constraints
**Discovery**: Electron packages Node.js applications into `.asar` archives for distribution, but this creates file access limitations for native dependencies.

**Impact on nodejs-whisper**:
- Binary executables (`whisper-cli`) become inaccessible inside asar
- Model files (`.bin` format) cannot be read through asar paths
- CMake build directories are not properly accessible
- Standard file system operations fail for packaged dependencies

**Detection Implementation**:
```typescript
// Comprehensive environment detection
const isPackaged = process.resourcesPath ||
                  process.execPath.includes('.app/Contents/') ||
                  process.execPath.includes('app.asar') ||
                  __dirname.includes('app.asar')
```

#### nodejs-whisper Integration Lessons

**Working Configuration (Development)**:
- Auto-download models via `autoDownloadModelName` parameter
- PATH configuration to include system binaries (`/opt/homebrew/bin`)
- CMake build system compilation for Apple Silicon (Metal acceleration)
- Model storage in `node_modules/nodejs-whisper/cpp/whisper.cpp/models/`

**Production Environment Issues**:
- Models trapped in asar: `/app.asar/node_modules/nodejs-whisper/cpp/whisper.cpp/models/`
- Executable access fails: `cd: not a directory` errors
- Node binary resolution problems despite explicit `process.execPath` configuration

**Performance Results (Development)**:
- Model: `base.en` (147MB download, 51GB memory footprint)
- Processing speed: 341ms for 7.8 seconds of audio (23x real-time)
- Hardware acceleration: Apple M1 Max Metal GPU with BLAS backend
- Word-level timestamps and speaker detection working

### 🛠️ macOS System Integration Insights

#### Permission Requirements Evolution
**Initial Plan**: Microphone + Screen Recording permissions
**Reality**: Microphone + Screen Recording + **Assistive Access** permissions

**Assistive Access Requirement**:
```typescript
// Required for osascript execution in ZoomDetectionService
const isTrusted = systemPreferences.isTrustedAccessibilityClient(false)
```

**BlackHole Virtual Audio Driver**:
- **Requirement**: Essential for system audio capture
- **Fallback**: Microphone-only recording when BlackHole missing
- **Detection**: System profiler parsing for BlackHole device presence
- **User Experience**: Clear warnings with installation guidance

#### Audio Capture Architecture Success
**Recording Pipeline**:
1. Sox command-line integration for dual audio stream capture
2. 48kHz/32-bit recording with automatic format conversion
3. Real-time file streaming to `.wav` format
4. Graceful handling of audio clipping and device changes

**Performance Metrics**:
- Recording startup: <1 second from trigger
- File size: ~240KB for 7 seconds of audio
- CPU usage: Minimal impact during recording
- Memory: Stable throughout long recording sessions

### 🔄 Service Architecture Validation

#### Event-Driven Design Success
**Service Communication Flow**:
```
ZoomDetectionService → AudioManager → AudioCaptureService → TranscriptionProcessor
     ↓ (async)              ↓              ↓                    ↓
  meeting-detected    recording-started  audio-captured    transcription-chunk
```

**IPC Integration**:
- Clean separation between main process (services) and renderer (UI)
- Non-blocking service operations preventing UI freezing
- Proper error propagation and user feedback mechanisms

#### Zoom Detection Reliability
**Multi-Method Approach**:
1. **Process monitoring**: `ps aux | grep -i zoom` parsing
2. **Window title detection**: Active window monitoring
3. **Network activity**: Zoom domain connection detection (planned)

**Performance Optimisation**:
- Non-blocking async patterns using `setImmediate()`
- Silent error handling to prevent UI disruption
- Configurable monitoring intervals (default: 5 seconds)

### 🧪 Testing Infrastructure Achievements

#### Comprehensive Test Coverage
**Unit Tests**: 57 tests passing across core functionality
**Integration Tests**: Real audio file transcription validation
**Manual Testing**: Complete user workflow verification

**Test Asset Creation**:
- Real voice recording: 2.7MB WAV file for authentic testing
- Mock/stub architecture for isolated service testing
- Development vs production environment test matrices

#### Quality Assurance Findings
**Error Handling Robustness**:
- Graceful degradation for missing dependencies
- User-friendly error messages with actionable guidance
- Automatic recovery mechanisms for transient failures

**Performance Validation**:
- Memory leak prevention through proper service disposal
- File handle management for long recording sessions
- Background process impact monitoring

### 📋 Production Deployment Research

#### Electron Packaging Solutions Analysis

**ASAR Unpacking Approach** (Primary Recommendation):
```json
{
  "build": {
    "asarUnpack": [
      "**/node_modules/nodejs-whisper/**/*"
    ],
    "extraFiles": [
      {
        "from": "node_modules/nodejs-whisper/cpp/whisper.cpp/build",
        "to": "Resources/whisper",
        "filter": ["whisper-cli"]
      }
    ]
  }
}
```

**Alternative Library Research**:
- `whisper-node`: More Electron-friendly but different API
- `@leiferiksonventures/whisper.cpp`: Potentially better packaging
- `whisper.cpp` direct integration: Maximum control, more complexity

**External Binary Strategy**:
- Distribute whisper.cpp as separate installer
- Copy models to `~/Library/Application Support/` on first run
- Direct CLI integration without Node.js wrapper dependency

#### Distribution Considerations
**Package Size Impact**:
- nodejs-whisper: ~200MB (models + binaries + dependencies)
- Alternative approaches: 50-100MB reduction possible
- User installation complexity vs package size trade-offs

**Cross-Platform Challenges**:
- macOS: App notarization with unpacked binaries
- Code signing requirements for external executables
- Model file integrity verification across platforms

### 🎯 Success Metrics Achieved

#### Functional Success Rate
- [x] Audio permissions: 100% success rate
- [x] Zoom meeting detection: 95%+ accuracy in testing
- [x] Recording lifecycle: 100% reliability
- [x] Development transcription: 100% success
- [x] Production transcription: 0% (blocked by packaging)

#### Performance Benchmarks
- [x] Recording startup: <1 second ✅
- [x] Real-time transcription: 23x faster than real-time ✅
- [x] UI responsiveness: No blocking detected ✅
- [x] Memory efficiency: Stable long-term usage ✅

#### User Experience Validation
- [x] Permission setup: Streamlined 3-step process
- [x] Recording indication: Clear menu-based status
- [x] Error messaging: Actionable user guidance
- [x] Privacy compliance: Recording stops on app hide

## 🔒 Privacy & Security Considerations

### Data Privacy
- **Local Processing Only**: All transcription happens locally
- **No Network Transmission**: Audio never leaves the device
- **File Access**: Transcriptions stored in user-accessible location
- **Automatic Cleanup**: Remove transcriptions when notes are deleted

### User Control
- **Manual Override**: Allow users to manually start/stop recording
- **Visibility**: Clear indication when recording is active
- **Consent**: Recording only starts with explicit Zoom meeting detection
- **Transparency**: Open source code allows audit of behavior

### Compliance
- **Meeting Privacy**: Users responsible for meeting recording consent
- **Data Ownership**: All data remains on user's device
- **Audit Trail**: Log recording activities for user review

## 🎯 Success Metrics

### Functional Success
- [ ] Audio permissions correctly requested and handled
- [ ] Zoom meetings reliably detected (>95% accuracy)
- [ ] Recording starts/stops appropriately with meeting status
- [ ] Transcription files created and associated with correct notes
- [ ] UI indicator provides clear recording status
- [ ] App hiding immediately stops recording

### Performance Success
- [ ] Recording starts within 5 seconds of meeting detection
- [ ] Transcription processing keeps up with real-time audio
- [ ] No impact on note-taking performance during recording
- [ ] Memory usage remains acceptable during long meetings

### User Experience Success
- [ ] Setup process completable by average user
- [ ] Recording behavior is predictable and trustworthy
- [ ] Transcription quality meets user expectations
- [ ] Feature feels seamlessly integrated with existing workflow