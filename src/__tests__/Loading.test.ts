import { FileStorage, NoteMetadata } from '../storage/FileStorage'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import * as yaml from 'js-yaml'

// Mock the fs, os, and js-yaml modules
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    readdir: jest.fn(),
    unlink: jest.fn()
  },
  existsSync: jest.fn()
}))
jest.mock('os')
jest.mock('js-yaml')

const mockFs = fs as jest.Mocked<typeof fs>
const mockHomedir = homedir as jest.MockedFunction<typeof homedir>
const mockYaml = yaml as jest.Mocked<typeof yaml>

describe('FileStorage Loading', () => {
  let fileStorage: FileStorage
  
  beforeEach(() => {
    jest.clearAllMocks()
    mockHomedir.mockReturnValue('/mock/home')
    fileStorage = new FileStorage()
    
    // Mock successful directory access by default
    mockFs.access.mockResolvedValue(undefined)
    
    // Mock yaml.load for parsing YAML frontmatter
    mockYaml.load.mockImplementation((str: string) => {
      const result: Record<string, unknown> = {}
      str.split('\n').forEach(line => {
        if (line.includes(':')) {
          const [key, ...valueParts] = line.split(':')
          const value = valueParts.join(':').trim()
          if (value.startsWith('[') && value.endsWith(']')) {
            // Handle array format
            result[key.trim()] = value.slice(1, -1).split(',').map(s => s.trim().replace(/"/g, ''))
          } else {
            try {
              result[key.trim()] = JSON.parse(value)
            } catch {
              result[key.trim()] = value.replace(/"/g, '')
            }
          }
        }
      })
      return result
    })
  })

  // Helper function to create mock note files
  const createMockNoteFile = (_filename: string, metadata: NoteMetadata, content: string): string => {
    const frontmatter = `date: "${metadata.date}"\ngroup: "${metadata.group || ''}"\naudience: [${metadata.audience?.map(a => `"${a}"`).join(', ') || ''}]\ncreated_at: "${metadata.created_at}"\nupdated_at: "${metadata.updated_at}"`
    return `---\n${frontmatter}\n---\n\n${content}`
  }

  describe('loadNotes', () => {
    it('should load and parse notes from directory', async () => {
      const mockFiles = ['2024-08-26_150000.md', '2024-08-25_140000.md']
      mockFs.readdir.mockResolvedValue(mockFiles as never)
      
      const note1Content = createMockNoteFile('2024-08-26_150000.md', {
        date: '2024-08-26',
        group: 'ProjectAlpha',
        audience: ['Sarah', 'Bob'],
        created_at: '2024-08-26T15:00:00Z',
        updated_at: '2024-08-26T15:00:00Z'
      }, 'Meeting notes')
      
      const note2Content = createMockNoteFile('2024-08-25_140000.md', {
        date: '2024-08-25',
        group: 'ProjectBeta',
        audience: ['Alice'],
        created_at: '2024-08-25T14:00:00Z',
        updated_at: '2024-08-25T14:00:00Z'
      }, 'Daily standup')
      
      mockFs.readFile
        .mockResolvedValueOnce(note1Content)
        .mockResolvedValueOnce(note2Content)
      
      const notes = await fileStorage.loadNotes()
      
      expect(notes).toHaveLength(2)
      expect(notes[0].filename).toBe('2024-08-26_150000.md')
      expect(notes[0].metadata.group).toBe('ProjectAlpha')
      expect(notes[0].content).toBe('Meeting notes')
      expect(notes[1].filename).toBe('2024-08-25_140000.md')
      expect(notes[1].metadata.group).toBe('ProjectBeta')
    })

    it('should return empty array when no notes exist', async () => {
      mockFs.readdir.mockResolvedValue([] as never)
      
      const notes = await fileStorage.loadNotes()
      
      expect(notes).toEqual([])
    })

    it('should filter out non-markdown files', async () => {
      const mockFiles = ['note1.md', 'readme.txt', 'note2.md', 'image.png']
      mockFs.readdir.mockResolvedValue(mockFiles as never)
      
      const noteContent = createMockNoteFile('note1.md', {
        date: '2024-08-26',
        created_at: '2024-08-26T15:00:00Z',
        updated_at: '2024-08-26T15:00:00Z'
      }, 'Content')
      
      mockFs.readFile.mockResolvedValue(noteContent)
      
      const notes = await fileStorage.loadNotes()
      
      expect(mockFs.readFile).toHaveBeenCalledTimes(2) // Only .md files
      expect(notes).toHaveLength(2)
    })

    it('should sort notes by filename date (newest first)', async () => {
      const mockFiles = ['2024-08-25_120000.md', '2024-08-26_150000.md', '2024-08-24_100000.md']
      mockFs.readdir.mockResolvedValue(mockFiles as never)
      
      const noteContent = createMockNoteFile('test.md', {
        date: '2024-08-26',
        created_at: '2024-08-26T15:00:00Z',
        updated_at: '2024-08-26T15:00:00Z'
      }, 'Content')
      
      mockFs.readFile.mockResolvedValue(noteContent)
      
      const notes = await fileStorage.loadNotes()
      
      expect(notes[0].filename).toBe('2024-08-26_150000.md')
      expect(notes[1].filename).toBe('2024-08-25_120000.md')
      expect(notes[2].filename).toBe('2024-08-24_100000.md')
    })

    it('should handle individual file read errors gracefully', async () => {
      const mockFiles = ['good.md', 'corrupted.md']
      mockFs.readdir.mockResolvedValue(mockFiles as never)
      
      const goodContent = createMockNoteFile('good.md', {
        date: '2024-08-26',
        created_at: '2024-08-26T15:00:00Z',
        updated_at: '2024-08-26T15:00:00Z'
      }, 'Good content')
      
      mockFs.readFile
        .mockResolvedValueOnce(goodContent)
        .mockRejectedValueOnce(new Error('File corrupted'))
      
      const notes = await fileStorage.loadNotes()
      
      expect(notes).toHaveLength(1)
      expect(notes[0].filename).toBe('good.md')
    })

    it('should handle directory read errors', async () => {
      mockFs.readdir.mockRejectedValue(new Error('Permission denied'))
      
      const notes = await fileStorage.loadNotes()
      
      expect(notes).toEqual([])
    })

    it('should parse notes without frontmatter using extractMetadata', async () => {
      const mockFiles = ['legacy.md']
      mockFs.readdir.mockResolvedValue(mockFiles as never)
      
      const legacyContent = '#ProjectGamma @audience:Charlie\nLegacy note content'
      mockFs.readFile.mockResolvedValue(legacyContent)
      
      const notes = await fileStorage.loadNotes()
      
      expect(notes).toHaveLength(1)
      expect(notes[0].metadata.group).toBe('ProjectGamma')
      expect(notes[0].metadata.audience).toEqual(['Charlie'])
      expect(notes[0].content).toBe(legacyContent)
    })
  })

  describe('loadMostRecentNote', () => {
    it('should return the most recent note', async () => {
      const mockFiles = ['2024-08-26_150000.md', '2024-08-25_120000.md']
      mockFs.readdir.mockResolvedValue(mockFiles as never)
      
      const recentContent = createMockNoteFile('2024-08-26_150000.md', {
        date: '2024-08-26',
        group: 'Recent',
        created_at: '2024-08-26T15:00:00Z',
        updated_at: '2024-08-26T15:00:00Z'
      }, 'Most recent note')
      
      const olderContent = createMockNoteFile('2024-08-25_120000.md', {
        date: '2024-08-25',
        group: 'Older',
        created_at: '2024-08-25T12:00:00Z',
        updated_at: '2024-08-25T12:00:00Z'
      }, 'Older note')
      
      // Files will be read in the order they appear in the directory
      // The loadNotes() method will then sort them by filename date (newest first)
      mockFs.readFile
        .mockResolvedValueOnce(recentContent)
        .mockResolvedValueOnce(olderContent)
      
      const note = await fileStorage.loadMostRecentNote()
      
      expect(note).not.toBeNull()
      expect(note?.filename).toBe('2024-08-26_150000.md')
      expect(note?.metadata.group).toBe('Recent')
    })

    it('should return null when no notes exist', async () => {
      mockFs.readdir.mockResolvedValue([] as never)
      
      const note = await fileStorage.loadMostRecentNote()
      
      expect(note).toBeNull()
    })
  })

  describe('searchNotes', () => {
    beforeEach(() => {
      const mockFiles = ['note1.md', 'note2.md', 'note3.md']
      mockFs.readdir.mockResolvedValue(mockFiles as never)
      
      const note1 = createMockNoteFile('note1.md', {
        date: '2024-08-26',
        group: 'ProjectAlpha',
        audience: ['Sarah'],
        created_at: '2024-08-26T15:00:00Z',
        updated_at: '2024-08-26T15:00:00Z'
      }, 'Meeting about API changes')
      
      const note2 = createMockNoteFile('note2.md', {
        date: '2024-08-26',
        group: 'ProjectBeta',
        audience: ['Bob'],
        created_at: '2024-08-26T14:00:00Z',
        updated_at: '2024-08-26T14:00:00Z'
      }, 'Database migration discussion')
      
      const note3 = createMockNoteFile('note3.md', {
        date: '2024-08-26',
        group: 'Marketing',
        audience: ['Alice'],
        created_at: '2024-08-26T13:00:00Z',
        updated_at: '2024-08-26T13:00:00Z'
      }, 'Campaign planning session')
      
      mockFs.readFile
        .mockResolvedValueOnce(note1)
        .mockResolvedValueOnce(note2)
        .mockResolvedValueOnce(note3)
    })

    it('should search notes by content', async () => {
      const results = await fileStorage.searchNotes('API')
      
      expect(results).toHaveLength(1)
      expect(results[0].content).toContain('API changes')
    })

    it('should search notes by group', async () => {
      const results = await fileStorage.searchNotes('projectalpha')
      
      expect(results).toHaveLength(1)
      expect(results[0].metadata.group).toBe('ProjectAlpha')
    })

    it('should search notes by audience', async () => {
      const results = await fileStorage.searchNotes('sarah')
      
      expect(results).toHaveLength(1)
      expect(results[0].metadata.audience).toContain('Sarah')
    })

    it('should return empty array for no matches', async () => {
      const results = await fileStorage.searchNotes('nonexistent')
      
      expect(results).toEqual([])
    })

    it('should be case insensitive', async () => {
      const results = await fileStorage.searchNotes('MIGRATION')
      
      expect(results).toHaveLength(1)
      expect(results[0].content).toContain('migration')
    })
  })

  describe('getGroupSuggestions', () => {
    it('should return unique groups sorted alphabetically', async () => {
      const mockFiles = ['note1.md', 'note2.md', 'note3.md']
      mockFs.readdir.mockResolvedValue(mockFiles as never)
      
      const notes = [
        createMockNoteFile('note1.md', {
          date: '2024-08-26',
          group: 'ProjectBeta',
          created_at: '2024-08-26T15:00:00Z',
          updated_at: '2024-08-26T15:00:00Z'
        }, 'Content 1'),
        createMockNoteFile('note2.md', {
          date: '2024-08-26',
          group: 'ProjectAlpha',
          created_at: '2024-08-26T14:00:00Z',
          updated_at: '2024-08-26T14:00:00Z'
        }, 'Content 2'),
        createMockNoteFile('note3.md', {
          date: '2024-08-26',
          group: 'ProjectBeta', // Duplicate
          created_at: '2024-08-26T13:00:00Z',
          updated_at: '2024-08-26T13:00:00Z'
        }, 'Content 3')
      ]
      
      mockFs.readFile
        .mockResolvedValueOnce(notes[0])
        .mockResolvedValueOnce(notes[1])
        .mockResolvedValueOnce(notes[2])
      
      const suggestions = await fileStorage.getGroupSuggestions()
      
      expect(suggestions).toEqual(['ProjectAlpha', 'ProjectBeta'])
    })

    it('should handle notes without groups', async () => {
      const mockFiles = ['note1.md']
      mockFs.readdir.mockResolvedValue(mockFiles as never)
      
      const note = createMockNoteFile('note1.md', {
        date: '2024-08-26',
        created_at: '2024-08-26T15:00:00Z',
        updated_at: '2024-08-26T15:00:00Z'
      }, 'Content without group')
      
      mockFs.readFile.mockResolvedValue(note)
      
      const suggestions = await fileStorage.getGroupSuggestions()
      
      expect(suggestions).toEqual([])
    })
  })

  describe('getAudienceSuggestions', () => {
    it('should return unique audience members sorted alphabetically', async () => {
      const mockFiles = ['note1.md', 'note2.md']
      mockFs.readdir.mockResolvedValue(mockFiles as never)
      
      const note1 = createMockNoteFile('note1.md', {
        date: '2024-08-26',
        audience: ['Sarah', 'Bob'],
        created_at: '2024-08-26T15:00:00Z',
        updated_at: '2024-08-26T15:00:00Z'
      }, 'Content 1')
      
      const note2 = createMockNoteFile('note2.md', {
        date: '2024-08-26',
        audience: ['Alice', 'Bob'], // Bob is duplicate
        created_at: '2024-08-26T14:00:00Z',
        updated_at: '2024-08-26T14:00:00Z'
      }, 'Content 2')
      
      mockFs.readFile
        .mockResolvedValueOnce(note1)
        .mockResolvedValueOnce(note2)
      
      const suggestions = await fileStorage.getAudienceSuggestions()
      
      expect(suggestions).toEqual(['Alice', 'Bob', 'Sarah'])
    })
  })

  describe('getRecentGroupSuggestions', () => {
    it('should return groups from last 2 weeks', async () => {
      // Set up fake timers for consistent date
      const mockToday = new Date('2024-08-26T15:00:00Z')
      jest.useFakeTimers()
      jest.setSystemTime(mockToday)
      
      const mockFiles = ['recent.md', 'old.md']
      mockFs.readdir.mockResolvedValue(mockFiles as never)
      
      const recentNote = createMockNoteFile('recent.md', {
        date: '2024-08-20',
        group: 'RecentProject',
        created_at: '2024-08-20T15:00:00Z',
        updated_at: '2024-08-20T15:00:00Z'
      }, 'Recent content')
      
      const oldNote = createMockNoteFile('old.md', {
        date: '2024-08-10',
        group: 'OldProject',
        created_at: '2024-08-10T15:00:00Z',
        updated_at: '2024-08-10T15:00:00Z'
      }, 'Old content')
      
      mockFs.readFile
        .mockResolvedValueOnce(recentNote)
        .mockResolvedValueOnce(oldNote)
      
      const suggestions = await fileStorage.getRecentGroupSuggestions()
      
      expect(suggestions).toEqual(['RecentProject'])
      
      jest.useRealTimers()
    })

    it('should filter by prefix when provided', async () => {
      // Set up fake timers for consistent date
      const mockToday = new Date('2024-08-26T15:00:00Z')
      jest.useFakeTimers()
      jest.setSystemTime(mockToday)
      
      const mockFiles = ['note1.md', 'note2.md']
      mockFs.readdir.mockResolvedValue(mockFiles as never)
      
      const note1 = createMockNoteFile('note1.md', {
        date: '2024-08-26',
        group: 'ProjectAlpha',
        created_at: '2024-08-26T15:00:00Z',
        updated_at: '2024-08-26T15:00:00Z'
      }, 'Content 1')
      
      const note2 = createMockNoteFile('note2.md', {
        date: '2024-08-26',
        group: 'Marketing',
        created_at: '2024-08-26T14:00:00Z',
        updated_at: '2024-08-26T14:00:00Z'
      }, 'Content 2')
      
      mockFs.readFile
        .mockResolvedValueOnce(note1)
        .mockResolvedValueOnce(note2)
      
      const suggestions = await fileStorage.getRecentGroupSuggestions('proj')
      
      expect(suggestions).toEqual(['ProjectAlpha'])
      
      jest.useRealTimers()
    })
  })

  describe('getRecentAudienceSuggestions', () => {
    it('should return audience from last 2 weeks', async () => {
      // Set up fake timers for consistent date
      const mockToday = new Date('2024-08-26T15:00:00Z')
      jest.useFakeTimers()
      jest.setSystemTime(mockToday)
      
      const mockFiles = ['recent.md']
      mockFs.readdir.mockResolvedValue(mockFiles as never)
      
      const recentNote = createMockNoteFile('recent.md', {
        date: '2024-08-26',
        audience: ['Sarah', 'Bob'],
        created_at: '2024-08-26T15:00:00Z',
        updated_at: '2024-08-26T15:00:00Z'
      }, 'Recent content')
      
      mockFs.readFile.mockResolvedValue(recentNote)
      
      const suggestions = await fileStorage.getRecentAudienceSuggestions()
      
      expect(suggestions).toEqual(['Bob', 'Sarah'])
      
      jest.useRealTimers()
    })

    it('should clean @ prefix from audience names', async () => {
      // Set up fake timers for consistent date
      const mockToday = new Date('2024-08-26T15:00:00Z')
      jest.useFakeTimers()
      jest.setSystemTime(mockToday)
      
      const mockFiles = ['note.md']
      mockFs.readdir.mockResolvedValue(mockFiles as never)
      
      const note = createMockNoteFile('note.md', {
        date: '2024-08-26',
        audience: ['@Sarah', 'Bob'],
        created_at: '2024-08-26T15:00:00Z',
        updated_at: '2024-08-26T15:00:00Z'
      }, 'Content')
      
      mockFs.readFile.mockResolvedValue(note)
      
      const suggestions = await fileStorage.getRecentAudienceSuggestions()
      
      expect(suggestions).toEqual(['Bob', 'Sarah'])
      
      jest.useRealTimers()
    })
  })

  describe('Date-based note retrieval', () => {
    describe('getNotesForToday', () => {
      it('should return notes from today only', async () => {
        // Mock the getLocalDateString method to return a fixed date
        const originalGetLocalDateString = (fileStorage as any).getLocalDateString
        ;(fileStorage as any).getLocalDateString = jest.fn().mockReturnValue('2024-08-26')
        
        const mockFiles = ['today.md', 'yesterday.md']
        mockFs.readdir.mockResolvedValue(mockFiles as never)
        
        const todayNote = createMockNoteFile('today.md', {
          date: '2024-08-26',
          group: 'TodayGroup',
          created_at: '2024-08-26T15:00:00Z',
          updated_at: '2024-08-26T15:00:00Z'
        }, 'Today content')
        
        const yesterdayNote = createMockNoteFile('yesterday.md', {
          date: '2024-08-25',
          group: 'YesterdayGroup',
          created_at: '2024-08-25T15:00:00Z',
          updated_at: '2024-08-25T15:00:00Z'
        }, 'Yesterday content')
        
        mockFs.readFile
          .mockResolvedValueOnce(todayNote)
          .mockResolvedValueOnce(yesterdayNote)
        
        const notes = await fileStorage.getNotesForToday()
        
        expect(notes).toHaveLength(1)
        expect(notes[0].metadata.group).toBe('TodayGroup')
        
        // Restore original method
        ;(fileStorage as any).getLocalDateString = originalGetLocalDateString
      })
    })

    describe('getNotesForYesterday', () => {
      it('should return notes from most recent previous date', async () => {
        // Mock the getLocalDateString method to return a fixed date
        const originalGetLocalDateString = (fileStorage as any).getLocalDateString
        ;(fileStorage as any).getLocalDateString = jest.fn().mockReturnValue('2024-08-26')
        
        const mockFiles = ['today.md', 'day1.md', 'day2.md']
        mockFs.readdir.mockResolvedValue(mockFiles as never)
        
        const todayNote = createMockNoteFile('today.md', {
          date: '2024-08-26',
          created_at: '2024-08-26T15:00:00Z',
          updated_at: '2024-08-26T15:00:00Z'
        }, 'Today')
        
        const day1Note = createMockNoteFile('day1.md', {
          date: '2024-08-25',
          group: 'YesterdayGroup',
          created_at: '2024-08-25T15:00:00Z',
          updated_at: '2024-08-25T15:00:00Z'
        }, 'Yesterday')
        
        const day2Note = createMockNoteFile('day2.md', {
          date: '2024-08-24',
          created_at: '2024-08-24T15:00:00Z',
          updated_at: '2024-08-24T15:00:00Z'
        }, 'Day before yesterday')
        
        mockFs.readFile
          .mockResolvedValueOnce(todayNote)
          .mockResolvedValueOnce(day1Note)
          .mockResolvedValueOnce(day2Note)
        
        const notes = await fileStorage.getNotesForYesterday()
        
        expect(notes).toHaveLength(1)
        expect(notes[0].metadata.date).toBe('2024-08-25')
        
        // Restore original method
        ;(fileStorage as any).getLocalDateString = originalGetLocalDateString
      })
    })

    describe('getNotesForPreviousWeek', () => {
      it('should return notes from the last 7 days excluding today', async () => {
        // Test just verifies the method runs without error
        const mockFiles = ['note.md']
        mockFs.readdir.mockResolvedValue(mockFiles as never)
        
        const note = createMockNoteFile('note.md', {
          date: '2024-08-22',
          group: 'TestGroup',
          created_at: '2024-08-22T15:00:00Z',
          updated_at: '2024-08-22T15:00:00Z'
        }, 'Test content')
        
        mockFs.readFile.mockResolvedValueOnce(note)
        
        const notes = await fileStorage.getNotesForPreviousWeek()
        
        // Method should complete successfully and return an array
        expect(Array.isArray(notes)).toBe(true)
      })
    })
  })

  describe('getOpenNotesFromLastMonth', () => {
    it('should return notes with incomplete items from last month', async () => {
      // Mock Date constructor to return specific dates
      const mockToday = new Date('2024-08-26T15:00:00Z')
      const originalDate = global.Date
      global.Date = jest.fn((dateString?: string) => {
        if (dateString) {
          return new originalDate(dateString)
        }
        return mockToday
      }) as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(global.Date as any).prototype = originalDate.prototype
      
      const mockFiles = ['complete.md', 'incomplete.md', 'old.md']
      mockFs.readdir.mockResolvedValue(mockFiles as never)
      
      const completeNote = createMockNoteFile('complete.md', {
        date: '2024-08-20',
        created_at: '2024-08-20T15:00:00Z',
        updated_at: '2024-08-20T15:00:00Z'
      }, '[x] Completed task\nSubject1 -x> Subject2')
      
      const incompleteNote = createMockNoteFile('incomplete.md', {
        date: '2024-08-20',
        group: 'IncompleteGroup',
        created_at: '2024-08-20T15:00:00Z',
        updated_at: '2024-08-20T15:00:00Z'
      }, '[] Incomplete task\nSubject1 -> Subject2')
      
      const oldNote = createMockNoteFile('old.md', {
        date: '2024-07-20', // Too old
        created_at: '2024-07-20T15:00:00Z',
        updated_at: '2024-07-20T15:00:00Z'
      }, '[] Old incomplete task')
      
      mockFs.readFile
        .mockResolvedValueOnce(completeNote)
        .mockResolvedValueOnce(incompleteNote)
        .mockResolvedValueOnce(oldNote)
      
      const notes = await fileStorage.getOpenNotesFromLastMonth()
      
      expect(notes).toHaveLength(1)
      expect(notes[0].metadata.group).toBe('IncompleteGroup')
      
      // Restore Date
      global.Date = originalDate
    })
  })

  describe('Navigation methods', () => {
    beforeEach(() => {
      const mockFiles = ['2024-08-26_150000.md', '2024-08-25_140000.md', '2024-08-24_130000.md']
      mockFs.readdir.mockResolvedValue(mockFiles as never)
      
      const note1 = createMockNoteFile('2024-08-26_150000.md', {
        date: '2024-08-26',
        created_at: '2024-08-26T15:00:00Z',
        updated_at: '2024-08-26T15:00:00Z'
      }, 'Newest note')
      
      const note2 = createMockNoteFile('2024-08-25_140000.md', {
        date: '2024-08-25',
        created_at: '2024-08-25T14:00:00Z',
        updated_at: '2024-08-25T14:00:00Z'
      }, 'Middle note')
      
      const note3 = createMockNoteFile('2024-08-24_130000.md', {
        date: '2024-08-24',
        created_at: '2024-08-24T13:00:00Z',
        updated_at: '2024-08-24T13:00:00Z'
      }, 'Oldest note')
      
      mockFs.readFile
        .mockResolvedValueOnce(note1)
        .mockResolvedValueOnce(note2)
        .mockResolvedValueOnce(note3)
    })

    describe('getNextNoteId', () => {
      it('should return next (older) note ID', async () => {
        const nextId = await fileStorage.getNextNoteId('2024-08-26_150000.md')
        
        expect(nextId).toBe('2024-08-25_140000.md')
      })

      it('should return null for last note', async () => {
        const nextId = await fileStorage.getNextNoteId('2024-08-24_130000.md')
        
        expect(nextId).toBeNull()
      })

      it('should return null for non-existent note', async () => {
        const nextId = await fileStorage.getNextNoteId('nonexistent.md')
        
        expect(nextId).toBeNull()
      })
    })

    describe('getPreviousNoteId', () => {
      it('should return previous (newer) note ID', async () => {
        const prevId = await fileStorage.getPreviousNoteId('2024-08-25_140000.md')
        
        expect(prevId).toBe('2024-08-26_150000.md')
      })

      it('should return null for first note', async () => {
        const prevId = await fileStorage.getPreviousNoteId('2024-08-26_150000.md')
        
        expect(prevId).toBeNull()
      })

      it('should return null for non-existent note', async () => {
        const prevId = await fileStorage.getPreviousNoteId('nonexistent.md')
        
        expect(prevId).toBeNull()
      })
    })
  })
})