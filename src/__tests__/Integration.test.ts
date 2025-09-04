import { FileStorage } from '../storage/FileStorage'
import { promises as fs } from 'fs'
import { homedir } from 'os'
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

describe('FileStorage Integration Tests', () => {
  let fileStorage: FileStorage
  
  beforeEach(() => {
    jest.clearAllMocks()
    mockHomedir.mockReturnValue('/mock/home')
    fileStorage = new FileStorage()
    
    // Mock successful directory access by default
    mockFs.access.mockResolvedValue(undefined)
  })

  describe('End-to-End Note Lifecycle', () => {
    it('should create, save, and retrieve a complete note workflow', async () => {
      const content = '#ProjectAlpha @audience:Sarah,Bob\n\n[] Review API changes\n[] Schedule meeting\nSubject1 -> Subject2'
      const mockDate = new Date('2024-08-26T15:30:00Z')
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
      
      // Mock the save operation
      const result = await fileStorage.saveNote(content)
      
      // Verify save was called with correct parameters
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\/mock\/home\/Documents\/Notes\/2024-08-26_ProjectAlpha_\d{4}\.md$/),
        expect.stringContaining('group: ProjectAlpha'),
        'utf-8'
      )
      
      expect(result.success).toBe(true)
      expect(result.id).toMatch(/^2024-08-26_ProjectAlpha_\d{4}$/)
      
      // Verify metadata extraction worked correctly
      const writeCall = mockFs.writeFile.mock.calls[0]
      const savedContent = writeCall[1] as string
      expect(savedContent).toContain('audience:')
      expect(savedContent).toContain('- Sarah')
      expect(savedContent).toContain('- Bob')
      expect(savedContent).toContain('[] Review API changes')
    })

    it('should handle save-update-save cycle correctly', async () => {
      const noteId = '2024-08-26_1500'
      const updatedContent = '#Test\nUpdated content with new info'
      
      // Mock the update operation
      const existingFileContent = matter.stringify('Original content', {
        date: '2024-08-26',
        group: 'Test',
        audience: [],
        created_at: '2024-08-26T15:00:00Z',
        updated_at: '2024-08-26T15:00:00Z'
      })
      
      mockFs.readFile.mockResolvedValueOnce(existingFileContent)
      mockMatter.mockReturnValue({
        content: 'Original content',
        data: {
          date: '2024-08-26',
          group: 'Test',
          audience: [],
          created_at: '2024-08-26T15:00:00Z',
          updated_at: '2024-08-26T15:00:00Z'
        }
      } as any)
      
      await fileStorage.updateExistingNote(noteId, updatedContent)
      
      expect(mockFs.readFile).toHaveBeenCalledWith(
        `/mock/home/Documents/Notes/${noteId}.md`,
        'utf-8'
      )
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        `/mock/home/Documents/Notes/${noteId}.md`,
        expect.stringContaining('Updated content with new info'),
        'utf-8'
      )
    })
  })

  describe('Error Recovery and Resilience', () => {
    it('should handle file system permission issues gracefully', async () => {
      // Test multiple permission scenarios
      mockFs.access.mockRejectedValueOnce(new Error('Permission denied'))
      mockFs.mkdir.mockRejectedValueOnce(new Error('Permission denied'))
      
      const result = await fileStorage.saveNote('Test content')
      
      expect(result.success).toBe(false)
      expect(result.id).toBe('')
    })

    it('should handle corrupted file recovery', async () => {
      const noteId = '2024-08-26_1500'
      const newContent = 'Recovery content'
      
      // Mock corrupted file read
      mockFs.readFile.mockRejectedValueOnce(new Error('File corrupted'))
      
      await expect(fileStorage.updateExistingNote(noteId, newContent))
        .rejects.toThrow('File corrupted')
    })

    it('should handle network drive disconnection during save', async () => {
      mockFs.writeFile.mockRejectedValueOnce(new Error('Network path not found'))
      const content = 'Test content'
      
      const result = await fileStorage.saveNote(content)
      
      expect(result.success).toBe(false)
    })
  })

  describe('Performance and Concurrency', () => {
    it('should handle rapid successive saves without data loss', async () => {
      const contents = Array.from({ length: 10 }, (_, i) => `Note ${i + 1} content`)
      const mockDate = new Date('2024-08-26T15:30:00Z')
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
      
      const promises = contents.map(content => fileStorage.saveNote(content))
      const results = await Promise.all(promises)
      
      expect(results.every(r => r.success)).toBe(true)
      expect(mockFs.writeFile).toHaveBeenCalledTimes(10)
      
      // Verify all notes have unique IDs
      const ids = results.map(r => r.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })

    it('should handle mixed operations (save/update) concurrently', async () => {
      const noteId = '2024-08-26_existing'
      
      // Mock existing note for updates
      const existingContent = matter.stringify('Existing content', {
        date: '2024-08-26',
        group: 'test',
        audience: [],
        created_at: '2024-08-26T15:00:00Z',
        updated_at: '2024-08-26T15:00:00Z'
      })
      
      mockFs.readFile.mockResolvedValue(existingContent)
      mockMatter.mockReturnValue({
        content: 'Existing content',
        data: {
          date: '2024-08-26',
          group: 'test',
          audience: [],
          created_at: '2024-08-26T15:00:00Z',
          updated_at: '2024-08-26T15:00:00Z'
        }
      } as any)
      
      const operations = [
        fileStorage.saveNote('New note 1'),
        fileStorage.updateExistingNote(noteId, 'Updated content 1'),
        fileStorage.saveNote('New note 2'),
        fileStorage.updateExistingNote(noteId, 'Updated content 2')
      ]
      
      await Promise.all(operations)
      
      // Should handle all operations without errors
      expect(mockFs.writeFile).toHaveBeenCalledTimes(4)
    })
  })

  describe('Metadata and Content Integrity', () => {
    it('should preserve content integrity across save-load cycles', async () => {
      const complexContent = `#ProjectComplexName @audience:User With Spaces,Another-User

# Complex Note with Unicode 🚀

## Actions
[] Task with unicode: 中文 العربية
[x] Completed task with special chars: @#$%^&*()

## Connections
Subject with spaces -> Another subject with "quotes"
Complex Subject <- Yet another subject with [brackets]

## Content
- Bullet point with **bold** and *italic*
- Code block content:
\`\`\`javascript
console.log("Hello, world!");
\`\`\`

> Blockquote content
> Multiple lines`
      
      const mockDate = new Date('2024-08-26T15:30:00Z')
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
      
      const result = await fileStorage.saveNote(complexContent)
      
      expect(result.success).toBe(true)
      
      const writeCall = mockFs.writeFile.mock.calls[0]
      const savedContent = writeCall[1] as string
      
      // Verify complex content is preserved
      expect(savedContent).toContain('Task with unicode: 中文 العربية')
      expect(savedContent).toContain('console.log("Hello, world!");')
      expect(savedContent).toContain('Subject with spaces -> Another subject')
      expect(savedContent).toContain('> Blockquote content')
    })

    it('should handle edge cases in metadata extraction', async () => {
      const edgeCaseContent = `#Group-With-Dashes @audience:user@domain.com,user+tag@example.org

Multiple #tags #should-only-use-first @audience:second-audience-ignored

Content with ### headers and #hashtags in content should not affect metadata`
      
      const result = fileStorage.extractMetadata(edgeCaseContent)
      
      expect(result.group).toBe('Group-With-Dashes')
      expect(result.audience).toEqual(['user@domain.com', 'user+tag@example.org'])
    })
  })
})