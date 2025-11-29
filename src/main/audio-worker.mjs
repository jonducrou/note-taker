// Standalone Node.js process for audio transcription (ESM module)
// This runs outside Electron's renderer context, so ESM imports work perfectly

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import { writeFileSync } from 'fs';
import os from 'os';

// ============================================================
// Rolling in-memory log (last 100 entries, dumps on exit/crash)
// ============================================================
const LOG_BUFFER_SIZE = 100;
const logBuffer = [];
let logIndex = 0;

function addToLog(level, ...args) {
  const timestamp = new Date().toISOString();
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');

  const entry = `[${timestamp}] [${level}] ${message}`;

  // Ring buffer: overwrite oldest entry when full
  if (logBuffer.length < LOG_BUFFER_SIZE) {
    logBuffer.push(entry);
  } else {
    logBuffer[logIndex % LOG_BUFFER_SIZE] = entry;
  }
  logIndex++;
}

function getOrderedLogs() {
  if (logBuffer.length < LOG_BUFFER_SIZE) {
    return logBuffer;
  }
  // Ring buffer is full, reorder from oldest to newest
  const startIdx = logIndex % LOG_BUFFER_SIZE;
  return [
    ...logBuffer.slice(startIdx),
    ...logBuffer.slice(0, startIdx)
  ];
}

// Generate unique log filename with timestamp
const workerStartTime = new Date().toISOString().replace(/[:.]/g, '-');

function dumpLogs(reason) {
  const notesDir = join(os.homedir(), 'Documents', 'Notes');
  const logFilename = `worker-log-${workerStartTime}.log`;
  const logPath = join(notesDir, logFilename);
  const logs = getOrderedLogs();
  const header = `${'='.repeat(60)}\nWorker Log Dump: ${reason}\nTime: ${new Date().toISOString()}\nPID: ${process.pid}\nEntries: ${logs.length}\n${'='.repeat(60)}\n`;
  const content = header + logs.join('\n') + '\n';

  try {
    // Use sync write to ensure it completes before process exits
    writeFileSync(logPath, content);
  } catch (e) {
    // Last resort - write to stderr
    process.stderr.write(`Failed to write crash log: ${e.message}\n`);
    process.stderr.write(content);
  }
}

// Override console.log and console.error to capture to ring buffer
const originalLog = console.log.bind(console);
const originalError = console.error.bind(console);

console.log = (...args) => {
  addToLog('INFO', ...args);
  originalLog(...args);
};

console.error = (...args) => {
  addToLog('ERROR', ...args);
  originalError(...args);
};

// Dump logs on various exit scenarios
process.on('exit', (code) => {
  dumpLogs(`Process exit with code ${code}`);
});

process.on('uncaughtException', (error) => {
  console.error('[Worker] Uncaught exception:', error.message, error.stack);
  dumpLogs(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Worker] Unhandled rejection:', reason);
  dumpLogs(`Unhandled rejection: ${reason}`);
});

// ============================================================
// Main worker code
// ============================================================

console.log('[Worker] Starting, about to import AudioTranscriber...');
console.log('[Worker] Process:', { pid: process.pid, execPath: process.execPath, cwd: process.cwd() });

import { AudioTranscriber } from 'ts-audio-transcriber/dist/index.js';

console.log('[Worker] AudioTranscriber imported successfully');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let transcriber = null;
let currentConfig = null;
let currentSessionId = null;

// Save data to fallback file when IPC is unavailable
function saveFallbackData(type, data) {
  const notesDir = join(os.homedir(), 'Documents', 'Notes');
  const fallbackPath = join(notesDir, `worker-fallback-${Date.now()}.json`);
  const fallbackData = {
    type,
    data,
    timestamp: new Date().toISOString(),
    sessionId: currentSessionId
  };
  try {
    writeFileSync(fallbackPath, JSON.stringify(fallbackData, null, 2));
    console.log(`[Worker] Saved fallback data to: ${fallbackPath}`);
  } catch (err) {
    console.error(`[Worker] Failed to save fallback data:`, err);
  }
}

// Send message back to main process
function sendMessage(type, data) {
  console.log(`[Worker] sendMessage called: type=${type}, sessionId=${data?.sessionId || 'none'}`);
  try {
    process.send({ type, data });
    console.log(`[Worker] Message sent successfully: ${type}`);
  } catch (error) {
    // Check for EPIPE or closed IPC channel
    if (error.code === 'EPIPE' || error.code === 'ERR_IPC_CHANNEL_CLOSED' || error.message?.includes('channel closed')) {
      console.error(`[Worker] IPC disconnected (${error.code}), saving data to fallback file`);
      saveFallbackData(type, data);
      dumpLogs('IPC disconnected - EPIPE');
      process.exit(0);  // Graceful exit
    } else {
      console.error(`[Worker] Failed to send message:`, error);
    }
  }
}

// Initialize transcriber
async function initialize(config) {
  try {
    currentConfig = config;

    transcriber = new AudioTranscriber({
      enableMicrophone: config.enableMicrophone,
      enableSystemAudio: config.enableSystemAudio ?? false,  // Requires screen recording permission

      snippets: {
        enabled: true,
        intervalSeconds: 15,
        engine: 'vosk',
        confidenceThreshold: 0.3,
        engineOptions: {
          modelPath: config.modelPath
        }
      },

      sessionTranscript: {
        enabled: true,
        engine: 'vosk',
        confidenceThreshold: 0.3,
        engineOptions: {
          modelPath: config.modelPath
        }
      },

      recording: {
        enabled: true,
        outputDir: config.outputDir,
        format: 'wav',
        autoCleanup: false
      },

      reconnection: {
        maxAttempts: 5,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2
      }
    });

    // Setup event handlers
    const MIN_CONFIDENCE = 0.5;  // Skip low-confidence snippets (silence often transcribes as "the" at 30%)

    transcriber.on('snippet', (event) => {
      // Skip low-confidence snippets to reduce false positives on silence
      if (event.confidence < MIN_CONFIDENCE) {
        console.log(`[Worker] Skipping low-confidence snippet: ${(event.confidence * 100).toFixed(0)}% - "${event.text}"`);
        return;
      }
      // Add current sessionId to snippet events for routing
      sendMessage('snippet', { ...event, sessionId: currentSessionId });
    });

    transcriber.on('sessionTranscript', (event) => {
      // Add current sessionId to sessionTranscript events for routing
      sendMessage('sessionTranscript', { ...event, sessionId: currentSessionId });
    });

    transcriber.on('recordingStarted', (metadata) => {
      // Capture the sessionId for this recording session
      currentSessionId = metadata.sessionId;
      console.log('[Worker] Session started:', currentSessionId);
      sendMessage('recordingStarted', metadata);
    });

    transcriber.on('recordingStopped', (metadata) => {
      console.log('[Worker] Session stopped:', currentSessionId);
      sendMessage('recordingStopped', metadata);
      // Keep sessionId for any late-arriving events
    });

    transcriber.on('error', (error) => {
      console.error('[Worker] Transcriber error event:', error.message);
      console.error('[Worker] Error stack:', error.stack);
      sendMessage('error', { message: error.message, stack: error.stack });
    });

    // Durability event handlers (v1.3.0)
    transcriber.on('deviceDisconnected', (event) => {
      console.log('[Worker] Device disconnected:', event.reason);
      sendMessage('deviceDisconnected', event);
    });

    transcriber.on('reconnectionAttempt', (event) => {
      console.log(`[Worker] Reconnection attempt ${event.attempt}/${event.maxAttempts}`);
      sendMessage('reconnectionAttempt', event);
    });

    transcriber.on('reconnectionFailed', (event) => {
      console.error('[Worker] Reconnection failed after', event.totalAttempts, 'attempts');
      sendMessage('reconnectionFailed', event);
    });

    transcriber.on('reconnectionSuccess', (event) => {
      console.log('[Worker] Reconnection successful after', event.attemptsRequired, 'attempts');
      sendMessage('reconnectionSuccess', event);
    });

    transcriber.on('recordingRotated', (event) => {
      console.log('[Worker] Recording rotated:', event.newSessionId);
      sendMessage('recordingRotated', event);
    });

    sendMessage('initialized', { success: true });
  } catch (error) {
    sendMessage('error', { message: error.message, stack: error.stack });
  }
}

// Start transcription
async function start(noteId) {
  try {
    if (!transcriber) {
      throw new Error('Transcriber not initialized');
    }

    await transcriber.start();
    sendMessage('started', { noteId, success: true });
  } catch (error) {
    sendMessage('error', { message: error.message, stack: error.stack });
  }
}

// Stop transcription with timeout to prevent hanging on large files
const SESSION_TIMEOUT_MS = 60000;  // 60 seconds max for session processing

async function stop() {
  try {
    if (!transcriber) {
      throw new Error('Transcriber not initialized');
    }

    const stopPromise = transcriber.stop();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Session processing timeout after 60s')), SESSION_TIMEOUT_MS);
    });

    try {
      await Promise.race([stopPromise, timeoutPromise]);
      sendMessage('stopped', { success: true });
    } catch (timeoutError) {
      if (timeoutError.message.includes('timeout')) {
        console.error('[Worker] Session processing timed out, using snippets only');
        sendMessage('stopped', { success: true, timedOut: true });
      } else {
        throw timeoutError;
      }
    }
  } catch (error) {
    sendMessage('error', { message: error.message, stack: error.stack });
  }
}

// Get status
function getStatus() {
  try {
    if (!transcriber) {
      sendMessage('status', { isRunning: false });
      return;
    }

    const isRunning = transcriber.isRunning();
    sendMessage('status', { isRunning });
  } catch (error) {
    sendMessage('error', { message: error.message, stack: error.stack });
  }
}

// Handle messages from main process
process.on('message', async (msg) => {
  console.log(`[Worker] Received IPC message: type=${msg.type}, noteId=${msg.noteId || 'none'}`);
  try {
    switch (msg.type) {
      case 'initialize':
        console.log('[Worker] Calling initialize...');
        await initialize(msg.config);
        console.log('[Worker] Initialize completed');
        break;
      case 'start':
        console.log('[Worker] Calling start for noteId:', msg.noteId);
        await start(msg.noteId);
        console.log('[Worker] Start completed');
        break;
      case 'stop':
        console.log('[Worker] Calling stop...');
        await stop();
        console.log('[Worker] Stop completed');
        break;
      case 'getStatus':
        getStatus();
        break;
      default:
        console.error('Unknown message type:', msg.type);
    }
  } catch (error) {
    console.error(`[Worker] Error handling message ${msg.type}:`, error);
    sendMessage('error', { message: error.message, stack: error.stack });
  }
});

// Handle process termination
process.on('SIGTERM', async () => {
  console.log('[Worker] Received SIGTERM, shutting down...');
  if (transcriber && transcriber.isRunning()) {
    await transcriber.stop();
  }
  dumpLogs('SIGTERM received');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Worker] Received SIGINT, shutting down...');
  if (transcriber && transcriber.isRunning()) {
    await transcriber.stop();
  }
  dumpLogs('SIGINT received');
  process.exit(0);
});

// Send ready signal
sendMessage('ready', { pid: process.pid });
