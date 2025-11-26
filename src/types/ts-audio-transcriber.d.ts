declare module 'ts-audio-transcriber' {
  export interface AudioStreamConfig {
    sampleRate?: number
    channels?: number
    bitDepth?: number
    bufferSize?: number
  }

  export interface SnippetPipelineConfig {
    enabled: boolean
    intervalSeconds?: number
    engine: 'vosk' | 'whisper'
    confidenceThreshold?: number
    engineOptions?: Record<string, any>
  }

  export interface SessionTranscriptConfig {
    enabled: boolean
    engine: 'vosk' | 'whisper'
    confidenceThreshold?: number
    engineOptions?: Record<string, any>
  }

  export interface RecordingConfig {
    enabled: boolean
    outputDir: string
    format: 'wav'
    autoCleanup?: boolean
    maxDuration?: number
  }

  export interface ReconnectionConfig {
    maxAttempts?: number
    baseDelay?: number
    maxDelay?: number
    backoffMultiplier?: number
  }

  export type DeviceConnectionState = 'connected' | 'disconnected' | 'reconnecting' | 'failed'

  export type DisconnectReason = 'process_exit' | 'error' | 'device_removed' | 'permission_revoked' | 'unknown'

  export interface TranscriberOptions {
    enableMicrophone?: boolean
    enableSystemAudio?: boolean
    microphoneDeviceId?: string
    audioConfig?: AudioStreamConfig
    snippets?: SnippetPipelineConfig
    sessionTranscript?: SessionTranscriptConfig
    recording?: RecordingConfig
    reconnection?: ReconnectionConfig
  }

  export interface SnippetEvent {
    text: string
    source: 'microphone' | 'system-audio'
    confidence: number
    timestamp: number
    snippetIndex: number
    engine: 'vosk' | 'whisper'
    type: 'snippet'
  }

  export interface SessionTranscriptEvent {
    text: string
    source: 'microphone' | 'system-audio'
    confidence: number
    timestamp: number
    sessionId: string
    isComplete: boolean
    engine: 'vosk' | 'whisper'
    type: 'session'
    metadata: {
      duration: number
      wordCount: number
      processingTime: number
    }
  }

  export interface RecordingMetadata {
    sessionId: string
    audioFilePath: string
    duration: number
    fileSize: number
    sampleRate: number
    channels: number
    startTime: number
    endTime?: number
  }

  export interface RecordingProgress {
    sessionId: string
    duration: number
    fileSize: number
  }

  export interface DeviceDisconnectedEvent {
    source: 'microphone' | 'system-audio'
    reason: DisconnectReason
    error?: Error
    timestamp: number
    willAttemptReconnection: boolean
    sessionId?: string
    durationAtDisconnect?: number
  }

  export interface ReconnectionAttemptEvent {
    attempt: number
    maxAttempts: number
    delay: number
    timestamp: number
  }

  export interface ReconnectionFailedEvent {
    totalAttempts: number
    elapsedTime: number
    lastError?: Error
    recommendation: 'manual_restart' | 'check_device' | 'check_permissions'
  }

  export interface ReconnectionSuccessEvent {
    attemptsRequired: number
    totalReconnectionTime: number
    timestamp: number
  }

  export interface RecordingRotationResult {
    previousSessionId: string
    newSessionId: string
    completedFilePath: string
    timestamp: number
  }

  export class AudioTranscriber {
    constructor(options?: TranscriberOptions)

    start(): Promise<void>
    stop(): Promise<void>
    getAvailableDevices(): Promise<any[]>
    getMetrics(): any
    isRunning(): boolean
    updateOptions(options: Partial<TranscriberOptions>): void
    getSessionId(): string | null
    getRecordingPath(): string | null

    on(event: 'snippet', listener: (event: SnippetEvent) => void): this
    on(event: 'sessionTranscript', listener: (event: SessionTranscriptEvent) => void): this
    on(event: 'recordingStarted', listener: (metadata: RecordingMetadata) => void): this
    on(event: 'recordingStopped', listener: (metadata: RecordingMetadata) => void): this
    on(event: 'recordingProgress', listener: (progress: RecordingProgress) => void): this
    on(event: 'started', listener: () => void): this
    on(event: 'stopped', listener: () => void): this
    on(event: 'error', listener: (error: Error) => void): this
    on(event: 'metrics', listener: (metrics: any) => void): this
    on(event: 'deviceDisconnected', listener: (event: DeviceDisconnectedEvent) => void): this
    on(event: 'reconnectionAttempt', listener: (event: ReconnectionAttemptEvent) => void): this
    on(event: 'reconnectionFailed', listener: (event: ReconnectionFailedEvent) => void): this
    on(event: 'reconnectionSuccess', listener: (event: ReconnectionSuccessEvent) => void): this
    on(event: 'recordingRotated', listener: (event: RecordingRotationResult) => void): this
  }
}
