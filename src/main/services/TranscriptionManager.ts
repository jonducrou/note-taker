import { fork, spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import type {
  TranscriptionStatus,
  TranscriptionSnippetEvent,
  TranscriptionSessionEvent,
  TranscriptionConfig
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
  private progressCallback: ((progress: number) => void) | null = null;

  // Session to file path mapping to handle async sessionTranscript events
  private sessionFilePaths = new Map<string, {
    transcriptionFilePath: string;
    snippetFilePath: string;
    noteId: string;
  }>();

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
    this.worker = spawn('node', [workerPath], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        NODE_ENV: 'production'
      },
      cwd: process.cwd(),
      shell: false
    }) as ChildProcess;

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
    this.worker.send({
      type: 'initialize',
      config: this.config
    });

    console.log('[TranscriptionManager] Initialized with worker process');
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
        console.log('[TranscriptionManager] Transcription started successfully');
        break;
      case 'stopped':
        console.log('[TranscriptionManager] Transcription stopped successfully');
        break;
      case 'initialized':
        console.log('[TranscriptionManager] Worker initialized successfully');
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

    const snippetEvent: TranscriptionSnippetEvent = {
      text: event.text,
      source: event.source,
      confidence: event.confidence,
      timestamp: event.timestamp,
      snippetIndex: event.snippetIndex,
      engine: 'vosk',
      type: 'snippet'
    };

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
  }

  async start(noteId: string): Promise<void> {
    if (!this.worker || !this.workerReady) {
      throw new Error('Worker not initialized');
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
    this.worker.send({
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
    this.worker.send({
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

  setModelProgressCallback(callback: (progress: number) => void): void {
    this.progressCallback = callback;
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
    if (this.status.isRecording) {
      await this.stop();
    }

    if (this.worker) {
      this.worker.kill('SIGTERM');
      this.worker = null;
      this.workerReady = false;
    }
  }
}
