/**
 * Tests for main process IPC handlers - critical functionality
 */

import { ipcMain } from 'electron'
import { FileStorage } from '../storage/FileStorage'

// Mock FileStorage
jest.mock('../storage/FileStorage')
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>

// Mock electron modules
jest.mock('electron', () => ({
  app: {
    getVersion: jest.fn(() => '1.3.0'),
    setBadgeCount: jest.fn(),
    whenReady: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    quit: jest.fn(),
    dock: {
      setBadge: jest.fn()
    }
  },
  BrowserWindow: jest.fn(),
  Menu: {
    buildFromTemplate: jest.fn(() => ({})),
    setApplicationMenu: jest.fn()
  },
  Tray: jest.fn(() => ({
    setToolTip: jest.fn(),
    on: jest.fn(),
    setContextMenu: jest.fn(),
    popUpContextMenu: jest.fn()
  })),
  ipcMain: {
    handle: jest.fn()
  },
  nativeImage: {
    createFromDataURL: jest.fn(() => ({
      toPNG: jest.fn(() => Buffer.from('mock-png'))
    }))
  },
  dialog: {
    showErrorBox: jest.fn()
  }
}))

describe('Main Process IPC Handlers', () => {
  let mockFileStorage: jest.Mocked<FileStorage>
  let ipcHandlers: { [key: string]: Function }

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Clear the mocked constructor
    MockedFileStorage.mockClear()
    
    // Create mock instance
    mockFileStorage = {
      saveNote: jest.fn(),
      loadNotes: jest.fn(),
      loadMostRecentNote: jest.fn(),
      searchNotes: jest.fn(),
      getGroupSuggestions: jest.fn(),
      getAudienceSuggestions: jest.fn(),
      getRecentGroupSuggestions: jest.fn(),
      getRecentAudienceSuggestions: jest.fn(),
      loadNote: jest.fn(),
      getNotesForToday: jest.fn(),
      getNotesForYesterday: jest.fn(),
      getNotesForPreviousWeek: jest.fn(),
      getNotesForPriorWeek: jest.fn(),
      getOpenNotesFromLastMonth: jest.fn(),
      getNotesGroupedByAudienceFromLastMonth: jest.fn(),
      groupNotesByGroupAndAudience: jest.fn(),
      countIncompleteItems: jest.fn()
    } as any

    // Mock the constructor to return our mock instance
    MockedFileStorage.mockImplementation(() => mockFileStorage)

    // Capture IPC handlers
    ipcHandlers = {}
    ;(ipcMain.handle as jest.Mock).mockImplementation((channel: string, handler: Function) => {
      ipcHandlers[channel] = handler
    })

    // Import main.ts to register handlers
    require('../main/main')
  })

  describe('save-note handler', () => {
    it('should save note with content only', async () => {
      const mockResult = { id: 'test-note.md', success: true }
      mockFileStorage.saveNote.mockResolvedValue(mockResult)

      const handler = ipcHandlers['save-note']
      const result = await handler({}, 'Test content')

      expect(mockFileStorage.saveNote).toHaveBeenCalledWith('Test content', undefined, undefined)
      expect(result).toBe(mockResult)
    })

    it('should save note with group and audience', async () => {
      const mockResult = { id: 'test-note.md', success: true }
      mockFileStorage.saveNote.mockResolvedValue(mockResult)

      const handler = ipcHandlers['save-note']
      const result = await handler({}, 'Test content', 'TestGroup', ['Alice', 'Bob'])

      expect(mockFileStorage.saveNote).toHaveBeenCalledWith('Test content', 'TestGroup', ['Alice', 'Bob'])
      expect(result).toBe(mockResult)
    })

    it('should handle save errors', async () => {
      mockFileStorage.saveNote.mockRejectedValue(new Error('Save failed'))

      const handler = ipcHandlers['save-note']
      
      await expect(handler({}, 'Test content')).rejects.toThrow('Save failed')
    })
  })

  describe('load-notes handler', () => {
    it('should load all notes', async () => {
      const mockNotes = [
        { id: 'note1.md', content: 'Note 1', metadata: { group: 'TestGroup' } },
        { id: 'note2.md', content: 'Note 2', metadata: { group: 'TestGroup2' } }
      ]
      mockFileStorage.loadNotes.mockResolvedValue(mockNotes as any)

      const handler = ipcHandlers['load-notes']
      const result = await handler({})

      expect(mockFileStorage.loadNotes).toHaveBeenCalled()
      expect(result).toBe(mockNotes)
    })
  })

  describe('search-notes handler', () => {
    it('should search notes with query', async () => {
      const mockResults = [
        { id: 'found.md', content: 'Found content', metadata: {} }
      ]
      mockFileStorage.searchNotes.mockResolvedValue(mockResults as any)

      const handler = ipcHandlers['search-notes']
      const result = await handler({}, 'test query')

      expect(mockFileStorage.searchNotes).toHaveBeenCalledWith('test query')
      expect(result).toBe(mockResults)
    })
  })

  describe('suggestion handlers', () => {
    it('should get group suggestions', async () => {
      const mockGroups = ['GroupA', 'GroupB']
      mockFileStorage.getGroupSuggestions.mockResolvedValue(mockGroups)

      const handler = ipcHandlers['get-group-suggestions']
      const result = await handler({})

      expect(mockFileStorage.getGroupSuggestions).toHaveBeenCalled()
      expect(result).toBe(mockGroups)
    })

    it('should get audience suggestions', async () => {
      const mockAudience = ['Alice', 'Bob']
      mockFileStorage.getAudienceSuggestions.mockResolvedValue(mockAudience)

      const handler = ipcHandlers['get-audience-suggestions']
      const result = await handler({})

      expect(mockFileStorage.getAudienceSuggestions).toHaveBeenCalled()
      expect(result).toBe(mockAudience)
    })

    it('should get recent group suggestions with prefix', async () => {
      const mockGroups = ['ProjectAlpha']
      mockFileStorage.getRecentGroupSuggestions.mockResolvedValue(mockGroups)

      const handler = ipcHandlers['get-recent-group-suggestions']
      const result = await handler({}, 'Project')

      expect(mockFileStorage.getRecentGroupSuggestions).toHaveBeenCalledWith('Project')
      expect(result).toBe(mockGroups)
    })
  })

  describe('menu-structure handler', () => {
    it('should build menu structure successfully', async () => {
      const mockTodayNotes = [{ id: 'today.md', content: '[] Task', metadata: { group: 'Today' } }]
      const mockYesterdayNotes = [{ id: 'yesterday.md', content: '[x] Done', metadata: { group: 'Yesterday' } }]
      const mockPreviousWeekNotes: any[] = []
      const mockPriorWeekNotes: any[] = []
      const mockOpenNotes = [{ id: 'open.md', content: '[] Open task', metadata: { group: 'Open' } }]
      const mockAudienceGrouped = {
        'Alice': [{ id: 'alice.md', content: '[] For Alice', metadata: { audience: ['Alice'] } }]
      }

      mockFileStorage.getNotesForToday.mockResolvedValue(mockTodayNotes as any)
      mockFileStorage.getNotesForYesterday.mockResolvedValue(mockYesterdayNotes as any) 
      mockFileStorage.getNotesForPreviousWeek.mockResolvedValue(mockPreviousWeekNotes as any)
      mockFileStorage.getNotesForPriorWeek.mockResolvedValue(mockPriorWeekNotes as any)
      mockFileStorage.getOpenNotesFromLastMonth.mockResolvedValue(mockOpenNotes as any)
      mockFileStorage.getNotesGroupedByAudienceFromLastMonth.mockResolvedValue(mockAudienceGrouped as any)
      
      mockFileStorage.groupNotesByGroupAndAudience.mockImplementation((notes) => {
        const grouped: any = {}
        notes.forEach((note: any) => {
          const key = note.metadata.group || 'Ungrouped'
          grouped[key] = [note]
        })
        return grouped
      })

      mockFileStorage.countIncompleteItems.mockImplementation((content) => {
        return (content.match(/\[\s*\]/g) || []).length
      })

      const handler = ipcHandlers['get-menu-structure']
      const result = await handler({})

      expect(result).toHaveProperty('menuStructure')
      expect(Array.isArray(result.menuStructure)).toBe(true)
      
      // Should include sections for notes with incomplete items
      const menuLabels = result.menuStructure.map((item: any) => item.label)
      expect(menuLabels).toContain('Open Notes')
      expect(menuLabels).toContain('Today')
      expect(menuLabels).toContain('With...')
    })

    it('should handle menu structure errors gracefully', async () => {
      mockFileStorage.getNotesForToday.mockRejectedValue(new Error('Failed to load'))

      const handler = ipcHandlers['get-menu-structure']
      const result = await handler({})

      expect(result).toEqual({ menuStructure: [] })
    })
  })

  describe('load-note-by-id handler', () => {
    it('should load specific note by id', async () => {
      const mockNotes = [
        { id: 'target.md', content: 'Target content', metadata: {} },
        { id: 'other.md', content: 'Other content', metadata: {} }
      ]
      mockFileStorage.loadNotes.mockResolvedValue(mockNotes as any)

      const handler = ipcHandlers['load-note-by-id']
      const result = await handler({}, 'target.md')

      expect(result).toBe(mockNotes[0])
    })

    it('should return null for non-existent note', async () => {
      mockFileStorage.loadNotes.mockResolvedValue([])

      const handler = ipcHandlers['load-note-by-id'] 
      const result = await handler({}, 'nonexistent.md')

      expect(result).toBeNull()
    })

    it('should handle load errors gracefully', async () => {
      mockFileStorage.loadNotes.mockRejectedValue(new Error('Load failed'))

      const handler = ipcHandlers['load-note-by-id']
      const result = await handler({}, 'test.md')

      expect(result).toBeNull()
    })
  })

  describe('utility handlers', () => {
    it('should handle update-badge requests', async () => {
      const handler = ipcHandlers['update-badge']
      const result = await handler({}, 5)

      expect(result).toEqual({ success: true })
    })

    it('should handle create-new-note requests', async () => {
      const handler = ipcHandlers['create-new-note']
      const result = await handler({})

      expect(result).toEqual({ success: true })
    })

    it('should load recent note', async () => {
      const mockNote = { id: 'recent.md', content: 'Recent', metadata: {} }
      mockFileStorage.loadMostRecentNote.mockResolvedValue(mockNote as any)

      const handler = ipcHandlers['load-recent-note']
      const result = await handler({})

      expect(result).toBe(mockNote)
    })
  })
})