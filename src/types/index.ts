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