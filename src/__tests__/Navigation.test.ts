import { FileStorage } from '../storage/FileStorage'
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

  describe('getNextNoteId with skipNotesWithoutOpenActions', () => {
    let notesWithActions: Note[]

    beforeEach(() => {
      // Create notes with varying content - some with actions, some without
      notesWithActions = [
        {
          id: '2024-08-26_1500', // Index 0 - newest, HAS ACTIONS
          content: 'Recent note\n[] Todo item\n[] Another todo',
          group: 'recent',
          audience: [],
          createdAt: new Date('2024-08-26T15:00:00Z'),
          updatedAt: new Date('2024-08-26T15:00:00Z'),
          filePath: '/mock/notes/2024-08-26_1500.md'
        },
        {
          id: '2024-08-26_1400', // Index 1 - middle, NO ACTIONS
          content: 'Middle note with completed items\n[x] Done task\nJust regular text',
          group: 'work',
          audience: ['team'],
          createdAt: new Date('2024-08-26T14:00:00Z'),
          updatedAt: new Date('2024-08-26T14:00:00Z'),
          filePath: '/mock/notes/2024-08-26_1400.md'
        },
        {
          id: '2024-08-26_1330', // Index 2 - HAS ACTIONS
          content: 'Note with connections\nSubject -> Another subject\nSome text',
          group: 'work',
          audience: [],
          createdAt: new Date('2024-08-26T13:30:00Z'),
          updatedAt: new Date('2024-08-26T13:30:00Z'),
          filePath: '/mock/notes/2024-08-26_1330.md'
        },
        {
          id: '2024-08-26_1300', // Index 3 - oldest, NO ACTIONS
          content: 'Oldest note with no actions\nJust regular text here',
          group: 'personal',
          audience: [],
          createdAt: new Date('2024-08-26T13:00:00Z'),
          updatedAt: new Date('2024-08-26T13:00:00Z'),
          filePath: '/mock/notes/2024-08-26_1300.md'
        }
      ]
      
      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue(notesWithActions)
    })

    it('should find next note with open actions, skipping notes without actions', async () => {
      // From first note (has actions) to next note with actions (skipping middle note)
      const nextId = await fileStorage.getNextNoteId('2024-08-26_1500', true)
      expect(nextId).toBe('2024-08-26_1330') // Skips 1400 because it has no open actions
    })

    it('should find next note with open actions from note without actions', async () => {
      // From middle note (no actions) to next note with actions
      const nextId = await fileStorage.getNextNoteId('2024-08-26_1400', true)
      expect(nextId).toBe('2024-08-26_1330') // Next note with actions
    })

    it('should return last note when no more notes with open actions found', async () => {
      // From note with actions, but no more notes with actions after it
      const nextId = await fileStorage.getNextNoteId('2024-08-26_1330', true)
      expect(nextId).toBe('2024-08-26_1300') // Returns last note even though it has no actions
    })

    it('should return null when already at last note', async () => {
      // From last note, should return null even with skip=true
      const nextId = await fileStorage.getNextNoteId('2024-08-26_1300', true)
      expect(nextId).toBeNull()
    })

    it('should use normal behavior when skipNotesWithoutOpenActions is false', async () => {
      // Should behave like normal navigation
      const nextId = await fileStorage.getNextNoteId('2024-08-26_1500', false)
      expect(nextId).toBe('2024-08-26_1400') // Normal next note
    })

    it('should handle case when no notes have open actions', async () => {
      const notesWithoutActions = [
        {
          id: '2024-08-26_1500',
          content: 'No actions here\n[x] Completed task',
          group: 'test',
          audience: [],
          createdAt: new Date('2024-08-26T15:00:00Z'),
          updatedAt: new Date('2024-08-26T15:00:00Z'),
          filePath: '/mock/notes/2024-08-26_1500.md'
        },
        {
          id: '2024-08-26_1400',
          content: 'Also no actions\nJust text',
          group: 'test',
          audience: [],
          createdAt: new Date('2024-08-26T14:00:00Z'),
          updatedAt: new Date('2024-08-26T14:00:00Z'),
          filePath: '/mock/notes/2024-08-26_1400.md'
        }
      ]
      
      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue(notesWithoutActions)
      
      // Should return last note when no notes with actions found
      const nextId = await fileStorage.getNextNoteId('2024-08-26_1500', true)
      expect(nextId).toBe('2024-08-26_1400')
    })
  })

  describe('getPreviousNoteId with skipNotesWithoutOpenActions', () => {
    let notesWithActions: Note[]

    beforeEach(() => {
      // Same test data as getNextNoteId tests
      notesWithActions = [
        {
          id: '2024-08-26_1500', // Index 0 - newest, HAS ACTIONS
          content: 'Recent note\n[] Todo item\n[] Another todo',
          group: 'recent',
          audience: [],
          createdAt: new Date('2024-08-26T15:00:00Z'),
          updatedAt: new Date('2024-08-26T15:00:00Z'),
          filePath: '/mock/notes/2024-08-26_1500.md'
        },
        {
          id: '2024-08-26_1400', // Index 1 - middle, NO ACTIONS
          content: 'Middle note with completed items\n[x] Done task\nJust regular text',
          group: 'work',
          audience: ['team'],
          createdAt: new Date('2024-08-26T14:00:00Z'),
          updatedAt: new Date('2024-08-26T14:00:00Z'),
          filePath: '/mock/notes/2024-08-26_1400.md'
        },
        {
          id: '2024-08-26_1330', // Index 2 - HAS ACTIONS
          content: 'Note with connections\nSubject -> Another subject\nSome text',
          group: 'work',
          audience: [],
          createdAt: new Date('2024-08-26T13:30:00Z'),
          updatedAt: new Date('2024-08-26T13:30:00Z'),
          filePath: '/mock/notes/2024-08-26_1330.md'
        },
        {
          id: '2024-08-26_1300', // Index 3 - oldest, NO ACTIONS
          content: 'Oldest note with no actions\nJust regular text here',
          group: 'personal',
          audience: [],
          createdAt: new Date('2024-08-26T13:00:00Z'),
          updatedAt: new Date('2024-08-26T13:00:00Z'),
          filePath: '/mock/notes/2024-08-26_1300.md'
        }
      ]
      
      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue(notesWithActions)
    })

    it('should find previous note with open actions, skipping notes without actions', async () => {
      // From last note (no actions) to previous note with actions (skipping middle note)
      const prevId = await fileStorage.getPreviousNoteId('2024-08-26_1300', true)
      expect(prevId).toBe('2024-08-26_1330') // Skips 1400 because it has no open actions
    })

    it('should find previous note with open actions from note without actions', async () => {
      // From middle note (no actions) to previous note with actions
      const prevId = await fileStorage.getPreviousNoteId('2024-08-26_1400', true)
      expect(prevId).toBe('2024-08-26_1500') // Previous note with actions
    })

    it('should return first note when no more notes with open actions found', async () => {
      // From note with actions, but no more notes with actions before it
      const prevId = await fileStorage.getPreviousNoteId('2024-08-26_1330', true)
      expect(prevId).toBe('2024-08-26_1500') // Previous note with actions
    })

    it('should return first note when no previous notes have actions', async () => {
      // Starting from a note that has actions, but earlier notes don't
      const prevId = await fileStorage.getPreviousNoteId('2024-08-26_1330', true)
      expect(prevId).toBe('2024-08-26_1500') // First note with actions
    })

    it('should return null when already at first note', async () => {
      // From first note, should return null even with skip=true
      const prevId = await fileStorage.getPreviousNoteId('2024-08-26_1500', true)
      expect(prevId).toBeNull()
    })

    it('should use normal behavior when skipNotesWithoutOpenActions is false', async () => {
      // Should behave like normal navigation
      const prevId = await fileStorage.getPreviousNoteId('2024-08-26_1300', false)
      expect(prevId).toBe('2024-08-26_1330') // Normal previous note
    })

    it('should handle case when no notes have open actions', async () => {
      const notesWithoutActions = [
        {
          id: '2024-08-26_1500',
          content: 'No actions here\n[x] Completed task',
          group: 'test',
          audience: [],
          createdAt: new Date('2024-08-26T15:00:00Z'),
          updatedAt: new Date('2024-08-26T15:00:00Z'),
          filePath: '/mock/notes/2024-08-26_1500.md'
        },
        {
          id: '2024-08-26_1400',
          content: 'Also no actions\nJust text',
          group: 'test',
          audience: [],
          createdAt: new Date('2024-08-26T14:00:00Z'),
          updatedAt: new Date('2024-08-26T14:00:00Z'),
          filePath: '/mock/notes/2024-08-26_1400.md'
        }
      ]
      
      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue(notesWithoutActions)
      
      // Should return first note when no notes with actions found
      const prevId = await fileStorage.getPreviousNoteId('2024-08-26_1400', true)
      expect(prevId).toBe('2024-08-26_1500')
    })
  })
})