export interface Note {
  id: string
  content: string
  group?: string
  audience: string[]
  createdAt: Date
  updatedAt: Date
  filePath: string
}

export interface ActionItem {
  text: string
  completed: boolean
  noteId: string
  line: number
}

export interface Connection {
  from: string
  to: string
  completed: boolean
  noteId: string
  line: number
  direction: 'forward' | 'backward'
}

export interface NoteMetadata {
  group?: string
  audience: string[]
  hasIncompleteActions: boolean
  hasIncompleteConnections: boolean
  incompleteCount: number
}

// Transcription types
export interface TranscriptionStatus {
  isRecording: boolean
  isInitializing: boolean
  isProcessingTranscript: boolean
  isPaused: boolean
  sessionId?: string
  noteId?: string
  startTime?: number
  duration?: number
}

export interface TranscriptionSnippetEvent {
  text: string
  source: 'microphone' | 'system-audio'
  confidence: number
  timestamp: number
  snippetIndex: number
  engine: 'vosk'
  type: 'snippet'
}

export interface TranscriptionSessionEvent {
  text: string
  source: 'microphone' | 'system-audio'
  confidence: number
  timestamp: number
  sessionId: string
  isComplete: boolean
  engine: 'vosk'
  type: 'session'
  metadata: {
    duration: number
    wordCount: number
    processingTime: number
  }
}

export interface TranscriptionPermissions {
  microphone: 'granted' | 'denied' | 'not-determined'
  screenRecording: 'granted' | 'denied' | 'not-determined'
}

export interface TranscriptionConfig {
  enableMicrophone: boolean
  enableSystemAudio: boolean
  modelPath: string
  outputDir: string
}

// Related action aggregation types
export interface Action {
  text: string
  completed: boolean
  lineNumber: number
}

export interface RelatedConnection {
  subject: string
  direction: 'left' | 'right'
  completed: boolean
  lineNumber: number
}

export interface RelatedAction {
  noteId: string
  noteTitle: string
  noteDate: string
  actions: Action[]
  connections: RelatedConnection[]
}