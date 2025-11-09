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

// Send message back to main process
function sendMessage(type, data) {
  process.send({ type, data });
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
      sendMessage('snippet', event);
    });

    transcriber.on('sessionTranscript', (event) => {
      sendMessage('sessionTranscript', event);
    });

    transcriber.on('recordingStarted', (metadata) => {
      sendMessage('recordingStarted', metadata);
    });

    transcriber.on('recordingStopped', (metadata) => {
      sendMessage('recordingStopped', metadata);
    });

    transcriber.on('error', (error) => {
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
  try {
    switch (msg.type) {
      case 'initialize':
        await initialize(msg.config);
        break;
      case 'start':
        await start(msg.noteId);
        break;
      case 'stop':
        await stop();
        break;
      case 'getStatus':
        getStatus();
        break;
      default:
        console.error('Unknown message type:', msg.type);
    }
  } catch (error) {
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
