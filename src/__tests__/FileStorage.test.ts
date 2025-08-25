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
  },
  existsSync: jest.fn()
}))
jest.mock('os')

const mockFs = fs as jest.Mocked<typeof fs>
const mockHomedir = homedir as jest.MockedFunction<typeof homedir>

describe('FileStorage', () => {
  let fileStorage: FileStorage
  
  beforeEach(() => {
    jest.clearAllMocks()
    mockHomedir.mockReturnValue('/mock/home')
    fileStorage = new FileStorage()
  })

  describe('extractMetadata', () => {
    it('should extract group from content', () => {
      const content = '#ProductMeeting\nSome meeting notes'
      const result = fileStorage.extractMetadata(content)
      
      expect(result.group).toBe('ProductMeeting')
      expect(result.audience).toBeUndefined()
    })

    it('should extract audience from content', () => {
      const content = '@audience:Sarah,DevTeam\nSome notes'
      const result = fileStorage.extractMetadata(content)
      
      expect(result.group).toBeUndefined()
      expect(result.audience).toEqual(['Sarah', 'DevTeam'])
    })

    it('should extract both group and audience', () => {
      const content = '#ProjectAlpha @audience:Sarah,Bob\nMeeting notes'
      const result = fileStorage.extractMetadata(content)
      
      expect(result.group).toBe('ProjectAlpha')
      expect(result.audience).toEqual(['Sarah', 'Bob'])
    })

    it('should handle content with no metadata', () => {
      const content = 'Just some plain text notes'
      const result = fileStorage.extractMetadata(content)
      
      expect(result.group).toBeUndefined()
      expect(result.audience).toBeUndefined()
    })

    it('should trim whitespace from audience members', () => {
      const content = '@audience: Sarah , Bob , Charlie \nNotes'
      const result = fileStorage.extractMetadata(content)
      
      expect(result.audience).toEqual(['Sarah', 'Bob', 'Charlie'])
    })

    it('should filter out empty audience members', () => {
      const content = '@audience:Sarah,,Bob,\nNotes'
      const result = fileStorage.extractMetadata(content)
      
      expect(result.audience).toEqual(['Sarah', 'Bob'])
    })
  })

  describe('generateFilename', () => {
    it('should generate filename with date and time', () => {
      const mockDate = new Date('2024-08-25T14:30:00Z')
      const spy = jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
      
      const filename = fileStorage.generateFilename()
      
      // The exact time will depend on timezone, so just check the pattern
      expect(filename).toMatch(/2024-08-25_\d{6}\.md/)
      spy.mockRestore()
    })

    it('should generate different filenames for different times', () => {
      const mockDate1 = new Date('2024-08-25T09:15:00Z')
      const mockDate2 = new Date('2024-08-25T16:45:00Z')
      
      const spy1 = jest.spyOn(global, 'Date').mockImplementation(() => mockDate1)
      const filename1 = fileStorage.generateFilename()
      spy1.mockRestore()
      
      const spy2 = jest.spyOn(global, 'Date').mockImplementation(() => mockDate2)
      const filename2 = fileStorage.generateFilename()
      spy2.mockRestore()
      
      expect(filename1).toMatch(/2024-08-25_\d{6}\.md/)
      expect(filename2).toMatch(/2024-08-25_\d{6}\.md/)
      expect(filename1).not.toBe(filename2)
    })
  })

  describe('formatNoteContent', () => {
    it('should format note content with YAML frontmatter', () => {
      const content = 'Note content here'
      const metadata: NoteMetadata = {
        date: '2024-08-25',
        group: 'ProjectAlpha',
        audience: ['Sarah', 'Bob'],
        created_at: '2024-08-25T14:30:00Z',
        updated_at: '2024-08-25T14:30:00Z'
      }
      
      const result = fileStorage.formatNoteContent(content, metadata)
      
      expect(result).toContain('---')
      expect(result).toContain('date: \'2024-08-25\'')
      expect(result).toContain('group: ProjectAlpha')
      expect(result).toContain('audience:')
      expect(result).toContain('- Sarah')
      expect(result).toContain('- Bob')
      expect(result).toContain('Note content here')
    })
  })

  describe('parseNoteContent', () => {
    it('should parse note content with frontmatter', () => {
      const fileContent = `---
date: '2024-08-25'
group: ProjectAlpha
audience:
  - Sarah
  - Bob
created_at: '2024-08-25T14:30:00Z'
updated_at: '2024-08-25T14:30:00Z'
---

Note content here`
      
      const result = fileStorage.parseNoteContent(fileContent)
      
      expect(result.metadata.date).toBe('2024-08-25')
      expect(result.metadata.group).toBe('ProjectAlpha')
      expect(result.metadata.audience).toEqual(['Sarah', 'Bob'])
      expect(result.content).toBe('Note content here')
    })

    it('should handle content without frontmatter', () => {
      const fileContent = '#ProjectBeta @audience:Alice\nSome notes'
      const mockDate = new Date('2024-08-25T14:30:00Z')
      const spy = jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
      
      const result = fileStorage.parseNoteContent(fileContent)
      
      expect(result.metadata.group).toBe('ProjectBeta')
      expect(result.metadata.audience).toEqual(['Alice'])
      expect(result.metadata.date).toBe('2024-08-25')
      expect(result.content).toBe('#ProjectBeta @audience:Alice\nSome notes')
      
      spy.mockRestore()
    })
  })

  describe('countIncompleteItems', () => {
    it('should count incomplete checkboxes', () => {
      const content = '[] Task 1\n[x] Task 2\n[] Task 3'
      const count = fileStorage.countIncompleteItems(content)
      
      expect(count).toBe(2)
    })

    it('should count incomplete forward connections', () => {
      const content = 'Subject1 -> Subject2\nSubject3 -x> Subject4'
      const count = fileStorage.countIncompleteItems(content)
      
      expect(count).toBe(1)
    })

    it('should count incomplete backward connections', () => {
      const content = 'Subject1 <- Subject2\nSubject3 <x- Subject4'
      const count = fileStorage.countIncompleteItems(content)
      
      expect(count).toBe(1)
    })

    it('should count all types of incomplete items', () => {
      const content = `
[] Task 1
[x] Task 2  
[] Task 3
Subject1 -> Subject2
Subject3 -x> Subject4
Subject5 <- Subject6
Subject7 <x- Subject8
      `
      const count = fileStorage.countIncompleteItems(content)
      
      expect(count).toBe(4) // 2 incomplete tasks + 1 forward + 1 backward
    })

    it('should return 0 for content with no incomplete items', () => {
      const content = '[x] Completed task\nSubject1 -x> Subject2'
      const count = fileStorage.countIncompleteItems(content)
      
      expect(count).toBe(0)
    })
  })

  describe('ensureNotesDirectory', () => {
    it('should not create directory if it exists', async () => {
      mockFs.access.mockResolvedValue(undefined)
      
      await fileStorage.ensureNotesDirectory()
      
      expect(mockFs.access).toHaveBeenCalledWith('/mock/home/Documents/Notes')
      expect(mockFs.mkdir).not.toHaveBeenCalled()
    })

    it('should create directory if it does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('Directory not found'))
      mockFs.mkdir.mockResolvedValue(undefined)
      
      await fileStorage.ensureNotesDirectory()
      
      expect(mockFs.access).toHaveBeenCalledWith('/mock/home/Documents/Notes')
      expect(mockFs.mkdir).toHaveBeenCalledWith('/mock/home/Documents/Notes', { recursive: true })
    })
  })

  describe('saveNote', () => {
    it('should save a new note with extracted metadata', async () => {
      const mockDate = new Date('2024-08-25T14:30:00Z')
      const spy = jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
      
      mockFs.access.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)
      
      const result = await fileStorage.saveNote('#ProjectAlpha @audience:Sarah\nMeeting notes')
      
      expect(result.success).toBe(true)
      expect(result.id).toMatch(/2024-08-25_\d{6}\.md/)
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('/mock/home/Documents/Notes/2024-08-25_'),
        expect.stringContaining('group: ProjectAlpha'),
        'utf-8'
      )
      
      spy.mockRestore()
    })

    it('should handle save errors gracefully', async () => {
      mockFs.access.mockResolvedValue(undefined)
      mockFs.writeFile.mockRejectedValue(new Error('Write failed'))
      
      const result = await fileStorage.saveNote('Some content')
      
      expect(result.success).toBe(false)
      expect(result.id).toBe('')
    })
  })
})