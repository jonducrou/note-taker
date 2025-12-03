import { contextBridge, ipcRenderer } from 'electron'
import { RelatedAction } from '../types'

export interface Note {
  id: string
  filename: string
  metadata: {
    date: string
    group?: string
    audience?: string[]
    created_at: string
    updated_at: string
  }
  content: string
}

const electronAPI = {
  saveNote: (content: string, group?: string, audience?: string[]): Promise<{ id: string; success: boolean }> => {
    return ipcRenderer.invoke('save-note', content, group, audience)
  },
  
  loadNotes: (): Promise<Note[]> => {
    return ipcRenderer.invoke('load-notes')
  },
  
  loadRecentNote: (): Promise<Note | null> => {
    return ipcRenderer.invoke('load-recent-note')
  },
  
  searchNotes: (query: string): Promise<Note[]> => {
    return ipcRenderer.invoke('search-notes', query)
  },
  
  getGroupSuggestions: (): Promise<string[]> => {
    return ipcRenderer.invoke('get-group-suggestions')
  },
  
  getAudienceSuggestions: (): Promise<string[]> => {
    return ipcRenderer.invoke('get-audience-suggestions')
  },
  
  getRecentGroupSuggestions: (prefix?: string): Promise<string[]> => {
    return ipcRenderer.invoke('get-recent-group-suggestions', prefix)
  },
  
  getRecentAudienceSuggestions: (prefix?: string): Promise<string[]> => {
    return ipcRenderer.invoke('get-recent-audience-suggestions', prefix)
  },

  getRelatedActions: (audience: string[], days?: number): Promise<RelatedAction[]> => {
    return ipcRenderer.invoke('get-related-actions', audience, days)
  },


  createNewNote: (): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('create-new-note')
  },
  
  loadNoteById: (noteId: string): Promise<Note | null> => {
    return ipcRenderer.invoke('load-note-by-id', noteId)
  },
  
  updateExistingNote: (noteId: string, content: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('update-existing-note', noteId, content)
  },
  
  getPreviousNoteId: (currentNoteId: string, skipNotesWithoutOpenActions?: boolean): Promise<string | null> => {
    return ipcRenderer.invoke('get-previous-note-id', currentNoteId, skipNotesWithoutOpenActions)
  },
  
  getNextNoteId: (currentNoteId: string, skipNotesWithoutOpenActions?: boolean): Promise<string | null> => {
    return ipcRenderer.invoke('get-next-note-id', currentNoteId, skipNotesWithoutOpenActions)
  },
  
  setWindowTitle: (title: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('set-window-title', title)
  },

  deleteNote: (noteId: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('delete-note', noteId)
  },

  // Listen for note loading messages from menu
  onLoadNote: (callback: (noteId: string) => void) => {
    ipcRenderer.on('load-note', (_event, noteId) => callback(noteId))
    return () => ipcRenderer.removeAllListeners('load-note')
  },

  // Listen for delete current note messages from menu
  onDeleteCurrentNote: (callback: () => void) => {
    ipcRenderer.on('delete-current-note', () => callback())
    return () => ipcRenderer.removeAllListeners('delete-current-note')
  },

  // Transcription API
  transcriptionStart: (noteId: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('transcription-start', noteId)
  },

  transcriptionStop: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('transcription-stop')
  },

  transcriptionGetStatus: (): Promise<{
    isRecording: boolean
    isPaused: boolean
    sessionId?: string
    noteId?: string
    startTime?: number
    duration?: number
    connectionState?: 'connected' | 'disconnected' | 'reconnecting' | 'failed'
    reconnectionAttempt?: number
    maxReconnectionAttempts?: number
  }> => {
    return ipcRenderer.invoke('transcription-get-status')
  },

  transcriptionHasTranscription: (noteId: string): Promise<boolean> => {
    return ipcRenderer.invoke('transcription-has-transcription', noteId)
  },

  transcriptionGetContent: (noteId: string): Promise<string | null> => {
    return ipcRenderer.invoke('transcription-get-content', noteId)
  },

  transcriptionGetModelStatus: (): Promise<{
    ready: boolean
    progress: number
    error: string | null
  }> => {
    return ipcRenderer.invoke('transcription-get-model-status')
  },

  transcriptionGetInitStatus: (): Promise<{
    modelReady: boolean
    modelError: string | null
    workerReady: boolean
    workerError: string | null
    downloadProgress: number
  }> => {
    return ipcRenderer.invoke('transcription-get-init-status')
  },

  transcriptionRestartWorker: (): Promise<boolean> => {
    return ipcRenderer.invoke('transcription-restart-worker')
  },

  onModelDownloadProgress: (callback: (progress: number) => void) => {
    ipcRenderer.on('model-download-progress', (_event, progress) => callback(progress))
    return () => ipcRenderer.removeAllListeners('model-download-progress')
  },

  onTranscriptionConnectionState: (callback: (data: {
    state: 'connected' | 'disconnected' | 'reconnecting' | 'failed'
    attempt?: number
    maxAttempts?: number
  }) => void) => {
    ipcRenderer.on('transcription-connection-state', (_event, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('transcription-connection-state')
  },

  // Listen for finishing modal display messages
  onShowFinishingModal: (callback: (show: boolean) => void) => {
    ipcRenderer.on('show-finishing-modal', (_event, show) => callback(show))
    return () => ipcRenderer.removeAllListeners('show-finishing-modal')
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)