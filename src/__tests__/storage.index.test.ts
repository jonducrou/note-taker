import { FileStorage } from '../storage/index'
import { promises as fs } from 'fs'

// Mock the fs module
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readdir: jest.fn(),
    readFile: jest.fn(),
    unlink: jest.fn()
  }
}))
jest.mock('date-fns', () => ({
  format: jest.fn((_date, formatStr) => {
    if (formatStr === 'yyyy-MM-dd') return '2024-08-25'
    if (formatStr === 'HHmm') return '1430'
    return '2024-08-25T14:30:00Z'
  })
}))

jest.mock('gray-matter', () => ({
  __esModule: true,
  default: {
    stringify: jest.fn((content, data) => `---\n${JSON.stringify(data)}\n---\n\n${content}`)
  }
}))

const mockFs = fs as jest.Mocked<typeof fs>

describe('FileStorage (storage/index)', () => {
  let fileStorage: FileStorage
  const mockNotesDir = '/mock/notes'
  
  beforeEach(() => {
    jest.clearAllMocks()
    fileStorage = new FileStorage(mockNotesDir)
  })

  describe('parseNoteContent', () => {
    it('should parse group from content', () => {
      const content = '@group:ProjectAlpha\nSome content\nMore content'
      const result = fileStorage.parseNoteContent(content)
      
      expect(result.group).toBe('ProjectAlpha')
      expect(result.audience).toEqual([])
      expect(result.cleanContent).toBe('Some content\nMore content')
    })

    it('should parse audience from content', () => {
      const content = '@audience:Sarah,Bob,Alice\nSome content'
      const result = fileStorage.parseNoteContent(content)
      
      expect(result.group).toBeUndefined()
      expect(result.audience).toEqual(['Sarah', 'Bob', 'Alice'])
      expect(result.cleanContent).toBe('Some content')
    })

    it('should parse both group and audience', () => {
      const content = '@group:ProjectBeta\n@audience:Team1,Team2\nContent here'
      const result = fileStorage.parseNoteContent(content)
      
      expect(result.group).toBe('ProjectBeta')
      expect(result.audience).toEqual(['Team1', 'Team2'])
      expect(result.cleanContent).toBe('Content here')
    })

    it('should filter out empty audience members', () => {
      const content = '@audience:Sarah,,Bob, , Alice,\nContent'
      const result = fileStorage.parseNoteContent(content)
      
      expect(result.audience).toEqual(['Sarah', 'Bob', 'Alice'])
    })

    it('should handle content with no metadata', () => {
      const content = 'Just regular content\nWith multiple lines'
      const result = fileStorage.parseNoteContent(content)
      
      expect(result.group).toBeUndefined()
      expect(result.audience).toEqual([])
      expect(result.cleanContent).toBe('Just regular content\nWith multiple lines')
    })
  })

  describe('extractIncompleteItems', () => {
    const noteId = 'test-note'

    it('should extract incomplete actions', () => {
      const content = `
[] Task 1
[x] Completed task
[] Task 2
Some other content
[] Task 3
      `
      const result = fileStorage.extractIncompleteItems(content, noteId)
      
      expect(result.actions).toHaveLength(3)
      expect(result.actions[0]).toEqual({
        text: 'Task 1',
        completed: false,
        noteId,
        line: 2
      })
      expect(result.actions[1]).toEqual({
        text: 'Task 2',
        completed: false,
        noteId,
        line: 4
      })
    })

    it('should extract incomplete forward connections', () => {
      const content = `
Subject1 -> Subject2
Subject3 -x> Subject4
Subject5 -> Subject6
      `
      const result = fileStorage.extractIncompleteItems(content, noteId)
      
      expect(result.connections).toHaveLength(2)
      expect(result.connections[0]).toEqual({
        from: 'Subject1',
        to: 'Subject2',
        completed: false,
        noteId,
        line: 2,
        direction: 'forward'
      })
      expect(result.connections[1]).toEqual({
        from: 'Subject5',
        to: 'Subject6',
        completed: false,
        noteId,
        line: 4,
        direction: 'forward'
      })
    })

    it('should extract incomplete backward connections', () => {
      const content = `
Subject1 <- Subject2
Subject3 <x- Subject4
Subject5 <- Subject6
      `
      const result = fileStorage.extractIncompleteItems(content, noteId)
      
      expect(result.connections).toHaveLength(2)
      expect(result.connections[0]).toEqual({
        from: 'Subject2', // Reversed for backward connections
        to: 'Subject1',
        completed: false,
        noteId,
        line: 2,
        direction: 'backward'
      })
      expect(result.connections[1]).toEqual({
        from: 'Subject6',
        to: 'Subject5',
        completed: false,
        noteId,
        line: 4,
        direction: 'backward'
      })
    })

    it('should handle mixed content', () => {
      const content = `
[] Incomplete task
[x] Completed task
Subject1 -> Subject2
Subject3 -x> Subject4
Subject5 <- Subject6
Some other text
[] Another task
      `
      const result = fileStorage.extractIncompleteItems(content, noteId)
      
      expect(result.actions).toHaveLength(2)
      expect(result.connections).toHaveLength(2)
    })

    it('should return empty arrays for content with no items', () => {
      const content = 'Just some regular text with no actions or connections'
      const result = fileStorage.extractIncompleteItems(content, noteId)
      
      expect(result.actions).toHaveLength(0)
      expect(result.connections).toHaveLength(0)
    })
  })

  describe('ensureNotesDir', () => {
    it('should create notes directory', async () => {
      mockFs.mkdir.mockResolvedValue(undefined)
      
      await fileStorage.ensureNotesDir()
      
      expect(mockFs.mkdir).toHaveBeenCalledWith(mockNotesDir, { recursive: true })
    })

    it('should handle directory creation errors gracefully', async () => {
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'))
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      
      await fileStorage.ensureNotesDir()
      
      expect(consoleSpy).toHaveBeenCalledWith('Failed to create notes directory:', expect.any(Error))
      consoleSpy.mockRestore()
    })
  })

  describe('saveNote', () => {
    beforeEach(() => {
      mockFs.mkdir.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)
    })

    it('should save note with extracted metadata', async () => {
      const content = '@group:TestGroup\n@audience:TestUser\nTest content'
      
      const result = await fileStorage.saveNote(content)
      
      expect(result.id).toBe('2024-08-25_TestGroup_1430')
      expect(result.group).toBe('TestGroup')
      expect(result.audience).toEqual(['TestUser'])
      expect(mockFs.writeFile).toHaveBeenCalled()
    })

    it('should use provided group and audience over extracted ones', async () => {
      const content = '@group:ExtractedGroup\nTest content'
      
      const result = await fileStorage.saveNote(content, 'ProvidedGroup', ['ProvidedUser'])
      
      expect(result.group).toBe('ProvidedGroup')
      expect(result.audience).toEqual(['ProvidedUser'])
    })

    it('should handle save errors', async () => {
      mockFs.writeFile.mockRejectedValue(new Error('Write failed'))
      const content = 'Test content'
      
      await expect(fileStorage.saveNote(content)).rejects.toThrow('Write failed')
    })
  })
})