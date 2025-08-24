import { contextBridge, ipcRenderer } from 'electron'

console.log('=== PRELOAD SCRIPT RUNNING ===')
console.log('Window location:', window.location.href)
console.log('Document ready state:', document.readyState)

const electronAPI = {
  // Basic functionality for now
  saveNote: (content: string, group?: string, audience?: string[]) => {
    console.log('saveNote called:', { content, group, audience })
    // For now just return a mock response
    return Promise.resolve({ id: 'test-id', success: true })
  },
  
  loadNotes: () => {
    console.log('loadNotes called')
    return Promise.resolve([])
  },
  
  updateBadge: (count: number) => {
    console.log('updateBadge called:', count)
    return Promise.resolve()
  },
  
  hideWindow: () => {
    console.log('hideWindow called')
    return Promise.resolve()
  },
  
  getGroups: () => {
    console.log('getGroups called')
    return Promise.resolve([])
  },
  
  getAudience: () => {
    console.log('getAudience called')
    return Promise.resolve([])
  },
  
  test: () => console.log('ElectronAPI test function called')
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Add debugging to the window object
;(window as any).debugInfo = {
  preloadLoaded: true,
  timestamp: new Date().toISOString(),
  electronAPIKeys: Object.keys(electronAPI)
}

console.log('=== PRELOAD SCRIPT COMPLETED ===')
console.log('ElectronAPI methods exposed:', Object.keys(electronAPI))

// Listen for DOM content loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('=== DOM CONTENT LOADED IN PRELOAD ===')
  console.log('Document body:', document.body ? 'exists' : 'null')
})

// Add to window load event
window.addEventListener('load', () => {
  console.log('=== WINDOW LOAD EVENT IN PRELOAD ===')
  console.log('React root element:', document.getElementById('root') ? 'exists' : 'missing')
})