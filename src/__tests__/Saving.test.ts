import { FileStorage } from '../storage/FileStorage'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import matter from 'gray-matter'

// Mock the fs, os, and path modules
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
jest.mock('gray-matter')

const mockFs = fs as jest.Mocked<typeof fs>
const mockHomedir = homedir as jest.MockedFunction<typeof homedir>
const mockMatter = matter as jest.MockedFunction<typeof matter>

describe('FileStorage Saving', () => {
  let fileStorage: FileStorage
  const mockNotesDir = '/mock/home/Documents/Notes'
  
  beforeEach(() => {
    jest.clearAllMocks()
    mockHomedir.mockReturnValue('/mock/home')
    fileStorage = new FileStorage()
    
    // Mock successful directory access by default
    mockFs.access.mockResolvedValue(undefined)
  })

  describe('saveNote', () => {
    it('should save a new note with content only', async () => {
      const content = 'This is a test note'
      const mockDate = new Date('2024-08-26T15:30:00Z')
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
      
      const result = await fileStorage.saveNote(content)
      
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\/mock\/home\/Documents\/Notes\/2024-08-26_\d{4}\.md$/),
        expect.stringContaining('This is a test note'),
        'utf-8'
      )
      expect(result.id).toMatch(/^2024-08-26_\d{4}$/)
      expect(result.success).toBe(true)
    })

    it('should save a note with group metadata', async () => {
      const content = '#ProjectAlpha\nMeeting notes'
      const mockDate = new Date('2024-08-26T15:30:00Z')
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
      
      await fileStorage.saveNote(content)
      
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\/mock\/home\/Documents\/Notes\/2024-08-26_ProjectAlpha_\d{4}\.md$/),
        expect.stringContaining('group: ProjectAlpha'),
        'utf-8'
      )
    })

    it('should save a note with audience metadata', async () => {
      const content = '@audience:Sarah,Bob\nProject discussion'
      const mockDate = new Date('2024-08-26T15:30:00Z')
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
      
      await fileStorage.saveNote(content)
      
      const writeCall = mockFs.writeFile.mock.calls[0]
      expect(writeCall[1]).toContain('audience:')
      expect(writeCall[1]).toContain('- Sarah')
      expect(writeCall[1]).toContain('- Bob')
    })

    it('should save a note with both group and audience', async () => {
      const content = '#ProjectBeta @audience:Team,Manager\nStatus update'
      const mockDate = new Date('2024-08-26T15:30:00Z')
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
      
      await fileStorage.saveNote(content)
      
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\/mock\/home\/Documents\/Notes\/2024-08-26_ProjectBeta_\d{4}\.md$/),
        expect.stringContaining('group: ProjectBeta'),
        'utf-8'
      )
    })

    it('should handle empty content gracefully', async () => {
      const content = ''
      const mockDate = new Date('2024-08-26T15:30:00Z')
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
      
      const result = await fileStorage.saveNote(content)
      
      expect(mockFs.writeFile).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('should handle whitespace-only content', async () => {
      const content = '   \n\n  \t  '
      const mockDate = new Date('2024-08-26T15:30:00Z')
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
      
      const result = await fileStorage.saveNote(content)
      
      expect(result.success).toBe(true)
    })

    it('should create notes directory if it does not exist', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('Directory not found'))
      const content = 'Test note'
      
      await fileStorage.saveNote(content)
      
      expect(mockFs.mkdir).toHaveBeenCalledWith(mockNotesDir, { recursive: true })
    })

    it('should handle file system write errors', async () => {
      mockFs.writeFile.mockRejectedValueOnce(new Error('Disk full'))
      const content = 'Test note'
      
      const result = await fileStorage.saveNote(content)
      
      expect(result.success).toBe(false)
      expect(result.id).toBe('')
    })

    it('should generate unique filenames for concurrent saves', async () => {
      const content1 = 'First note'
      const content2 = 'Second note'
      const mockDate1 = new Date('2024-08-26T15:30:00Z')
      const mockDate2 = new Date('2024-08-26T15:30:01Z') // 1 second later
      
      jest.spyOn(global, 'Date')
        .mockImplementationOnce(() => mockDate1)
        .mockImplementationOnce(() => mockDate1)
        .mockImplementationOnce(() => mockDate2)
        .mockImplementationOnce(() => mockDate2)
      
      const [result1, result2] = await Promise.all([
        fileStorage.saveNote(content1),
        fileStorage.saveNote(content2)
      ])
      
      expect(result1.id).not.toBe(result2.id)
      expect(mockFs.writeFile).toHaveBeenCalledTimes(2)
    })
  })

  describe('updateExistingNote', () => {
    it('should update an existing note', async () => {
      const noteId = '2024-08-26_1500'
      const newContent = 'Updated content'
      const expectedPath = join(mockNotesDir, `${noteId}.md`)
      
      // Mock existing file content
      const existingContent = matter.stringify('Old content', {
        date: '2024-08-26',
        group: 'test',
        audience: [],
        created_at: '2024-08-26T15:00:00Z',
        updated_at: '2024-08-26T15:00:00Z'
      })
      mockFs.readFile.mockResolvedValueOnce(existingContent)
      mockMatter.mockReturnValue({
        content: 'Old content',
        data: {
          date: '2024-08-26',
          group: 'test',
          audience: [],
          created_at: '2024-08-26T15:00:00Z',
          updated_at: '2024-08-26T15:00:00Z'
        }
      } as any)
      
      await fileStorage.updateExistingNote(noteId, newContent)
      
      expect(mockFs.readFile).toHaveBeenCalledWith(expectedPath, 'utf-8')
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expectedPath,
        expect.stringContaining('Updated content'),
        'utf-8'
      )
    })

    it('should handle missing file when updating', async () => {
      const noteId = '2024-08-26_nonexistent'
      const newContent = 'New content'
      
      mockFs.readFile.mockRejectedValueOnce(new Error('File not found'))
      
      await expect(fileStorage.updateExistingNote(noteId, newContent))
        .rejects.toThrow('File not found')
    })

    it('should preserve metadata when updating content', async () => {
      const noteId = '2024-08-26_1500'
      const newContent = 'Updated content with new info'
      const originalMetadata = {
        date: '2024-08-26',
        group: 'important',
        audience: ['team'],
        created_at: '2024-08-26T15:00:00Z',
        updated_at: '2024-08-26T15:00:00Z'
      }
      
      const existingContent = matter.stringify('Old content', originalMetadata)
      mockFs.readFile.mockResolvedValueOnce(existingContent)
      mockMatter.mockReturnValue({
        content: 'Old content',
        data: originalMetadata
      } as any)
      
      await fileStorage.updateExistingNote(noteId, newContent)
      
      const writeCall = mockFs.writeFile.mock.calls[0]
      expect(writeCall[1]).toContain('group: important')
      expect(writeCall[1]).toContain('- team')
      expect(writeCall[1]).toContain('Updated content with new info')
    })

    it('should update the updated_at timestamp', async () => {
      const noteId = '2024-08-26_1500'
      const newContent = 'Updated content'
      const mockUpdateDate = new Date('2024-08-26T16:00:00Z')
      jest.spyOn(global, 'Date').mockImplementation(() => mockUpdateDate)
      
      const originalMetadata = {
        date: '2024-08-26',
        group: 'test',
        audience: [],
        created_at: '2024-08-26T15:00:00Z',
        updated_at: '2024-08-26T15:00:00Z'
      }
      
      const existingContent = matter.stringify('Old content', originalMetadata)
      mockFs.readFile.mockResolvedValueOnce(existingContent)
      mockMatter.mockReturnValue({
        content: 'Old content',
        data: originalMetadata
      } as any)
      
      await fileStorage.updateExistingNote(noteId, newContent)
      
      const writeCall = mockFs.writeFile.mock.calls[0]
      expect(writeCall[1]).toContain('updated_at: 2024-08-26T16:00:00.000Z')
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle permission denied errors', async () => {
      mockFs.writeFile.mockRejectedValueOnce(new Error('Permission denied'))
      const content = 'Test note'
      
      const result = await fileStorage.saveNote(content)
      
      expect(result.success).toBe(false)
    })

    it('should handle disk full errors', async () => {
      mockFs.writeFile.mockRejectedValueOnce(new Error('No space left on device'))
      const content = 'Test note'
      
      const result = await fileStorage.saveNote(content)
      
      expect(result.success).toBe(false)
    })

    it('should handle invalid characters in group names', async () => {
      const content = '#Project/Alpha\nTest content'
      const mockDate = new Date('2024-08-26T15:30:00Z')
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
      
      await fileStorage.saveNote(content)
      
      // Should still save successfully, handling invalid characters
      expect(mockFs.writeFile).toHaveBeenCalled()
    })

    it('should handle very long content', async () => {
      const content = 'x'.repeat(1000000) // 1MB of content
      const mockDate = new Date('2024-08-26T15:30:00Z')
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
      
      const result = await fileStorage.saveNote(content)
      
      expect(result.success).toBe(true)
      expect(mockFs.writeFile).toHaveBeenCalled()
    })

    it('should handle unicode content', async () => {
      const content = 'Unicode test: 🚀 中文 العربية'
      const mockDate = new Date('2024-08-26T15:30:00Z')
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
      
      const result = await fileStorage.saveNote(content)
      
      expect(result.success).toBe(true)
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Unicode test: 🚀 中文 العربية'),
        'utf-8'
      )
    })

    it('should handle multiple metadata tags of same type', async () => {
      const content = '#Project1 #Project2 @audience:Team1 @audience:Team2\nContent'
      const mockDate = new Date('2024-08-26T15:30:00Z')
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
      
      const result = await fileStorage.saveNote(content)
      
      expect(result.success).toBe(true)
    })
  })

  describe('Concurrent Operations', () => {
    it('should handle concurrent save operations', async () => {
      const contents = ['Note 1', 'Note 2', 'Note 3', 'Note 4', 'Note 5']
      const mockDate = new Date('2024-08-26T15:30:00Z')
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
      
      const promises = contents.map(content => fileStorage.saveNote(content))
      const results = await Promise.all(promises)
      
      expect(results.every(r => r.success)).toBe(true)
      expect(mockFs.writeFile).toHaveBeenCalledTimes(5)
    })

    it('should handle concurrent update operations', async () => {
      const noteId = '2024-08-26_1500'
      const updates = ['Update 1', 'Update 2', 'Update 3']
      
      const originalMetadata = {
        date: '2024-08-26',
        group: 'test',
        audience: [],
        created_at: '2024-08-26T15:00:00Z',
        updated_at: '2024-08-26T15:00:00Z'
      }
      
      const existingContent = matter.stringify('Original content', originalMetadata)
      mockFs.readFile.mockResolvedValue(existingContent)
      mockMatter.mockReturnValue({
        content: 'Original content',
        data: originalMetadata
      } as any)
      
      const promises = updates.map(content => 
        fileStorage.updateExistingNote(noteId, content)
      )
      
      await Promise.all(promises)
      
      expect(mockFs.writeFile).toHaveBeenCalledTimes(3)
    })
  })

  describe('File System Integration', () => {
    it('should create nested directory structure if needed', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('ENOENT'))
      const content = 'Test note'
      
      await fileStorage.saveNote(content)
      
      expect(mockFs.mkdir).toHaveBeenCalledWith(mockNotesDir, { recursive: true })
    })

    it('should handle read-only file system', async () => {
      mockFs.writeFile.mockRejectedValueOnce(new Error('Read-only file system'))
      const content = 'Test note'
      
      const result = await fileStorage.saveNote(content)
      
      expect(result.success).toBe(false)
    })

    it('should validate file paths are within notes directory', async () => {
      const content = 'Test note'
      const mockDate = new Date('2024-08-26T15:30:00Z')
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
      
      await fileStorage.saveNote(content)
      
      const writeCall = mockFs.writeFile.mock.calls[0]
      expect(writeCall[0]).toStartWith(mockNotesDir)
      expect(writeCall[0]).toMatch(/\.md$/)
    })
  })
})