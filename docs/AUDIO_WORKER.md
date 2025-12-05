# Audio Worker Architecture

The audio worker is a standalone Node.js process that handles audio transcription outside of Electron's main process. This isolation provides better stability and prevents audio processing from blocking the UI.

## Overview

```
┌─────────────────────┐         IPC          ┌─────────────────────┐
│   Main Process      │◄────────────────────►│   Audio Worker      │
│  (Electron)         │                      │   (Node.js)         │
│                     │                      │                     │
│  TranscriptionMgr   │  messages:           │  audio-worker.mjs   │
│                     │  - initialize        │                     │
│                     │  - start             │  Uses:              │
│                     │  - stop              │  - ts-audio-transcriber
│                     │  - getStatus         │  - vosk-koffi       │
│                     │                      │  - koffi (native)   │
└─────────────────────┘                      └─────────────────────┘
```

## File Locations

| File | Purpose |
|------|---------|
| `src/main/audio-worker.mjs` | Main worker process (ESM module) |
| `src/main/services/TranscriptionManager.ts` | Manages worker lifecycle |
| `src/main/services/audio-worker-utils.ts` | Testable utility functions |
| `src/__tests__/audio-worker-utils.test.ts` | Worker utility tests |

## Worker Lifecycle

### 1. Initialization

```
TranscriptionManager.initialize()
    │
    ├── Check/download Vosk model
    │
    └── Spawn worker process
            │
            ├── Worker sends 'ready' message
            │
            └── Main sends 'initialize' with config
                    │
                    └── Worker creates AudioTranscriber
                            │
                            └── Worker sends 'initialized'
```

### 2. Recording Session

```
TranscriptionManager.start(noteId)
    │
    └── Send 'start' message to worker
            │
            ├── Worker calls transcriber.start()
            │
            ├── Worker emits 'recordingStarted' with sessionId
            │
            └── Worker emits 'snippet' events (every 15s)
                    │
                    └── Filtered by MIN_CONFIDENCE (0.5)
```

### 3. Stopping

```
TranscriptionManager.stop()
    │
    └── Send 'stop' message to worker
            │
            ├── Worker calls transcriber.stop()
            │       │
            │       └── 60s timeout (SESSION_TIMEOUT_MS)
            │
            ├── Worker emits 'sessionTranscript'
            │
            └── Worker emits 'stopped'
```

## Message Protocol

### Main → Worker

| Message | Data | Description |
|---------|------|-------------|
| `initialize` | `{ config }` | Initialize transcriber with model path, output dir |
| `start` | `{ noteId }` | Begin recording for a note |
| `stop` | - | Stop recording, generate final transcript |
| `getStatus` | - | Query current recording status |

### Worker → Main

| Message | Data | Description |
|---------|------|-------------|
| `ready` | `{ pid }` | Worker process started |
| `initialized` | `{ success }` | Transcriber ready |
| `started` | `{ noteId, success }` | Recording began |
| `stopped` | `{ success, timedOut? }` | Recording ended |
| `snippet` | `{ text, confidence, sessionId }` | Interim transcription |
| `sessionTranscript` | `{ text, sessionId }` | Final transcript |
| `recordingStarted` | `{ sessionId }` | Session registered |
| `recordingStopped` | `{ sessionId }` | Session ended |
| `error` | `{ message, stack }` | Error occurred |
| `deviceDisconnected` | `{ reason }` | Audio device lost |
| `reconnectionAttempt` | `{ attempt, maxAttempts }` | Trying to reconnect |
| `reconnectionFailed` | `{ totalAttempts }` | Reconnection gave up |
| `reconnectionSuccess` | `{ attemptsRequired }` | Reconnected successfully |

## Error Handling

### Ring Buffer Logging

The worker maintains a rolling log buffer of the last 100 entries. On crash or exit, logs are dumped to `~/Documents/Notes/worker-log-*.log`.

```javascript
// Logs captured on:
process.on('exit', ...)
process.on('uncaughtException', ...)
process.on('unhandledRejection', ...)
process.on('SIGTERM', ...)
process.on('SIGINT', ...)
```

### EPIPE Handling

When the IPC channel disconnects (main process closes), the worker:
1. Detects EPIPE or ERR_IPC_CHANNEL_CLOSED error
2. Saves pending data to fallback file (`worker-fallback-*.json`)
3. Dumps logs
4. Exits gracefully

```javascript
// Fallback file structure
{
  "type": "sessionTranscript",
  "data": { "text": "...", "confidence": 0.95 },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "sessionId": "session-123"
}
```

### Snippet Filtering

Low-confidence snippets are filtered to reduce false positives:

```javascript
const MIN_CONFIDENCE = 0.5  // Skip anything below 50%

// Common false positives on silence:
// - "the" at 30% confidence
// - "um" at 40% confidence
```

### Session Timeout

The `stop()` operation has a 60-second timeout to prevent hanging on large audio files:

```javascript
const SESSION_TIMEOUT_MS = 60000

// If timeout occurs:
// - Worker returns { success: true, timedOut: true }
// - Snippets are used instead of full transcript
```

## Native Module Dependencies

The worker requires these native modules to be unpacked from ASAR:

```json
// package.json
"asarUnpack": [
  "**/node_modules/ts-audio-transcriber/**/*",
  "**/node_modules/vosk-koffi/**/*",
  "**/node_modules/koffi/**/*",           // Critical!
  "**/node_modules/screencapturekit/**/*",
  "**/node_modules/node-record-lpcm16/**/*",
  "dist/main/main/audio-worker.mjs"
]
```

**Common Issue**: If `koffi` is not in `asarUnpack`, the worker fails to initialize in production builds with "Cannot find module 'koffi'" error.

## Debugging

### Check Worker Logs

```bash
# Find recent worker logs
ls -la ~/Documents/Notes/worker-log-*.log

# View latest log
cat ~/Documents/Notes/worker-log-$(ls -t ~/Documents/Notes/worker-log-*.log | head -1)
```

### Check Fallback Files

```bash
# Find fallback data (saved when IPC disconnects)
ls -la ~/Documents/Notes/worker-fallback-*.json
```

### Test Worker Manually

```bash
# From packaged app
cd /Applications/Note\ Taker.app/Contents/Resources/app.asar.unpacked/dist/main/main/
/opt/homebrew/bin/node audio-worker.mjs

# Should output:
# [Worker] Starting, about to import AudioTranscriber...
# [Worker] AudioTranscriber imported successfully
```

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Worker not initialized" after 60s | Native module missing | Add to `asarUnpack` |
| No transcription output | Low confidence filtering | Check MIN_CONFIDENCE |
| Worker crashes silently | Error before logging setup | Check worker-log files |
| "EPIPE" errors | Main process closed IPC | Check fallback files |

## Testing

The worker utilities are tested via `audio-worker-utils.test.ts`:

```bash
# Run worker tests only
npx jest audio-worker-utils.test.ts

# Run all tests
npm test
```

### Test Coverage

| Utility | Tests |
|---------|-------|
| RingBufferLogger | 23 tests |
| dumpLogsToFile | 7 tests |
| saveFallbackData | 6 tests |
| isIPCDisconnectedError | 7 tests |
| createTranscriberOptions | 8 tests |
| Snippet filtering | 7 tests |
| stopWithTimeout | 5 tests |
| Signal handlers | 5 tests |
| Edge cases | 8 tests |
| Integration | 3 tests |

## Configuration

### Transcriber Options

```javascript
{
  enableMicrophone: true,
  enableSystemAudio: false,  // Requires screen recording permission

  snippets: {
    enabled: true,
    intervalSeconds: 15,
    engine: 'vosk',
    confidenceThreshold: 0.3
  },

  sessionTranscript: {
    enabled: true,
    engine: 'vosk',
    confidenceThreshold: 0.3
  },

  recording: {
    enabled: true,
    format: 'wav',
    autoCleanup: false
  },

  reconnection: {
    maxAttempts: 5,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2
  }
}
```

## Related Files

- `DEBUGGING.md` - General debugging guide
- `DECISIONS.md` - Architectural decisions
- `TranscriptionManager.test.ts` - Manager-level tests
