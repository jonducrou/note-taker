import { fork, spawn, ChildProcess } from 'child_process';
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
    isPaused: false
  };
  private currentNoteId: string | null = null;
  private transcriptionFilePath: string | null = null;
  private snippetFilePath: string | null = null;
  private config: TranscriptionConfig;
  private workerReady = false;

  // New strategy tracking
  private newestNoteId: string | null = null;
  private finishedRecordings = new Set<string>(); // Notes that have permanently stopped recording
  private graceTimer: NodeJS.Timeout | null = null;
  private readonly GRACE_PERIOD_MS = 90000; // 90 seconds

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

  async initialize(): Promise<void> {
    // Ensure recording directory exists
    await fs.mkdir(this.config.outputDir, { recursive: true });

    // Check if model exists, download if needed
    const modelDownloader = new ModelDownloader();

    if (!await modelDownloader.isModelAvailable()) {
      console.log('[TranscriptionManager] Model not found, downloading...');
      modelDownloader.setProgressCallback((progress) => {
        console.log(`[TranscriptionManager] Download progress: ${progress.percentage}%`);
      });
      await modelDownloader.downloadModel();
      console.log('[TranscriptionManager] Model download complete');
    } else {
      console.log('[TranscriptionManager] Model already available');
    }

    // Update config to use the model path from downloader
    this.config.modelPath = modelDownloader.getModelPath();

    // Fork the audio worker process (runs as ESM, no Electron context)
    const workerPath = path.join(__dirname, '../audio-worker.mjs');

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
    return new Promise((resolve) => {
      const handler = (msg: any) => {
        if (msg.type === 'ready') {
          this.workerReady = true;
          this.worker?.removeListener('message', handler);
          resolve();
        }
      };
      this.worker?.on('message', handler);
    });
  }

  private handleWorkerMessage(msg: any): void {
    switch (msg.type) {
      case 'snippet':
        this.handleSnippet(msg.data);
        break;
      case 'sessionTranscript':
        this.handleSessionTranscript(msg.data);
        break;
      case 'recordingStarted':
        this.status.sessionId = msg.data.sessionId;
        this.status.startTime = msg.data.startTime;
        console.log('[TranscriptionManager] Recording started:', msg.data.sessionId);
        break;
      case 'recordingStopped':
        console.log('[TranscriptionManager] Recording stopped:', msg.data.duration);
        break;
      case 'error':
        console.error('[TranscriptionManager] Worker error:', msg.data.message);
        break;
      case 'started':
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
    if (!this.snippetFilePath) return;

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
    const line = `[${timestamp}] [Snippet ${event.snippetIndex}] ${event.text}\n`;

    await fs.appendFile(this.snippetFilePath, line, 'utf-8');
    console.log('[TranscriptionManager] Appended snippet:', event.snippetIndex, '-', event.text);
  }

  private async handleSessionTranscript(event: any): Promise<void> {
    if (!this.transcriptionFilePath) {
      console.error('[TranscriptionManager] No transcription file path set!');
      return;
    }

    const header = `\n\n=== COMPLETE SESSION TRANSCRIPT ===\n`;
    const wordCount = `Word Count: ${event.wordCount || 0}\n`;
    const confidence = `Confidence: ${((event.confidence || 0) * 100).toFixed(1)}%\n`;
    const separator = `===================================\n\n`;
    const transcript = event.text || '';

    const content = header + wordCount + confidence + separator + transcript + '\n';

    await fs.appendFile(this.transcriptionFilePath, content, 'utf-8');
    console.log('[TranscriptionManager] Saved complete transcript:', event.wordCount, 'words');
  }

  async start(noteId: string): Promise<void> {
    if (!this.worker || !this.workerReady) {
      throw new Error('Worker not initialized');
    }

    if (this.status.isRecording) {
      console.warn('[TranscriptionManager] Already recording');
      return;
    }

    // Clear any previous file paths before starting new recording
    this.currentNoteId = noteId;
    this.transcriptionFilePath = this.getTranscriptionPath(noteId);
    this.snippetFilePath = this.getSnippetPath(noteId);

    // Create empty snippet and transcription files
    await fs.writeFile(this.snippetFilePath, '', 'utf-8');
    await fs.writeFile(this.transcriptionFilePath, '', 'utf-8');

    // Send start command to worker
    this.worker.send({
      type: 'start',
      noteId
    });

    this.status = {
      isRecording: true,
      isPaused: false,
      sessionId: undefined,
      noteId,
      startTime: Date.now(),
      duration: 0
    };

    console.log('[TranscriptionManager] Started transcription for note:', noteId);
  }

  async stop(): Promise<void> {
    if (!this.worker || !this.status.isRecording) {
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
    // If this note has already been recorded and finished, don't restart
    if (this.finishedRecordings.has(noteId)) {
      console.log('[TranscriptionManager] Note already recorded, skipping:', noteId);
      return;
    }

    // If currently recording, stop old recording first
    if (this.status.isRecording && this.currentNoteId) {
      this.finishedRecordings.add(this.currentNoteId);
      await this.stop();
    }

    // Cancel any grace period
    this.cancelGracePeriod();

    // Set as newest note
    this.newestNoteId = noteId;

    // Start recording for this note
    await this.start(noteId);
    console.log('[TranscriptionManager] Auto-started recording for new note:', noteId);
  }

  /**
   * Handle note switching - start grace period or continue recording
   */
  async onNoteSwitched(noteId: string): Promise<void> {
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
      console.log('[TranscriptionManager] Navigated away from newest note, starting grace period');
      this.startGracePeriod();
    }
  }

  /**
   * Handle window hidden - start grace period
   */
  onWindowHidden(): void {
    if (this.status.isRecording && this.newestNoteId) {
      console.log('[TranscriptionManager] Window hidden, starting grace period');
      this.startGracePeriod();
    }
  }

  /**
   * Handle window shown - cancel grace period if on newest note
   */
  onWindowShown(currentNoteId: string): void {
    if (currentNoteId === this.newestNoteId) {
      this.cancelGracePeriod();
      console.log('[TranscriptionManager] Window shown on newest note, grace period cancelled');
    }
  }

  /**
   * Start 90-second grace period timer
   */
  private startGracePeriod(): void {
    // Clear any existing timer
    this.cancelGracePeriod();

    // Start new timer
    this.graceTimer = setTimeout(() => {
      console.log('[TranscriptionManager] Grace period expired, permanently stopping recording');
      this.permanentlyStopRecording();
    }, this.GRACE_PERIOD_MS);
  }

  /**
   * Cancel grace period timer
   */
  private cancelGracePeriod(): void {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
      console.log('[TranscriptionManager] Grace period cancelled');
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
