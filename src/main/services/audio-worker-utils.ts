/**
 * Audio Worker Utilities
 *
 * Extracted testable logic from audio-worker.mjs
 * This module contains pure functions and classes that can be unit tested
 */

import { join } from 'path'
import { writeFileSync } from 'fs'
import os from 'os'

// ============================================================
// Ring Buffer Logger
// ============================================================

export interface LogEntry {
  timestamp: string
  level: string
  message: string
}

export class RingBufferLogger {
  private buffer: string[] = []
  private index = 0
  private readonly maxSize: number
  private readonly startTime: string

  constructor(maxSize = 100) {
    this.maxSize = maxSize
    this.startTime = new Date().toISOString().replace(/[:.]/g, '-')
  }

  add(level: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString()
    const message = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ')

    const entry = `[${timestamp}] [${level}] ${message}`

    // Ring buffer: overwrite oldest entry when full
    if (this.buffer.length < this.maxSize) {
      this.buffer.push(entry)
    } else {
      this.buffer[this.index % this.maxSize] = entry
    }
    this.index++
  }

  log(...args: unknown[]): void {
    this.add('INFO', ...args)
  }

  error(...args: unknown[]): void {
    this.add('ERROR', ...args)
  }

  getOrderedLogs(): string[] {
    if (this.buffer.length < this.maxSize) {
      return [...this.buffer]
    }
    // Ring buffer is full, reorder from oldest to newest
    const startIdx = this.index % this.maxSize
    return [
      ...this.buffer.slice(startIdx),
      ...this.buffer.slice(0, startIdx)
    ]
  }

  getBufferSize(): number {
    return this.buffer.length
  }

  getMaxSize(): number {
    return this.maxSize
  }

  getStartTime(): string {
    return this.startTime
  }

  clear(): void {
    this.buffer = []
    this.index = 0
  }
}

// ============================================================
// Log Dumper
// ============================================================

export interface DumpResult {
  success: boolean
  path?: string
  error?: string
}

export function dumpLogsToFile(
  logger: RingBufferLogger,
  reason: string,
  notesDir?: string
): DumpResult {
  const dir = notesDir ?? join(os.homedir(), 'Documents', 'Notes')
  const logFilename = `worker-log-${logger.getStartTime()}.log`
  const logPath = join(dir, logFilename)
  const logs = logger.getOrderedLogs()
  const header = `${'='.repeat(60)}\nWorker Log Dump: ${reason}\nTime: ${new Date().toISOString()}\nPID: ${process.pid}\nEntries: ${logs.length}\n${'='.repeat(60)}\n`
  const content = header + logs.join('\n') + '\n'

  try {
    writeFileSync(logPath, content)
    return { success: true, path: logPath }
  } catch (e) {
    const error = e as Error
    return { success: false, error: error.message }
  }
}

// ============================================================
// Message Sender with EPIPE Handling
// ============================================================

export interface SendResult {
  success: boolean
  fallbackSaved?: boolean
  fallbackPath?: string
  error?: string
}

export interface FallbackData {
  type: string
  data: unknown
  timestamp: string
  sessionId: string | null
}

export function saveFallbackData(
  type: string,
  data: unknown,
  sessionId: string | null,
  notesDir?: string
): { success: boolean; path?: string; error?: string } {
  const dir = notesDir ?? join(os.homedir(), 'Documents', 'Notes')
  const fallbackPath = join(dir, `worker-fallback-${Date.now()}.json`)
  const fallbackData: FallbackData = {
    type,
    data,
    timestamp: new Date().toISOString(),
    sessionId
  }
  try {
    writeFileSync(fallbackPath, JSON.stringify(fallbackData, null, 2))
    return { success: true, path: fallbackPath }
  } catch (err) {
    const error = err as Error
    return { success: false, error: error.message }
  }
}

export function isIPCDisconnectedError(error: Error & { code?: string }): boolean {
  return (
    error.code === 'EPIPE' ||
    error.code === 'ERR_IPC_CHANNEL_CLOSED' ||
    error.message?.includes('channel closed') ||
    error.message?.includes('IPC channel') ||
    false
  )
}

// ============================================================
// Message Types
// ============================================================

export type WorkerMessageType =
  | 'ready'
  | 'initialized'
  | 'started'
  | 'stopped'
  | 'status'
  | 'snippet'
  | 'sessionTranscript'
  | 'recordingStarted'
  | 'recordingStopped'
  | 'error'
  | 'deviceDisconnected'
  | 'reconnectionAttempt'
  | 'reconnectionFailed'
  | 'reconnectionSuccess'
  | 'recordingRotated'

export type IncomingMessageType =
  | 'initialize'
  | 'start'
  | 'stop'
  | 'getStatus'

export interface WorkerMessage {
  type: WorkerMessageType
  data?: unknown
}

export interface IncomingMessage {
  type: IncomingMessageType
  config?: TranscriberConfig
  noteId?: string
}

// ============================================================
// Transcriber Configuration
// ============================================================

export interface TranscriberConfig {
  enableMicrophone: boolean
  enableSystemAudio?: boolean
  modelPath: string
  outputDir: string
}

export interface TranscriberOptions {
  enableMicrophone: boolean
  enableSystemAudio: boolean
  snippets: {
    enabled: boolean
    intervalSeconds: number
    engine: string
    confidenceThreshold: number
    engineOptions: {
      modelPath: string
    }
  }
  sessionTranscript: {
    enabled: boolean
    engine: string
    confidenceThreshold: number
    engineOptions: {
      modelPath: string
    }
  }
  recording: {
    enabled: boolean
    outputDir: string
    format: string
    autoCleanup: boolean
  }
  reconnection: {
    maxAttempts: number
    baseDelay: number
    maxDelay: number
    backoffMultiplier: number
  }
}

export function createTranscriberOptions(config: TranscriberConfig): TranscriberOptions {
  return {
    enableMicrophone: config.enableMicrophone,
    enableSystemAudio: config.enableSystemAudio ?? false,

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
  }
}

// ============================================================
// Snippet Filtering
// ============================================================

export interface SnippetEvent {
  text: string
  confidence: number
  sessionId?: string
}

export const MIN_CONFIDENCE = 0.5

export function shouldSkipSnippet(event: SnippetEvent): boolean {
  return event.confidence < MIN_CONFIDENCE
}

export function filterSnippet(event: SnippetEvent): { skip: boolean; reason?: string } {
  if (event.confidence < MIN_CONFIDENCE) {
    return {
      skip: true,
      reason: `Low confidence: ${(event.confidence * 100).toFixed(0)}% - "${event.text}"`
    }
  }
  return { skip: false }
}

// ============================================================
// Stop Timeout Handler
// ============================================================

/**
 * SESSION_TIMEOUT_MS: Maximum time to wait for transcription processing when stop() is called.
 * This is NOT the same as the grace period (25s) in TranscriptionManager.
 *
 * - Grace Period (25s): How long to wait before stopping recording when user navigates away
 * - Session Timeout (60s): How long to wait for Vosk to finish processing audio after stop is requested
 *
 * The session timeout is longer because large audio files can take time to process.
 * If this timeout is exceeded, we fall back to using accumulated snippets instead of full transcript.
 */
export const SESSION_TIMEOUT_MS = 60000

export async function stopWithTimeout<T>(
  stopPromise: Promise<T>,
  timeoutMs = SESSION_TIMEOUT_MS
): Promise<{ success: boolean; timedOut: boolean; result?: T; error?: Error }> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Session processing timeout after ${timeoutMs / 1000}s`)), timeoutMs)
  })

  try {
    const result = await Promise.race([stopPromise, timeoutPromise])
    return { success: true, timedOut: false, result }
  } catch (error) {
    const err = error as Error
    if (err.message.includes('timeout')) {
      return { success: true, timedOut: true }
    }
    return { success: false, timedOut: false, error: err }
  }
}

// ============================================================
// Process Signal Handler
// ============================================================

export type SignalHandler = () => Promise<void>

export function createSignalHandlers(
  onShutdown: SignalHandler
): { sigterm: () => void; sigint: () => void } {
  return {
    sigterm: () => {
      onShutdown().then(() => process.exit(0)).catch(() => process.exit(1))
    },
    sigint: () => {
      onShutdown().then(() => process.exit(0)).catch(() => process.exit(1))
    }
  }
}
