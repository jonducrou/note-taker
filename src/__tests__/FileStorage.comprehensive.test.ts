/**
 * Comprehensive tests for FileStorage - covering critical functionality
 */

import { FileStorage, NoteMetadata } from '../storage/FileStorage'
import { promises as fs } from 'fs'
import { homedir } from 'os'

// Mock the fs and os modules
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    readdir: jest.fn()
  }
}))
jest.mock('os')

const mockFs = fs as jest.Mocked<typeof fs>
const mockHomedir = homedir as jest.MockedFunction<typeof homedir>

describe('FileStorage - Comprehensive Coverage', () => {
  let fileStorage: FileStorage
  
  beforeEach(() => {
    jest.clearAllMocks()
    mockHomedir.mockReturnValue('/mock/home')
    fileStorage = new FileStorage()
  })

  describe('Core File Operations', () => {
    describe('loadNotes', () => {
      it('should load and parse notes from directory', async () => {
        const mockFiles = ['note1.md', 'note2.md', 'not-a-note.txt']
        const mockNote1Content = `---
date: '2024-08-26'
group: ProjectA
audience:
  - Alice
  - Bob
created_at: '2024-08-26T10:00:00Z'
updated_at: '2024-08-26T10:00:00Z'
---

# Meeting Notes
[] Task 1
[x] Task 2`

        const mockNote2Content = `---
date: '2024-08-25'
group: ProjectB
audience:
  - Charlie
created_at: '2024-08-25T15:00:00Z'
updated_at: '2024-08-25T15:00:00Z'
---

# Different Notes
Subject1 -> Subject2`

        mockFs.access.mockResolvedValue(undefined)
        mockFs.readdir.mockResolvedValue(mockFiles as any)
        mockFs.readFile
          .mockResolvedValueOnce(mockNote1Content)
          .mockResolvedValueOnce(mockNote2Content)

        const notes = await fileStorage.loadNotes()

        expect(notes).toHaveLength(2)
        expect(notes[0].metadata.group).toBe('ProjectA')
        expect(notes[0].metadata.audience).toEqual(['Alice', 'Bob'])
        expect(notes[1].metadata.group).toBe('ProjectB')
        expect(notes[1].metadata.audience).toEqual(['Charlie'])
      })

      it('should handle directory not existing', async () => {
        mockFs.access.mockRejectedValue(new Error('Directory not found'))
        mockFs.mkdir.mockResolvedValue(undefined)
        mockFs.readdir.mockResolvedValue([])

        const notes = await fileStorage.loadNotes()

        expect(mockFs.mkdir).toHaveBeenCalledWith('/mock/home/Documents/Notes', { recursive: true })
        expect(notes).toHaveLength(0)
      })

      it('should handle corrupted note files gracefully', async () => {
        const mockFiles = ['good.md', 'corrupted.md']
        const goodContent = `---
date: '2024-08-26'
group: TestGroup
created_at: '2024-08-26T10:00:00Z'
updated_at: '2024-08-26T10:00:00Z'
---

Good content`

        mockFs.access.mockResolvedValue(undefined)
        mockFs.readdir.mockResolvedValue(mockFiles as any)
        mockFs.readFile
          .mockResolvedValueOnce(goodContent)
          .mockRejectedValueOnce(new Error('File corrupted'))

        const notes = await fileStorage.loadNotes()

        // Should only return the good note - corrupted files are caught and skipped
        expect(notes).toHaveLength(1)
        expect(notes[0].metadata.group).toBe('TestGroup')
      })
    })

    describe('searchNotes', () => {
      it('should search notes by content', async () => {
        const mockNotes = [
          {
            id: 'note1.md',
            filename: 'note1.md',
            metadata: { group: 'ProjectA' } as NoteMetadata,
            content: 'Meeting about new features'
          },
          {
            id: 'note2.md', 
            filename: 'note2.md',
            metadata: { group: 'ProjectB' } as NoteMetadata,
            content: 'Discussion about bugs'
          }
        ]

        jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue(mockNotes as any)

        const results = await fileStorage.searchNotes('features')
        expect(results).toHaveLength(1)
        expect(results[0].id).toBe('note1.md')
      })

      it('should search notes by group', async () => {
        const mockNotes = [
          {
            id: 'note1.md',
            filename: 'note1.md', 
            metadata: { group: 'ProjectAlpha' } as NoteMetadata,
            content: 'Some content'
          }
        ]

        jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue(mockNotes as any)

        const results = await fileStorage.searchNotes('Alpha')
        expect(results).toHaveLength(1)
        expect(results[0].metadata.group).toBe('ProjectAlpha')
      })

      it('should return empty array for no matches', async () => {
        jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue([])

        const results = await fileStorage.searchNotes('nonexistent')
        expect(results).toHaveLength(0)
      })
    })
  })

  describe('Metadata Extraction', () => {
    it('should extract group with various formats', () => {
      const testCases = [
        { input: '#ProductMeeting\nContent', expected: 'ProductMeeting' },
        { input: 'Some text #ProjectAlpha more text', expected: 'ProjectAlpha' },
        { input: '#multi-word-group', expected: 'multi-word-group' },
        { input: '#123StartWithNumber', expected: '123StartWithNumber' }
      ]

      testCases.forEach(({ input, expected }) => {
        const result = fileStorage.extractMetadata(input)
        expect(result.group).toBe(expected)
      })
    })

    it('should extract audience in old format', () => {
      const content = '@audience:Sarah,DevTeam,Product Manager\nSome notes'
      const result = fileStorage.extractMetadata(content)
      
      expect(result.audience).toEqual(['Sarah', 'DevTeam', 'Product Manager'])
    })

    it('should extract audience in new format', () => {
      const content = 'Meeting with @Alice and @Bob about @ProjectX'
      const result = fileStorage.extractMetadata(content)
      
      expect(result.audience).toEqual(['Alice', 'Bob', 'ProjectX'])
    })

    it('should handle mixed audience formats', () => {
      const content = '@audience:Sarah,Bob\nAlso meeting with @Charlie'
      const result = fileStorage.extractMetadata(content)
      
      // Should prefer the old format when both are present
      expect(result.audience).toEqual(['Sarah', 'Bob'])
    })
  })

  describe('Incomplete Item Tracking', () => {
    it('should count various types of incomplete items', () => {
      const content = `
# Test Note

## Actions
[] Incomplete task 1
[x] Completed task
[] Incomplete task 2
[X] Another completed (uppercase)

## Connections
Subject1 -> Subject2
Subject3 -x> Subject4
Subject5 <- Subject6
Subject7 <x- Subject8

## More connections
TopicA -> TopicB
TopicC -X> TopicD
      `

      const count = fileStorage.countIncompleteItems(content)
      // 2 incomplete tasks + 1 forward + 1 backward + 1 more forward = 5
      expect(count).toBe(5)
    })

    it('should handle edge cases in item counting', () => {
      const edgeCases = [
        { content: '', expected: 0 },
        { content: 'No special syntax here', expected: 0 },
        { content: '[] ', expected: 1 }, // Empty task still counts as incomplete
        { content: '[]Task without space', expected: 1 }, // This actually matches the regex
        { content: '[x] Only completed tasks', expected: 0 },
        { content: 'Only completed connections: A -x> B', expected: 0 }
      ]

      edgeCases.forEach(({ content, expected }) => {
        const count = fileStorage.countIncompleteItems(content)
        expect(count).toBe(expected)
      })
    })
  })

  describe('Group and Audience Suggestions', () => {
    it('should get unique group suggestions sorted', async () => {
      const mockNotes = [
        { metadata: { group: 'ProjectB' } },
        { metadata: { group: 'ProjectA' } },
        { metadata: { group: 'ProjectA' } }, // Duplicate
        { metadata: { group: undefined } }    // No group
      ]

      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue(mockNotes as any)

      const groups = await fileStorage.getGroupSuggestions()
      expect(groups).toEqual(['ProjectA', 'ProjectB'])
    })

    it('should get unique audience suggestions sorted', async () => {
      const mockNotes = [
        { metadata: { audience: ['Charlie', 'Alice'] } },
        { metadata: { audience: ['Bob', 'Alice'] } }, // Alice duplicate
        { metadata: { audience: undefined } }         // No audience
      ]

      jest.spyOn(fileStorage, 'loadNotes').mockResolvedValue(mockNotes as any)

      const audience = await fileStorage.getAudienceSuggestions()
      expect(audience).toEqual(['Alice', 'Bob', 'Charlie'])
    })
  })

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      mockFs.readdir.mockRejectedValue(new Error('Permission denied'))

      const notes = await fileStorage.loadNotes()
      expect(notes).toEqual([])
    })

    it('should handle save errors gracefully', async () => {
      mockFs.access.mockResolvedValue(undefined)
      mockFs.writeFile.mockRejectedValue(new Error('Disk full'))

      const result = await fileStorage.saveNote('Test content')
      expect(result.success).toBe(false)
      expect(result.id).toBe('')
    })
  })

  describe('Note Grouping', () => {
    it('should group notes by group and audience with numbering', () => {
      const notes = [
        {
          metadata: { group: 'ProjectA', audience: ['Team1'] },
          content: 'Note 1'
        },
        {
          metadata: { group: 'ProjectA', audience: ['Team1'] }, 
          content: 'Note 2'
        },
        {
          metadata: { group: 'ProjectB', audience: ['Team2'] },
          content: 'Note 3'
        }
      ]

      const grouped = fileStorage.groupNotesByGroupAndAudience(notes as any)

      expect(Object.keys(grouped)).toHaveLength(3)
      expect(grouped).toHaveProperty('ProjectA @Team1 (1)')
      expect(grouped).toHaveProperty('ProjectA @Team1 (2)')
      expect(grouped).toHaveProperty('ProjectB @Team2')
    })

    it('should handle notes with no group or audience', () => {
      const notes = [
        {
          metadata: { group: undefined, audience: undefined },
          content: 'Ungrouped note'
        },
        {
          metadata: { group: 'HasGroup', audience: undefined },
          content: 'Has group only'
        }
      ]

      const grouped = fileStorage.groupNotesByGroupAndAudience(notes as any)
      
      expect(grouped).toHaveProperty('No Group')  // FileStorage uses 'No Group' as default
      expect(grouped).toHaveProperty('HasGroup')
    })
  })
})