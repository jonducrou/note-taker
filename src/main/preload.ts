import { contextBridge, ipcRenderer } from 'electron'

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
  
  updateBadge: (count: number): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('update-badge', count)
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
  
  getPreviousNoteId: (currentNoteId: string): Promise<string | null> => {
    return ipcRenderer.invoke('get-previous-note-id', currentNoteId)
  },
  
  getNextNoteId: (currentNoteId: string): Promise<string | null> => {
    return ipcRenderer.invoke('get-next-note-id', currentNoteId)
  },
  
  setWindowTitle: (title: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('set-window-title', title)
  },
  
  // Listen for note loading messages from menu
  onLoadNote: (callback: (noteId: string) => void) => {
    ipcRenderer.on('load-note', (_event, noteId) => callback(noteId))
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)