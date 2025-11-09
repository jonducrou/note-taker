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

  export interface TranscriberOptions {
    enableMicrophone?: boolean
    enableSystemAudio?: boolean
    microphoneDeviceId?: string
    audioConfig?: AudioStreamConfig
    snippets?: SnippetPipelineConfig
    sessionTranscript?: SessionTranscriptConfig
    recording?: RecordingConfig
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
    on(event: 'recordingProgress', listener: (metadata: RecordingMetadata) => void): this
    on(event: 'started', listener: () => void): this
    on(event: 'stopped', listener: () => void): this
    on(event: 'error', listener: (error: Error) => void): this
    on(event: 'metrics', listener: (metrics: any) => void): this
  }
}
