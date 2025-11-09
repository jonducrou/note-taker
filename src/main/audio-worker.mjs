// Standalone Node.js process for audio transcription (ESM module)
// This runs outside Electron's renderer context, so ESM imports work perfectly

console.log('[Worker] Starting, about to import AudioTranscriber...');
console.log('[Worker] Process:', { pid: process.pid, execPath: process.execPath, cwd: process.cwd() });

import { AudioTranscriber } from 'ts-audio-transcriber';

console.log('[Worker] AudioTranscriber imported successfully');
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let transcriber = null;
let currentConfig = null;
let currentSessionId = null;

// Send message back to main process
function sendMessage(type, data) {
  console.log(`[Worker] sendMessage called: type=${type}, sessionId=${data?.sessionId || 'none'}`);
  try {
    process.send({ type, data });
    console.log(`[Worker] Message sent successfully: ${type}`);
  } catch (error) {
    console.error(`[Worker] Failed to send message:`, error);
  }
}

// Initialize transcriber
async function initialize(config) {
  try {
    currentConfig = config;

    transcriber = new AudioTranscriber({
      enableMicrophone: config.enableMicrophone,
      enableSystemAudio: config.enableSystemAudio,

      snippets: {
        enabled: true,
        intervalSeconds: 5,
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
      }
    });

    // Setup event handlers
    transcriber.on('snippet', (event) => {
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

// Stop transcription
async function stop() {
  try {
    if (!transcriber) {
      throw new Error('Transcriber not initialized');
    }

    await transcriber.stop();
    sendMessage('stopped', { success: true });
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
  if (transcriber && transcriber.isRunning()) {
    await transcriber.stop();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  if (transcriber && transcriber.isRunning()) {
    await transcriber.stop();
  }
  process.exit(0);
});

// Send ready signal
sendMessage('ready', { pid: process.pid });
