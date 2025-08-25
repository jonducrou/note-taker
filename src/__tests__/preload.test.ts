/**
 * @jest-environment jsdom
 */

import { contextBridge, ipcRenderer } from 'electron'

// Mock electron modules
jest.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: jest.fn()
  },
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn()
  }
}))

const mockContextBridge = contextBridge as jest.Mocked<typeof contextBridge>
const mockIpcRenderer = ipcRenderer as jest.Mocked<typeof ipcRenderer>

// Import preload after mocking
require('../main/preload')

describe('Preload Script', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should expose electronAPI to main world', () => {
    expect(mockContextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'electronAPI',
      expect.any(Object)
    )
  })

  it('should create electronAPI with all expected methods', () => {
    const [[, electronAPI]] = mockContextBridge.exposeInMainWorld.mock.calls
    
    expect(electronAPI).toHaveProperty('saveNote')
    expect(electronAPI).toHaveProperty('loadNotes')
    expect(electronAPI).toHaveProperty('loadRecentNote')
    expect(electronAPI).toHaveProperty('searchNotes')
    expect(electronAPI).toHaveProperty('getGroupSuggestions')
    expect(electronAPI).toHaveProperty('getAudienceSuggestions')
    expect(electronAPI).toHaveProperty('updateBadge')
    expect(electronAPI).toHaveProperty('createNewNote')
    expect(electronAPI).toHaveProperty('loadNoteById')
    expect(electronAPI).toHaveProperty('updateExistingNote')
    expect(electronAPI).toHaveProperty('onLoadNote')
  })

  describe('IPC method calls', () => {
    let electronAPI: any

    beforeEach(() => {
      const [[, api]] = mockContextBridge.exposeInMainWorld.mock.calls
      electronAPI = api
    })

    it('should call saveNote IPC with correct parameters', async () => {
      const mockReturn = { id: 'test-id', success: true }
      mockIpcRenderer.invoke.mockResolvedValue(mockReturn)
      
      const result = await electronAPI.saveNote('content', 'group', ['audience'])
      
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
        'save-note',
        'content',
        'group',
        ['audience']
      )
      expect(result).toBe(mockReturn)
    })

    it('should call loadNotes IPC', async () => {
      const mockNotes = [{ id: 'test', content: 'test content' }]
      mockIpcRenderer.invoke.mockResolvedValue(mockNotes)
      
      const result = await electronAPI.loadNotes()
      
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('load-notes')
      expect(result).toBe(mockNotes)
    })

    it('should call loadRecentNote IPC', async () => {
      const mockNote = { id: 'recent', content: 'recent content' }
      mockIpcRenderer.invoke.mockResolvedValue(mockNote)
      
      const result = await electronAPI.loadRecentNote()
      
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('load-recent-note')
      expect(result).toBe(mockNote)
    })

    it('should call searchNotes IPC with query', async () => {
      const mockResults = [{ id: 'found', content: 'matching content' }]
      mockIpcRenderer.invoke.mockResolvedValue(mockResults)
      
      const result = await electronAPI.searchNotes('test query')
      
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('search-notes', 'test query')
      expect(result).toBe(mockResults)
    })

    it('should call getGroupSuggestions IPC', async () => {
      const mockGroups = ['Group1', 'Group2']
      mockIpcRenderer.invoke.mockResolvedValue(mockGroups)
      
      const result = await electronAPI.getGroupSuggestions()
      
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('get-group-suggestions')
      expect(result).toBe(mockGroups)
    })

    it('should call getAudienceSuggestions IPC', async () => {
      const mockAudience = ['Person1', 'Person2']
      mockIpcRenderer.invoke.mockResolvedValue(mockAudience)
      
      const result = await electronAPI.getAudienceSuggestions()
      
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('get-audience-suggestions')
      expect(result).toBe(mockAudience)
    })

    it('should call updateBadge IPC with count', async () => {
      const mockResult = { success: true }
      mockIpcRenderer.invoke.mockResolvedValue(mockResult)
      
      const result = await electronAPI.updateBadge(5)
      
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('update-badge', 5)
      expect(result).toBe(mockResult)
    })

    it('should call createNewNote IPC', async () => {
      const mockResult = { success: true }
      mockIpcRenderer.invoke.mockResolvedValue(mockResult)
      
      const result = await electronAPI.createNewNote()
      
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('create-new-note')
      expect(result).toBe(mockResult)
    })

    it('should call loadNoteById IPC with noteId', async () => {
      const mockNote = { id: 'specific', content: 'specific content' }
      mockIpcRenderer.invoke.mockResolvedValue(mockNote)
      
      const result = await electronAPI.loadNoteById('specific')
      
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('load-note-by-id', 'specific')
      expect(result).toBe(mockNote)
    })

    it('should call updateExistingNote IPC with noteId and content', async () => {
      const mockResult = { success: true }
      mockIpcRenderer.invoke.mockResolvedValue(mockResult)
      
      const result = await electronAPI.updateExistingNote('note-id', 'new content')
      
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
        'update-existing-note',
        'note-id',
        'new content'
      )
      expect(result).toBe(mockResult)
    })

    it('should set up onLoadNote listener', () => {
      const mockCallback = jest.fn()
      
      electronAPI.onLoadNote(mockCallback)
      
      expect(mockIpcRenderer.on).toHaveBeenCalledWith(
        'load-note',
        expect.any(Function)
      )
      
      // Test the callback is triggered correctly
      const [[, listener]] = mockIpcRenderer.on.mock.calls
      listener(null, 'test-note-id')
      
      expect(mockCallback).toHaveBeenCalledWith('test-note-id')
    })
  })
})