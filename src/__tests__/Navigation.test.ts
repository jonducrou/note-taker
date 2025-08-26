import { FileStorage } from '../storage/index'
import { Note } from '../types'

describe('FileStorage Navigation', () => {
  let fileStorage: FileStorage
  let mockNotes: Note[]
  
  beforeEach(() => {
    jest.clearAllMocks()
    fileStorage = new FileStorage('/mock/notes')
    
    // Create mock notes with different update times
    // Note: Notes are sorted by updatedAt DESC (newest first)
    mockNotes = [
      {
        id: '2024-08-26_1500', // Index 0 - newest
        content: 'Latest note',
        group: 'recent',
        audience: [],
        createdAt: new Date('2024-08-26T15:00:00Z'),
        updatedAt: new Date('2024-08-26T15:00:00Z'),
        filePath: '/mock/notes/2024-08-26_1500.md'
      },
      {
        id: '2024-08-26_1400', // Index 1 - middle
        content: 'Middle note',
        group: 'work',
        audience: ['team'],
        createdAt: new Date('2024-08-26T14:00:00Z'),
        updatedAt: new Date('2024-08-26T14:00:00Z'),
        filePath: '/mock/notes/2024-08-26_1400.md'
      },
      {
        id: '2024-08-26_1300', // Index 2 - oldest
        content: 'Oldest note',
        group: 'personal',
        audience: [],
        createdAt: new Date('2024-08-26T13:00:00Z'),
        updatedAt: new Date('2024-08-26T13:00:00Z'),
        filePath: '/mock/notes/2024-08-26_1300.md'
      }
    ]
  })

  describe('getNextNoteId', () => {
    beforeEach(() => {
      // Mock loadNotes to return our test notes
      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue(mockNotes)
    })

    it('should get next note (older) from first note', async () => {
      const nextId = await fileStorage.getNextNoteId('2024-08-26_1500')
      expect(nextId).toBe('2024-08-26_1400')
    })

    it('should get next note (older) from middle note', async () => {
      const nextId = await fileStorage.getNextNoteId('2024-08-26_1400')
      expect(nextId).toBe('2024-08-26_1300')
    })

    it('should return null when at last note (no wrapping)', async () => {
      const nextId = await fileStorage.getNextNoteId('2024-08-26_1300')
      expect(nextId).toBeNull()
    })

    it('should return null when current note not found', async () => {
      const nextId = await fileStorage.getNextNoteId('nonexistent-note')
      expect(nextId).toBeNull()
    })

    it('should return null when no notes exist', async () => {
      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue([])
      const nextId = await fileStorage.getNextNoteId('2024-08-26_1500')
      expect(nextId).toBeNull()
    })

    it('should return null when only one note exists', async () => {
      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue([mockNotes[0]])
      const nextId = await fileStorage.getNextNoteId('2024-08-26_1500')
      expect(nextId).toBeNull()
    })
  })

  describe('getPreviousNoteId', () => {
    beforeEach(() => {
      // Mock loadNotes to return our test notes
      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue(mockNotes)
    })

    it('should get previous note (newer) from last note', async () => {
      const prevId = await fileStorage.getPreviousNoteId('2024-08-26_1300')
      expect(prevId).toBe('2024-08-26_1400')
    })

    it('should get previous note (newer) from middle note', async () => {
      const prevId = await fileStorage.getPreviousNoteId('2024-08-26_1400')
      expect(prevId).toBe('2024-08-26_1500')
    })

    it('should return null when at first note (no wrapping)', async () => {
      const prevId = await fileStorage.getPreviousNoteId('2024-08-26_1500')
      expect(prevId).toBeNull()
    })

    it('should return null when current note not found', async () => {
      const prevId = await fileStorage.getPreviousNoteId('nonexistent-note')
      expect(prevId).toBeNull()
    })

    it('should return null when no notes exist', async () => {
      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue([])
      const prevId = await fileStorage.getPreviousNoteId('2024-08-26_1500')
      expect(prevId).toBeNull()
    })

    it('should return null when only one note exists', async () => {
      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue([mockNotes[0]])
      const prevId = await fileStorage.getPreviousNoteId('2024-08-26_1500')
      expect(prevId).toBeNull()
    })
  })

  describe('Navigation Edge Cases', () => {
    it('should handle notes with same update time', async () => {
      const sameTimeNotes = [
        {
          id: '2024-08-26_1500',
          content: 'First note',
          group: undefined,
          audience: [],
          createdAt: new Date('2024-08-26T15:00:00Z'),
          updatedAt: new Date('2024-08-26T15:00:00Z'),
          filePath: '/mock/notes/2024-08-26_1500.md'
        },
        {
          id: '2024-08-26_1400', 
          content: 'Second note',
          group: undefined,
          audience: [],
          createdAt: new Date('2024-08-26T14:00:00Z'),
          updatedAt: new Date('2024-08-26T15:00:00Z'), // Same update time
          filePath: '/mock/notes/2024-08-26_1400.md'
        }
      ]

      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue(sameTimeNotes)

      const nextId = await fileStorage.getNextNoteId('2024-08-26_1500')
      const prevId = await fileStorage.getPreviousNoteId('2024-08-26_1400')
      
      // Should still navigate predictably based on array position
      expect(nextId).toBe('2024-08-26_1400')
      expect(prevId).toBe('2024-08-26_1500')
    })

    it('should handle navigation from non-existent current note gracefully', async () => {
      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue(mockNotes)

      const nextId = await fileStorage.getNextNoteId('fake-note-id')
      const prevId = await fileStorage.getPreviousNoteId('fake-note-id')
      
      expect(nextId).toBeNull()
      expect(prevId).toBeNull()
    })
  })

  describe('Integration Tests', () => {
    it('should navigate through notes until reaching the end', async () => {
      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue(mockNotes)

      // Start with newest note and navigate forward (next = older)
      let currentId = '2024-08-26_1500'
      
      currentId = await fileStorage.getNextNoteId(currentId) as string
      expect(currentId).toBe('2024-08-26_1400')
      
      currentId = await fileStorage.getNextNoteId(currentId) as string
      expect(currentId).toBe('2024-08-26_1300')
      
      const lastAttempt = await fileStorage.getNextNoteId(currentId)
      expect(lastAttempt).toBeNull() // Stops at last note, no wrapping
    })

    it('should navigate backwards through notes until reaching the beginning', async () => {
      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue(mockNotes)

      // Start with oldest note and navigate backward (prev = newer)
      let currentId = '2024-08-26_1300'
      
      currentId = await fileStorage.getPreviousNoteId(currentId) as string
      expect(currentId).toBe('2024-08-26_1400')
      
      currentId = await fileStorage.getPreviousNoteId(currentId) as string
      expect(currentId).toBe('2024-08-26_1500')
      
      const lastAttempt = await fileStorage.getPreviousNoteId(currentId)
      expect(lastAttempt).toBeNull() // Stops at first note, no wrapping
    })
  })
})