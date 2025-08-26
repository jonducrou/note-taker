/**
 * Integration tests for main process functionality
 * These tests focus on testing the integration between components
 */

import { FileStorage } from '../storage/FileStorage'
import * as fs from 'fs'

// Mock electron and fs modules
jest.mock('electron', () => ({
  app: {
    getVersion: jest.fn(() => '1.0.0'),
    setBadgeCount: jest.fn(),
    whenReady: jest.fn(),
    on: jest.fn(),
    quit: jest.fn()
  },
  BrowserWindow: jest.fn(),
  Menu: {
    buildFromTemplate: jest.fn(() => ({}))
  },
  Tray: jest.fn(() => ({
    setToolTip: jest.fn(),
    on: jest.fn(),
    popUpContextMenu: jest.fn()
  })),
  ipcMain: {
    handle: jest.fn()
  },
  dialog: {
    showErrorBox: jest.fn()
  }
}))

jest.mock('fs')
jest.mock('os', () => ({
  homedir: jest.fn(() => '/mock/home')
}))

const mockFs = fs as jest.Mocked<typeof fs>

describe('Main Process Integration', () => {
  let fileStorage: FileStorage

  beforeEach(() => {
    jest.clearAllMocks()
    mockFs.existsSync = jest.fn().mockReturnValue(true)
    fileStorage = new FileStorage()
  })

  describe('FileStorage Integration with Note Processing', () => {
    it('should handle complete note lifecycle', async () => {
      // Mock file system operations
      (mockFs.promises as any) = {
        access: jest.fn().mockResolvedValue(undefined),
        mkdir: jest.fn().mockResolvedValue(undefined),
        writeFile: jest.fn().mockResolvedValue(undefined),
        readFile: jest.fn().mockResolvedValue(`---
date: '2024-08-26'
group: TestGroup
audience:
  - TestUser
created_at: '2024-08-26T14:30:00Z'
updated_at: '2024-08-26T14:30:00Z'
---

[] Task 1
[x] Completed task
Subject1 -> Subject2`),
        readdir: jest.fn().mockResolvedValue(['2024-08-26_1430.md'])
      }

      // Test note saving
      const saveResult = await fileStorage.saveNote(
        '#TestGroup @audience:TestUser\n[] Task 1\n[x] Completed task\nSubject1 -> Subject2'
      )
      expect(saveResult.success).toBe(true)
      expect(saveResult.id).toMatch(/\d{4}-\d{2}-\d{2}_\d{6}\.md/)

      // Test note loading
      const notes = await fileStorage.loadNotes()
      expect(notes).toHaveLength(1)
      expect(notes[0].metadata.group).toBe('TestGroup')
      expect(notes[0].metadata.audience).toEqual(['TestUser'])

      // Test incomplete item counting
      const incompleteCount = fileStorage.countIncompleteItems(notes[0].content)
      expect(incompleteCount).toBe(2) // 1 incomplete task + 1 incomplete connection
    })

    it('should handle note searching across multiple notes', async () => {
      const mockNotes = [
        {
          id: 'note1.md',
          filename: 'note1.md',
          metadata: {
            date: '2024-08-26',
            group: 'ProjectA',
            audience: ['Team1'],
            created_at: '2024-08-26T10:00:00Z',
            updated_at: '2024-08-26T10:00:00Z'
          },
          content: 'Meeting notes for ProjectA with Team1'
        },
        {
          id: 'note2.md',
          filename: 'note2.md', 
          metadata: {
            date: '2024-08-26',
            group: 'ProjectB',
            audience: ['Team2'],
            created_at: '2024-08-26T11:00:00Z',
            updated_at: '2024-08-26T11:00:00Z'
          },
          content: 'Different meeting about ProjectB'
        }
      ]

      // Mock loadNotes to return our test notes
      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue(mockNotes as any)

      // Test search functionality
      const searchResults = await fileStorage.searchNotes('ProjectA')
      expect(searchResults).toHaveLength(1)
      expect(searchResults[0].metadata.group).toBe('ProjectA')

      const teamSearchResults = await fileStorage.searchNotes('Team1')
      expect(teamSearchResults).toHaveLength(1)
      expect(teamSearchResults[0].metadata.audience).toEqual(['Team1'])
    })

    it('should generate proper group and audience suggestions', async () => {
      const mockNotes = [
        {
          id: 'note1.md',
          filename: 'note1.md',
          metadata: {
            date: '2024-08-26',
            group: 'ProjectA',
            audience: ['Alice', 'Bob'],
            created_at: '2024-08-26T10:00:00Z',
            updated_at: '2024-08-26T10:00:00Z'
          },
          content: 'Content 1'
        },
        {
          id: 'note2.md',
          filename: 'note2.md',
          metadata: {
            date: '2024-08-26',
            group: 'ProjectB',
            audience: ['Bob', 'Charlie'],
            created_at: '2024-08-26T11:00:00Z',
            updated_at: '2024-08-26T11:00:00Z'
          },
          content: 'Content 2'
        }
      ]

      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue(mockNotes as any)

      const groups = await fileStorage.getGroupSuggestions()
      expect(groups).toEqual(['ProjectA', 'ProjectB'])

      const audience = await fileStorage.getAudienceSuggestions()
      expect(audience).toEqual(['Alice', 'Bob', 'Charlie'])
    })
  })

  describe('Date-based Note Filtering Integration', () => {
    it('should filter notes by date periods correctly', async () => {
      const today = new Date('2024-08-26T15:00:00Z')
      const yesterday = new Date('2024-08-25T15:00:00Z')
      const lastWeek = new Date('2024-08-19T15:00:00Z')

      const mockNotes = [
        {
          id: 'today.md',
          filename: 'today.md',
          metadata: {
            date: '2024-08-26',
            created_at: today.toISOString(),
            updated_at: today.toISOString()
          },
          content: 'Today note'
        },
        {
          id: 'yesterday.md', 
          filename: 'yesterday.md',
          metadata: {
            date: '2024-08-25',
            created_at: yesterday.toISOString(),
            updated_at: yesterday.toISOString()
          },
          content: 'Yesterday note'
        },
        {
          id: 'lastweek.md',
          filename: 'lastweek.md', 
          metadata: {
            date: '2024-08-19',
            created_at: lastWeek.toISOString(),
            updated_at: lastWeek.toISOString()
          },
          content: 'Last week note'
        }
      ]

      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue(mockNotes as any)

      // Mock current date to 2024-08-26
      const dateSpy = jest.spyOn(global, 'Date').mockImplementation(() => today as any)

      const todayNotes = await fileStorage.getNotesForToday()
      expect(todayNotes).toHaveLength(1)
      expect(todayNotes[0].id).toBe('today.md')

      const yesterdayNotes = await fileStorage.getNotesForYesterday()
      expect(yesterdayNotes).toHaveLength(1)
      expect(yesterdayNotes[0].id).toBe('yesterday.md')

      const previousWeekNotes = await fileStorage.getNotesForPreviousWeek()
      expect(previousWeekNotes).toHaveLength(1)
      expect(previousWeekNotes[0].id).toBe('lastweek.md')

      dateSpy.mockRestore()
    })
  })

  describe('Note Grouping Integration', () => {
    it('should group notes by group and audience correctly', () => {
      const mockNotes = [
        {
          metadata: {
            group: 'ProjectA',
            audience: ['Team1']
          },
          content: '[] Task 1'
        },
        {
          metadata: {
            group: 'ProjectA',
            audience: ['Team1']
          },
          content: '[] Task 2'
        },
        {
          metadata: {
            group: 'ProjectB',
            audience: ['Team2']
          },
          content: '[x] Completed task'
        }
      ]

      const grouped = fileStorage.groupNotesByGroupAndAudience(mockNotes as any)
      
      // The grouping logic creates numbered entries for multiple notes
      expect(Object.keys(grouped)).toContain('ProjectA @Team1 (1)')
      expect(Object.keys(grouped)).toContain('ProjectA @Team1 (2)')
      expect(Object.keys(grouped)).toContain('ProjectB @Team2')
      expect(grouped['ProjectA @Team1 (1)']).toHaveLength(1)
      expect(grouped['ProjectA @Team1 (2)']).toHaveLength(1)
      expect(grouped['ProjectB @Team2']).toHaveLength(1)
    })

    it('should handle duplicate group names by numbering them', () => {
      const mockNotes = [
        {
          metadata: {
            group: 'ProjectA',
            audience: ['Team1']
          },
          content: '[] Task 1'
        },
        {
          metadata: {
            group: 'ProjectA', 
            audience: ['Team1']
          },
          content: '[] Task 2'
        }
      ]

      const grouped = fileStorage.groupNotesByGroupAndAudience(mockNotes as any)
      
      // Should create numbered entries for multiple notes with same group
      expect(Object.keys(grouped)).toContain('ProjectA @Team1 (1)')
      expect(Object.keys(grouped)).toContain('ProjectA @Team1 (2)')
    })
  })
})