# Note Taker - Debugging Guide

## Log File Locations

### Worker Logs
**Location**: `~/Documents/Notes/worker-log-*.log`

Worker logs are automatically created alongside your notes. Each worker process creates a timestamped log file when it exits.

**Naming Pattern**: `worker-log-YYYY-MM-DDTHH-MM-SS-MMMZ.log`

**Example**:
```bash
ls -lt ~/Documents/Notes/worker-log-*.log | head -5
```

### Application Logs
**Development**: Console output in terminal where you ran `npm run dev`

**Production**:
- macOS Console.app → Filter by "Electron" or "note-taker"
- `~/Library/Application Support/note-taker/`

## Quick Debugging Workflow

### 1. Check Most Recent Worker Logs
```bash
# List recent worker logs
ls -lt ~/Documents/Notes/worker-log-*.log | head -5

# View most recent log
cat ~/Documents/Notes/worker-log-*.log | head -1 | xargs cat
```

### 2. Search for Errors
```bash
# Find errors in recent logs
grep -i "error\|fail\|exception" ~/Documents/Notes/worker-log-*.log
```

### 3. Check Git Stash for Debug Code
```bash
# List stash entries
git stash list

# Show stash contents
git stash show -p stash@{0}
```

## Common Issues & Solutions

### Issue 1: Worker Fails to Send "ready" Message

**Symptoms**:
```
[ERROR] [Worker] Failed to send message: {}
```

**Location**: Early in worker log, right after AudioTranscriber import

**Root Cause**: Worker process doesn't have IPC channel (`process.send` not available)

**What to Check**:
1. Is worker being spawned with `fork()` instead of `spawn()`?
2. Check `TranscriptionManager.ts` for worker spawn method
3. Look for `process.send type:` in logs to see if it's undefined

**Fix**: Ensure worker is spawned as child process with IPC:
```typescript
// Correct (has IPC):
fork(workerPath, { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

// Wrong (no IPC):
spawn('node', [workerPath])
```

### Issue 2: Empty Transcription Files

**Symptoms**:
- `.transcription` file exists but is empty or has no content
- `.snippet` file has content but `.transcription` doesn't

**What to Check in Logs**:
```bash
grep "sessionTranscript" ~/Documents/Notes/worker-log-*.log
```

**Look for**:
- `✅ AUDIOTRANSCRIBER: sessionTranscript event emitted`
- `SessionPipeline: Processed XXXXms session`
- Word count and confidence values

**Common Causes**:
1. Race condition: Worker stopped before final transcript processed
2. IPC channel closed before message sent (check for EPIPE errors)
3. Main process not listening for `sessionTranscript` event

### Issue 3: Audio Recording Not Starting

**What to Check in Logs**:
```bash
grep "Starting recording\|AUDIO-STREAM" ~/Documents/Notes/worker-log-*.log
```

**Look for**:
- `[INFO] Starting recording for session`
- `[INFO] [AUDIO-STREAM] Chunk N: XXXX bytes`

**If Missing**:
1. Check if `initialize` was called in worker
2. Check main process TranscriptionManager logs
3. Verify Vosk model downloaded: `~/note-taker/models/vosk-model-en-us-0.22/`

### Issue 4: Worker Process Crashes

**Check for**:
```bash
# Look for exit codes
grep "Process exit with code" ~/Documents/Notes/worker-log-*.log

# Look for crash indicators
grep -i "crash\|segfault\|abort" ~/Documents/Notes/worker-log-*.log
```

**Exit Code Meanings**:
- `0`: Clean exit (normal)
- `1`: Error exit
- `SIGTERM`: Killed by main process (normal shutdown)
- `SIGSEGV`: Segmentation fault (native library crash)

## Reading Worker Logs

### Log Structure

```
============================================================
Worker Log Dump: Process exit with code X
Time: YYYY-MM-DDTHH:MM:SS.SSSZ
PID: XXXXX
Entries: XXX
============================================================
[timestamp] [LEVEL] [COMPONENT] message
```

### Log Levels
- `[INFO]`: Normal operation
- `[ERROR]`: Something failed
- `[WARN]`: Non-critical issue

### Important Components
- `[Worker]`: Main worker process events
- `[AUDIO-STREAM]`: Audio chunk reception
- `[VOSK]`: Vosk transcription engine
- `[SnippetPipeline]`: 5-second snippet processing
- `[SessionPipeline]`: Final session transcript processing

### Healthy Log Pattern

```
[INFO] [Worker] Starting, about to import AudioTranscriber...
[INFO] [Worker] AudioTranscriber imported successfully
[INFO] [Worker] sendMessage called: type=ready
[INFO] [Worker] Message sent successfully: ready
[INFO] [Worker] Received IPC message: type=initialize
[INFO] Starting recording for session session_XXXXX
[INFO] [AUDIO-STREAM] Chunk 1: 8192 bytes
[INFO] [AUDIO-STREAM] Chunk 2: 8192 bytes
...
[INFO] SnippetPipeline: Emitting snippet 0: "text here"
[INFO] [Worker] Message sent successfully: snippet
...
[INFO] [Worker] Received IPC message: type=stop
[INFO] SessionPipeline: Processing final session
[INFO] Final transcription: "complete text"
[INFO] ✅ AUDIOTRANSCRIBER: sessionTranscript event emitted
```

### Error Indicators

**🚨 Critical Errors** (worker won't function):
```
[ERROR] [Worker] Failed to send message
[ERROR] [Worker] process.send is not a function
[ERROR] Failed to import AudioTranscriber
```

**⚠️ Warning Signs** (partial functionality):
```
[ERROR] [Worker] IPC disconnected (EPIPE)
[WARN] No audio data received
[ERROR] Vosk recognition failed
```

## Debugging Steps by Symptom

### No Audio Transcription at All

1. **Check worker logs exist**:
   ```bash
   ls ~/Documents/Notes/worker-log-*.log
   ```

2. **Check worker starts**:
   ```bash
   grep "Worker Starting" ~/Documents/Notes/worker-log-*.log | tail -1
   ```

3. **Check IPC works**:
   ```bash
   grep "Message sent successfully: ready" ~/Documents/Notes/worker-log-*.log | tail -1
   ```

4. **Check recording starts**:
   ```bash
   grep "Starting recording" ~/Documents/Notes/worker-log-*.log | tail -1
   ```

5. **Check audio flows**:
   ```bash
   grep "AUDIO-STREAM" ~/Documents/Notes/worker-log-*.log | tail -5
   ```

### Snippets Work but No Final Transcript

1. **Check session processing starts**:
   ```bash
   grep "SessionPipeline: Processing final session" ~/Documents/Notes/worker-log-*.log | tail -1
   ```

2. **Check session completes**:
   ```bash
   grep "SessionPipeline: Processed.*session" ~/Documents/Notes/worker-log-*.log | tail -1
   ```

3. **Check event emitted**:
   ```bash
   grep "sessionTranscript event emitted" ~/Documents/Notes/worker-log-*.log | tail -1
   ```

4. **Check for IPC errors**:
   ```bash
   grep -A5 "sessionTranscript" ~/Documents/Notes/worker-log-*.log | grep -i error
   ```

### Recording Stops Unexpectedly

1. **Check for EPIPE errors**:
   ```bash
   grep "EPIPE\|IPC disconnected" ~/Documents/Notes/worker-log-*.log
   ```

2. **Check stop commands**:
   ```bash
   grep "Received IPC message: type=stop" ~/Documents/Notes/worker-log-*.log | tail -3
   ```

3. **Check exit reason**:
   ```bash
   grep "SIGTERM\|exit" ~/Documents/Notes/worker-log-*.log | tail -1
   ```

## Development vs Production Differences

### Development (`npm run dev`)
- Worker logs appear in both terminal AND files
- Hot reload may kill workers prematurely
- `__dirname` points to source files
- More verbose error messages

### Production (packaged app)
- Worker logs ONLY in files (no terminal)
- Check ASAR unpacking for worker files
- `__dirname` points to `app.asar.unpacked/`
- May have module resolution issues

**Key Check for Production**:
```bash
# Verify worker file is unpacked
ls -la "/Applications/Note Taker.app/Contents/Resources/app.asar.unpacked/dist/main/audio-worker.mjs"

# Check model is unpacked
ls -la "/Applications/Note Taker.app/Contents/Resources/app.asar.unpacked/models/"
```

## Useful Commands

### View Recent Activity
```bash
# Last 3 worker logs
for log in $(ls -t ~/Documents/Notes/worker-log-*.log | head -3); do
  echo "=== $log ==="
  head -20 "$log"
  echo ""
done
```

### Count Errors
```bash
# Count errors by type
grep -oh "\[ERROR\].*" ~/Documents/Notes/worker-log-*.log | sort | uniq -c | sort -rn
```

### Extract Transcriptions
```bash
# See what was actually transcribed
grep "Final transcription:" ~/Documents/Notes/worker-log-*.log
```

### Check Audio Flow
```bash
# Count audio chunks received
grep -c "AUDIO-STREAM" ~/Documents/Notes/worker-log-*.log | tail -1
```

### Monitor Live (Development)
```bash
# Watch for new log files
watch -n 1 'ls -lt ~/Documents/Notes/worker-log-*.log | head -3'
```

## Integration with Main Process

The worker communicates with `TranscriptionManager.ts` via IPC:

### Message Flow
```
Main Process → Worker:
- initialize (with config)
- stop

Worker → Main Process:
- ready
- recordingStarted
- snippet (every 5 seconds)
- recordingStopped
- sessionTranscript (final)
```

### Check Main Process Side
```typescript
// In TranscriptionManager.ts, check for:
worker.on('message', (message) => {
  console.log('Main received:', message.type);
});

// Look for these in main process logs/console
```

## Emergency Debugging

### Enable Maximum Verbosity

1. **Edit audio-worker.mjs** to log everything:
   ```javascript
   function addToLog(level, ...args) {
     console.log(`[${level}]`, ...args); // Force console output
     // ... existing code
   }
   ```

2. **Run with Node inspect**:
   ```bash
   node --inspect-brk dist/main/audio-worker.mjs
   ```

3. **Attach Chrome DevTools** to worker process

### Capture Everything
```bash
# Run dev mode and capture all output
npm run dev 2>&1 | tee /tmp/note-taker-full-debug.log
```

## When to Check Logs

✅ **Always check logs**:
- After reporting a bug
- When transcription seems broken
- After updating audio-worker.mjs
- After updating ts-audio-transcriber library

✅ **Compare logs**:
- Working run vs broken run
- Development vs production
- Before update vs after update

## Quick Reference: What File Does What

| File | Purpose | Contains |
|------|---------|----------|
| `worker-log-*.log` | Worker process activity | Full worker execution trace |
| `*.snippet` | Real-time snippets | 5-second transcription chunks |
| `*.transcription` | Final transcript | Complete session transcription |
| `.recordings/*.wav` | Audio files | Raw recorded audio (debugging) |

## Additional Resources

- **Main Architecture**: See `AUDIO_PLAN.md` for system design
- **Decisions**: See `DECISIONS.md` for why things work this way
- **Tests**: `npm test` to verify core functionality
- **Library Docs**: [ts-audio-transcriber](https://github.com/kopiro/ts-audio-transcriber)
