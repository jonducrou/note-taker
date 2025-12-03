import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import type {
  TranscriptionStatus,
  TranscriptionSnippetEvent,
  TranscriptionConfig,
  DeviceConnectionState
} from '../../types';
import { ModelDownloader } from './ModelDownloader';

export class TranscriptionManager {
  private worker: ChildProcess | null = null;
  private status: TranscriptionStatus = {
    isRecording: false,
    isInitializing: false,
    isProcessingTranscript: false,
    isPaused: false
  };
  private currentNoteId: string | null = null;
  private transcriptionFilePath: string | null = null;
  private snippetFilePath: string | null = null;
  private config: TranscriptionConfig;
  private workerReady = false;
  private modelReady = false;
  private downloadProgress = 0;
  private downloadError: string | null = null;
  private workerInitError: string | null = null;
  private progressCallback: ((progress: number) => void) | null = null;
  private connectionStateCallback: ((state: DeviceConnectionState, attempt?: number, maxAttempts?: number) => void) | null = null;

  // Session to file path mapping to handle async sessionTranscript events
  private sessionFilePaths = new Map<string, {
    transcriptionFilePath: string;
    snippetFilePath: string;
    noteId: string;
  }>();

  // Resolve function for graceful shutdown - called when session transcript is saved
  private transcriptCompleteResolve: (() => void) | null = null;

  // New strategy tracking
  private newestNoteId: string | null = null;
  private finishedRecordings = new Set<string>(); // Notes that have permanently stopped recording
  private graceTimer: NodeJS.Timeout | null = null;
  private readonly GRACE_PERIOD_MS = 25000; // 25 seconds for testing

  constructor() {
    // Default configuration using Vosk only
    // Model path will be set during initialization
    this.config = {
      enableMicrophone: true,
      enableSystemAudio: false, // Can enable once library supports it
      modelPath: '', // Will be set by ModelDownloader during initialize()
      outputDir: path.join(os.homedir(), 'Documents', 'Notes', '.recordings')
    };
  }

  /**
   * Check if sox (Sound eXchange) is installed on the system
   */
  static async checkSoxInstalled(): Promise<boolean> {
    try {
      await execAsync('which sox');
      return true;
    } catch {
      return false;
    }
  }

  async initialize(): Promise<void> {
    // Ensure recording directory exists
    await fs.mkdir(this.config.outputDir, { recursive: true });

    // Check if model exists, download if needed (non-blocking)
    const modelDownloader = new ModelDownloader();

    if (!await modelDownloader.isModelAvailable()) {
      console.log('[TranscriptionManager] Model not found, starting download...');
      this.downloadProgress = 0;
      this.modelReady = false;

      // Download in background
      this.downloadModelAsync(modelDownloader).catch((error) => {
        console.error('[TranscriptionManager] Model download failed:', error);
        this.downloadError = error.message || 'Download failed';
      });
    } else {
      console.log('[TranscriptionManager] Model already available');
      this.config.modelPath = modelDownloader.getModelPath();
      this.modelReady = true;
      this.downloadProgress = 100;

      // Initialize worker in background (non-blocking)
      this.initializeWorker().catch((error) => {
        console.error('[TranscriptionManager] Worker initialization failed:', error);
        this.workerReady = false;
        this.workerInitError = error.message || 'Worker initialization failed';
      });
    }
  }

  private async downloadModelAsync(modelDownloader: ModelDownloader): Promise<void> {
    // Set up progress callback with throttling to avoid spam
    let lastReportedProgress = -1;
    modelDownloader.setProgressCallback((progress) => {
      const roundedProgress = Math.floor(progress.percentage);
      if (roundedProgress !== lastReportedProgress) {
        this.downloadProgress = roundedProgress;
        console.log(`[TranscriptionManager] Download progress: ${roundedProgress}%`);

        // Call external progress callback if set
        if (this.progressCallback) {
          this.progressCallback(roundedProgress);
        }

        lastReportedProgress = roundedProgress;
      }
    });

    await modelDownloader.downloadModel();
    console.log('[TranscriptionManager] Model download complete');

    // Update config to use the model path from downloader
    this.config.modelPath = modelDownloader.getModelPath();
    this.modelReady = true;
    this.downloadProgress = 100;

    // Notify completion
    if (this.progressCallback) {
      this.progressCallback(100);
    }

    // Initialize worker now that model is ready (non-blocking)
    this.initializeWorker().catch((error) => {
      console.error('[TranscriptionManager] Worker initialization failed after download:', error);
      this.workerReady = false;
      this.workerInitError = error.message || 'Worker initialization failed';
    });
  }

  private async initializeWorker(): Promise<void> {
    // Fork the audio worker process (runs as ESM, no Electron context)
    let workerPath = path.join(__dirname, '../audio-worker.mjs');

    // If running from ASAR, use the unpacked version
    if (workerPath.includes('app.asar')) {
      workerPath = workerPath.replace('app.asar', 'app.asar.unpacked');
      console.log('[TranscriptionManager] Detected ASAR, using unpacked path');
    }

    console.log('[TranscriptionManager] Starting audio worker:', workerPath);

    // Use system node instead of Electron's node
    // 'node' will use PATH to find the system Node.js installation
    try {
      this.worker = spawn('node', [workerPath], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: {
          ...process.env,
          NODE_ENV: 'production'
        },
        cwd: process.cwd(),
        shell: false
      }) as ChildProcess;
    } catch (error: any) {
      const errorMsg = `Failed to spawn worker: ${error.message || error}`;
      console.error('[TranscriptionManager]', errorMsg);
      this.workerInitError = errorMsg;
      throw new Error(errorMsg);
    }

    // Pipe worker stdout/stderr to console and file
    const logPath = path.join(os.homedir(), 'worker-error.log');
    this.worker.stdout?.on('data', (data) => {
      const msg = data.toString();
      console.log('[Worker stdout]', msg);
      fs.appendFile(logPath, 'STDOUT: ' + msg + '\n', 'utf-8').catch(console.error);
    });

    this.worker.stderr?.on('data', (data) => {
      const msg = data.toString();
      console.error('[Worker stderr]', msg.substring(0, 200));
      fs.appendFile(logPath, 'STDERR: ' + msg + '\n', 'utf-8').catch(console.error);
    });

    // Setup message handler
    this.worker.on('message', (msg: any) => {
      this.handleWorkerMessage(msg);
    });

    this.worker.on('error', (error) => {
      console.error('[TranscriptionManager] Worker error:', error);
    });

    this.worker.on('exit', (code) => {
      console.log('[TranscriptionManager] Worker exited with code:', code);
      this.workerReady = false;
    });

    // Wait for worker to be ready
    await this.waitForWorker();

    // Send initialization config
    this.sendToWorker({
      type: 'initialize',
      config: this.config
    });

    console.log('[TranscriptionManager] Initialized with worker process');
  }

  /**
   * Safely send message to worker with error handling
   */
  private sendToWorker(message: any): void {
    try {
      this.worker?.send(message);
    } catch (error) {
      console.error('[TranscriptionManager] Failed to send to worker:', error);
      this.handleWorkerDisconnect();
    }
  }

  /**
   * Handle worker disconnection - cleanup state
   */
  private handleWorkerDisconnect(): void {
    console.log('[TranscriptionManager] Worker disconnected, cleaning up state');
    this.workerReady = false;
    this.status = {
      isRecording: false,
      isInitializing: false,
      isProcessingTranscript: false,
      isPaused: false
    };
    this.cancelGracePeriod();
  }

  private waitForWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.worker?.removeListener('message', handler);
        reject(new Error('Worker failed to initialize within 60 seconds'));
      }, 60000); // 60 second timeout (whisper-node compilation can take time)

      const handler = (msg: any) => {
        if (msg.type === 'ready') {
          clearTimeout(timeout);
          this.workerReady = true;
          this.worker?.removeListener('message', handler);
          resolve();
        }
      };

      // Also handle worker exit during initialization
      const exitHandler = (code: number) => {
        clearTimeout(timeout);
        this.worker?.removeListener('message', handler);
        reject(new Error(`Worker exited with code ${code} before becoming ready`));
      };

      this.worker?.once('exit', exitHandler);
      this.worker?.on('message', handler);
    });
  }

  private handleWorkerMessage(msg: any): void {
    console.log('[TranscriptionManager] Worker message received:', msg.type);
    switch (msg.type) {
      case 'snippet':
        this.handleSnippet(msg.data);
        break;
      case 'sessionTranscript':
        console.log('[TranscriptionManager] Session transcript received, file path:', this.transcriptionFilePath);
        this.handleSessionTranscript(msg.data);
        break;
      case 'recordingStarted':
        this.status.sessionId = msg.data.sessionId;
        this.status.startTime = msg.data.startTime;
        // Set recording state - this is the real signal that recording has begun
        this.status.isRecording = true;
        this.status.isInitializing = false;
        this.status.connectionState = 'connected';

        // Store file path mapping for this session
        if (this.transcriptionFilePath && this.snippetFilePath && this.currentNoteId) {
          this.sessionFilePaths.set(msg.data.sessionId, {
            transcriptionFilePath: this.transcriptionFilePath,
            snippetFilePath: this.snippetFilePath,
            noteId: this.currentNoteId
          });
          console.log('[TranscriptionManager] Registered session', msg.data.sessionId, 'for note:', this.currentNoteId);
        }

        console.log('[TranscriptionManager] Recording started:', msg.data.sessionId);
        if (this.connectionStateCallback) {
          this.connectionStateCallback('connected');
        }
        break;
      case 'recordingStopped':
        console.log('[TranscriptionManager] Recording stopped:', msg.data.duration);
        // Session transcript will be generated after recording stops
        this.status.isProcessingTranscript = true;
        break;
      case 'error':
        console.error('[TranscriptionManager] Worker error:', msg.data.message);
        // Clear initializing state on error
        if (this.status.isInitializing) {
          this.status.isInitializing = false;
        }
        break;
      case 'started':
        // Audio capture has actually started - update status
        this.status.isRecording = true;
        this.status.isInitializing = false;
        this.status.connectionState = 'connected';
        console.log('[TranscriptionManager] Transcription started successfully');
        if (this.connectionStateCallback) {
          this.connectionStateCallback('connected');
        }
        break;
      case 'stopped':
        console.log('[TranscriptionManager] Transcription stopped successfully');
        break;
      case 'initialized':
        console.log('[TranscriptionManager] Worker initialized successfully');
        break;

      // Durability event handlers (v1.3.0)
      case 'deviceDisconnected':
        console.log('[TranscriptionManager] Device disconnected:', msg.data.reason);
        this.status.connectionState = 'disconnected';
        if (this.connectionStateCallback) {
          this.connectionStateCallback('disconnected');
        }
        break;
      case 'reconnectionAttempt':
        console.log(`[TranscriptionManager] Reconnection attempt ${msg.data.attempt}/${msg.data.maxAttempts}`);
        this.status.connectionState = 'reconnecting';
        this.status.reconnectionAttempt = msg.data.attempt;
        this.status.maxReconnectionAttempts = msg.data.maxAttempts;
        if (this.connectionStateCallback) {
          this.connectionStateCallback('reconnecting', msg.data.attempt, msg.data.maxAttempts);
        }
        break;
      case 'reconnectionFailed':
        console.error('[TranscriptionManager] Reconnection failed after', msg.data.totalAttempts, 'attempts');
        this.status.connectionState = 'failed';
        this.status.isRecording = false;
        if (this.connectionStateCallback) {
          this.connectionStateCallback('failed');
        }
        break;
      case 'reconnectionSuccess':
        console.log('[TranscriptionManager] Reconnection successful after', msg.data.attemptsRequired, 'attempts');
        this.status.connectionState = 'connected';
        this.status.reconnectionAttempt = undefined;
        this.status.maxReconnectionAttempts = undefined;
        if (this.connectionStateCallback) {
          this.connectionStateCallback('connected');
        }
        break;
      case 'recordingRotated':
        console.log('[TranscriptionManager] Recording rotated:', msg.data.newSessionId);
        // Update session ID for file routing
        this.status.sessionId = msg.data.newSessionId;
        break;

      default:
        console.log('[TranscriptionManager] Unknown message from worker:', msg.type);
    }
  }

  private async handleSnippet(event: any): Promise<void> {
    // Use session file paths if available, otherwise fall back to current paths
    let snippetFilePath = this.snippetFilePath;

    if (event.sessionId && this.sessionFilePaths.has(event.sessionId)) {
      const sessionPaths = this.sessionFilePaths.get(event.sessionId)!;
      snippetFilePath = sessionPaths.snippetFilePath;
      console.log('[TranscriptionManager] Using session file path for snippet, note:', sessionPaths.noteId);
    }

    if (!snippetFilePath) {
      console.warn('[TranscriptionManager] No snippet file path available for snippet', event.snippetIndex);
      return;
    }

    // Type check the event data (unused but validates structure)
    const _snippetEvent: TranscriptionSnippetEvent = {
      text: event.text,
      source: event.source,
      confidence: event.confidence,
      timestamp: event.timestamp,
      snippetIndex: event.snippetIndex,
      engine: 'vosk',
      type: 'snippet'
    };
    void _snippetEvent; // Suppress unused warning

    const timestamp = new Date(event.timestamp).toISOString();
    const confidencePercent = ((event.confidence || 0) * 100).toFixed(0);
    const line = `[${timestamp}] [Snippet ${event.snippetIndex}] [${confidencePercent}%] ${event.text}\n`;

    await fs.appendFile(snippetFilePath, line, 'utf-8');
    console.log('[TranscriptionManager] Appended snippet:', event.snippetIndex, '-', event.text, `(${confidencePercent}%)`);
  }

  private async handleSessionTranscript(event: any): Promise<void> {
    // Use session file paths if available, otherwise fall back to current paths
    let transcriptionFilePath = this.transcriptionFilePath;
    let noteId = this.currentNoteId;

    if (event.sessionId && this.sessionFilePaths.has(event.sessionId)) {
      const sessionPaths = this.sessionFilePaths.get(event.sessionId)!;
      transcriptionFilePath = sessionPaths.transcriptionFilePath;
      noteId = sessionPaths.noteId;
      console.log('[TranscriptionManager] Using session file path for transcript, note:', noteId, 'session:', event.sessionId);
    }

    if (!transcriptionFilePath) {
      console.error('[TranscriptionManager] No transcription file path for session:', event.sessionId);
      return;
    }

    const header = `\n\n=== COMPLETE SESSION TRANSCRIPT ===\n`;
    const wordCount = `Word Count: ${event.wordCount || 0}\n`;
    const confidence = `Confidence: ${((event.confidence || 0) * 100).toFixed(1)}%\n`;
    const separator = `===================================\n\n`;
    const transcript = event.text || '';

    const content = header + wordCount + confidence + separator + transcript + '\n';

    await fs.appendFile(transcriptionFilePath, content, 'utf-8');
    console.log('[TranscriptionManager] Saved complete transcript for note:', noteId, '-', event.wordCount, 'words');

    // Clear processing flag when transcript is complete
    this.status.isProcessingTranscript = false;

    // Clean up session mapping after handling transcript
    if (event.sessionId && this.sessionFilePaths.has(event.sessionId)) {
      this.sessionFilePaths.delete(event.sessionId);
      console.log('[TranscriptionManager] Cleaned up session mapping for:', event.sessionId);
    }

    // Resolve graceful shutdown promise if waiting
    if (this.transcriptCompleteResolve) {
      console.log('[TranscriptionManager] Resolving transcript complete promise');
      this.transcriptCompleteResolve();
      this.transcriptCompleteResolve = null;
    }
  }

  async start(noteId: string): Promise<void> {
    if (!this.worker || !this.workerReady) {
      // Provide specific error messages based on what's wrong
      if (!this.modelReady) {
        const progress = this.downloadProgress;
        throw new Error(
          `Speech model is still downloading (${progress}%). ` +
          'Recording will be available when download completes.'
        );
      }

      if (this.downloadError) {
        throw new Error(
          `Model download failed: ${this.downloadError}. ` +
          'Please check your internet connection and restart the app.'
        );
      }

      if (this.workerInitError) {
        throw new Error(
          `Worker initialization failed: ${this.workerInitError}. ` +
          'Please check if Node.js is installed or restart the app.'
        );
      }

      throw new Error(
        'Audio system failed to initialize. ' +
        'Please restart the application or check ~/worker-error.log for details.'
      );
    }

    if (this.status.isRecording || this.status.isInitializing) {
      console.warn('[TranscriptionManager] Already recording or initializing');
      return;
    }

    // Check if sox is installed before starting
    const soxInstalled = await TranscriptionManager.checkSoxInstalled();
    if (!soxInstalled) {
      throw new Error('SOX_NOT_INSTALLED');
    }

    // Clear any previous file paths before starting new recording
    this.currentNoteId = noteId;
    this.newestNoteId = noteId;  // Set newestNoteId so grace period works for manual recordings
    this.cancelGracePeriod();    // Cancel any existing grace period
    this.transcriptionFilePath = this.getTranscriptionPath(noteId);
    this.snippetFilePath = this.getSnippetPath(noteId);

    // Create empty snippet and transcription files
    await fs.writeFile(this.snippetFilePath, '', 'utf-8');
    await fs.writeFile(this.transcriptionFilePath, '', 'utf-8');

    // Set initializing state while worker starts up audio capture
    this.status = {
      isRecording: false,
      isInitializing: true,
      isProcessingTranscript: false,
      isPaused: false,
      sessionId: undefined,
      noteId,
      startTime: Date.now(),
      duration: 0
    };

    // Send start command to worker
    this.sendToWorker({
      type: 'start',
      noteId
    });

    console.log('[TranscriptionManager] Initializing transcription for note:', noteId);
  }

  async stop(): Promise<void> {
    if (!this.worker || (!this.status.isRecording && !this.status.isInitializing)) {
      console.warn('[TranscriptionManager] Not recording');
      return;
    }

    // Send stop command to worker
    this.sendToWorker({
      type: 'stop'
    });

    const duration = this.status.startTime ? Date.now() - this.status.startTime : 0;

    this.status = {
      isRecording: false,
      isInitializing: false,
      isProcessingTranscript: this.status.isProcessingTranscript, // Keep processing state
      isPaused: false,
      duration
    };

    console.log('[TranscriptionManager] Stopped transcription, duration:', duration);

    // DON'T clear file paths here - the session transcript event will arrive after stop()
    // File paths will be cleared when starting a new recording
    // this.currentNoteId = null;
    // this.transcriptionFilePath = null;
    // this.snippetFilePath = null;
  }

  /**
   * Stop transcription and wait for the session transcript to be saved.
   * Used for graceful shutdown to ensure no data is lost.
   * @param timeoutMs Maximum time to wait for transcript (default: 30 seconds)
   */
  async stopAndWaitForTranscript(timeoutMs = 30000): Promise<void> {
    if (!this.status.isRecording && !this.status.isInitializing) {
      console.log('[TranscriptionManager] Not recording, nothing to wait for');
      return;
    }

    console.log('[TranscriptionManager] Stopping and waiting for transcript...');

    // Create promise that will be resolved when transcript is saved
    const transcriptPromise = new Promise<void>((resolve) => {
      this.transcriptCompleteResolve = resolve;
    });

    // Create timeout promise
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.warn('[TranscriptionManager] Transcript wait timeout after', timeoutMs, 'ms');
        if (this.transcriptCompleteResolve) {
          this.transcriptCompleteResolve = null;
        }
        resolve();
      }, timeoutMs);
    });

    // Stop the transcription
    await this.stop();

    // Wait for either transcript completion or timeout
    await Promise.race([transcriptPromise, timeoutPromise]);

    console.log('[TranscriptionManager] Transcript wait complete');
  }

  /**
   * Check if transcription is currently active (recording or initializing)
   */
  isActive(): boolean {
    return this.status.isRecording || this.status.isInitializing || this.status.isProcessingTranscript;
  }

  getStatus(): TranscriptionStatus {
    return { ...this.status };
  }

  getModelStatus(): { ready: boolean; progress: number; error: string | null } {
    return {
      ready: this.modelReady,
      progress: this.downloadProgress,
      error: this.downloadError
    };
  }

  /**
   * Get detailed initialization status for debugging and UI
   */
  getInitializationStatus(): {
    modelReady: boolean;
    modelError: string | null;
    workerReady: boolean;
    workerError: string | null;
    downloadProgress: number;
  } {
    return {
      modelReady: this.modelReady,
      modelError: this.downloadError,
      workerReady: this.workerReady,
      workerError: this.workerInitError,
      downloadProgress: this.downloadProgress
    };
  }

  /**
   * Restart the worker process. Use when worker has crashed or failed to initialize.
   * Returns true if restart was successful, false otherwise.
   */
  async restartWorker(): Promise<boolean> {
    console.log('[TranscriptionManager] Restarting worker...');

    // Can't restart if model isn't ready
    if (!this.modelReady) {
      console.warn('[TranscriptionManager] Cannot restart worker - model not ready');
      return false;
    }

    // Can't restart while recording
    if (this.status.isRecording || this.status.isInitializing) {
      console.warn('[TranscriptionManager] Cannot restart worker while recording');
      return false;
    }

    // Kill existing worker if any
    if (this.worker) {
      try {
        this.worker.kill();
      } catch (e) {
        // Ignore kill errors
      }
      this.worker = null;
    }

    // Clear error state
    this.workerReady = false;
    this.workerInitError = null;

    // Try to reinitialize
    try {
      await this.initializeWorker();
      console.log('[TranscriptionManager] Worker restarted successfully');
      return true;
    } catch (error: any) {
      console.error('[TranscriptionManager] Worker restart failed:', error);
      this.workerInitError = error.message || 'Restart failed';
      return false;
    }
  }

  setModelProgressCallback(callback: (progress: number) => void): void {
    this.progressCallback = callback;
  }

  setConnectionStateCallback(callback: (state: DeviceConnectionState, attempt?: number, maxAttempts?: number) => void): void {
    this.connectionStateCallback = callback;
  }

  private getTranscriptionPath(noteId: string): string {
    const notesDir = path.join(os.homedir(), 'Documents', 'Notes');
    return path.join(notesDir, `${noteId}.transcription`);
  }

  private getSnippetPath(noteId: string): string {
    const notesDir = path.join(os.homedir(), 'Documents', 'Notes');
    return path.join(notesDir, `${noteId}.snippet`);
  }

  async deleteTranscription(noteId: string): Promise<void> {
    const transcriptionPath = this.getTranscriptionPath(noteId);
    try {
      await fs.unlink(transcriptionPath);
      console.log('[TranscriptionManager] Deleted transcription:', noteId);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('[TranscriptionManager] Failed to delete transcription:', error);
        throw error;
      }
    }
  }

  async hasTranscription(noteId: string): Promise<boolean> {
    const transcriptionPath = this.getTranscriptionPath(noteId);
    try {
      await fs.access(transcriptionPath);
      return true;
    } catch {
      return false;
    }
  }

  async getTranscription(noteId: string): Promise<string | null> {
    const transcriptionPath = this.getTranscriptionPath(noteId);
    try {
      return await fs.readFile(transcriptionPath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Handle note creation - start recording for newest note
   */
  async onNoteCreated(noteId: string): Promise<void> {
    console.log('[TranscriptionManager] onNoteCreated called for:', noteId);
    console.log('[TranscriptionManager] Currently recording:', this.status.isRecording, 'for note:', this.currentNoteId);

    // If this note has already been recorded and finished, don't restart
    if (this.finishedRecordings.has(noteId)) {
      console.log('[TranscriptionManager] Note already recorded, skipping:', noteId);
      return;
    }

    // If currently recording, stop old recording first
    if (this.status.isRecording && this.currentNoteId) {
      console.log('[TranscriptionManager] Stopping recording for old note:', this.currentNoteId);
      this.finishedRecordings.add(this.currentNoteId);
      await this.stop();
      console.log('[TranscriptionManager] Old recording stopped');
      // Session file paths will ensure transcript is saved to correct note
    }

    // Cancel any grace period
    this.cancelGracePeriod();

    // Set as newest note
    this.newestNoteId = noteId;
    console.log('[TranscriptionManager] Set newest note to:', noteId);

    // Start recording for this note
    console.log('[TranscriptionManager] Starting recording for new note:', noteId);
    await this.start(noteId);
    console.log('[TranscriptionManager] Auto-started recording for new note:', noteId);
  }

  /**
   * Handle note switching - start grace period or continue recording
   */
  async onNoteSwitched(noteId: string): Promise<void> {
    console.log('[TranscriptionManager] onNoteSwitched called, new noteId:', noteId);
    console.log('[TranscriptionManager] Newest note:', this.newestNoteId, 'Currently recording:', this.status.isRecording);

    // Cancel any existing grace period
    this.cancelGracePeriod();

    // If switching to the newest note
    if (noteId === this.newestNoteId) {
      // Continue recording if it's still active
      if (this.status.isRecording) {
        console.log('[TranscriptionManager] Returned to newest note, recording continues');
      }
      return;
    }

    // If switching away from newest note and recording
    if (this.newestNoteId && this.status.isRecording) {
      console.log('[TranscriptionManager] Navigated away from newest note, starting 25s grace period');
      this.startGracePeriod();
    }
  }

  /**
   * Handle window hidden - start grace period
   */
  onWindowHidden(): void {
    console.log('[TranscriptionManager] onWindowHidden called');
    console.log('[TranscriptionManager] Recording:', this.status.isRecording, 'Newest note:', this.newestNoteId);
    if (this.status.isRecording && this.newestNoteId) {
      console.log('[TranscriptionManager] Window hidden, starting 25s grace period');
      this.startGracePeriod();
    }
  }

  /**
   * Handle window shown - cancel grace period if on newest note
   */
  onWindowShown(currentNoteId: string): void {
    console.log('[TranscriptionManager] onWindowShown called for note:', currentNoteId);
    console.log('[TranscriptionManager] Newest note:', this.newestNoteId);
    if (currentNoteId === this.newestNoteId) {
      this.cancelGracePeriod();
      console.log('[TranscriptionManager] Window shown on newest note, grace period cancelled');
    }
  }

  /**
   * Start 25-second grace period timer
   */
  private startGracePeriod(): void {
    console.log('[TranscriptionManager] startGracePeriod called');
    // Clear any existing timer
    this.cancelGracePeriod();

    // Start new timer
    console.log('[TranscriptionManager] Starting 25s grace timer');
    this.graceTimer = setTimeout(() => {
      console.log('[TranscriptionManager] ⏰ Grace period expired! Permanently stopping recording');
      this.permanentlyStopRecording();
    }, this.GRACE_PERIOD_MS);
    console.log('[TranscriptionManager] Grace timer started, will fire in', this.GRACE_PERIOD_MS, 'ms');
  }

  /**
   * Cancel grace period timer
   */
  private cancelGracePeriod(): void {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
      console.log('[TranscriptionManager] ✅ Grace period cancelled');
    }
  }

  /**
   * Permanently stop recording for current newest note
   */
  private async permanentlyStopRecording(): Promise<void> {
    if (this.newestNoteId && this.status.isRecording) {
      // Mark as finished
      this.finishedRecordings.add(this.newestNoteId);

      // Stop recording
      await this.stop();

      console.log('[TranscriptionManager] Recording permanently stopped for note:', this.newestNoteId);
    }
  }

  async cleanup(): Promise<void> {
    console.log('[TranscriptionManager] Cleanup called');

    if (this.status.isRecording) {
      console.log('[TranscriptionManager] Stopping recording before cleanup');
      await this.stop();
    }

    if (this.worker) {
      console.log('[TranscriptionManager] Killing worker process');

      // Wait for worker to exit
      const exitPromise = new Promise<void>((resolve) => {
        this.worker?.once('exit', (code) => {
          console.log('[TranscriptionManager] Worker exited with code:', code);
          resolve();
        });

        // Set a timeout in case worker doesn't exit
        setTimeout(() => {
          console.warn('[TranscriptionManager] Worker exit timeout, forcing cleanup');
          resolve();
        }, 5000);
      });

      // Send SIGTERM to worker
      this.worker.kill('SIGTERM');

      // Wait for exit
      await exitPromise;

      this.worker = null;
      this.workerReady = false;
      console.log('[TranscriptionManager] Cleanup complete');
    } else {
      console.log('[TranscriptionManager] No worker to clean up');
    }
  }
}
