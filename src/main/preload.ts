import { contextBridge } from 'electron'

const electronAPI = {
  saveNote: (_content: string, _group?: string, _audience?: string[]) => {
    // Mock implementation - will be replaced with real IPC calls
    return Promise.resolve({ id: `note-${Date.now()}`, success: true })
  },
  
  loadNotes: () => {
    return Promise.resolve([])
  },
  
  updateBadge: (_count: number) => {
    return Promise.resolve()
  },
  
  hideWindow: () => {
    return Promise.resolve()
  },
  
  getGroups: () => {
    return Promise.resolve([])
  },
  
  getAudience: () => {
    return Promise.resolve([])
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)