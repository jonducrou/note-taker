import { FileStorage } from '../storage/FileStorage'
import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// Mock fs and os modules
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    mkdir: jest.fn(),
    readdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn()
  }
}))

jest.mock('os', () => ({
  homedir: jest.fn(() => '/mock/home')
}))

const mockFs = fs as jest.Mocked<typeof fs>

describe('FileStorage - Related Actions', () => {
  let fileStorage: FileStorage

  beforeEach(() => {
    jest.clearAllMocks()
    fileStorage = new FileStorage()
  })

  describe('getRelatedActionItems', () => {
    it('should return empty array when no audience provided', async () => {
      const result = await fileStorage.getRelatedActionItems([])
      expect(result).toEqual([])
    })

    it('should return actions from notes with matching audience members', async () => {
      const today = new Date()
      const todayStr = today.toISOString()
      const todayDate = today.toISOString().split('T')[0]

      mockFs.access.mockResolvedValue(undefined)
      mockFs.readdir.mockResolvedValue(['note1.md', 'note2.md'] as any)

      mockFs.readFile
        .mockResolvedValueOnce(`---
date: '${todayDate}'
created_at: '${todayStr}'
updated_at: '${todayStr}'
audience:
  - Sarah
  - Bob
---

#Project @Sarah @Bob
[] Sarah: Review roadmap
Sarah -> Bob needs approval
`)
        .mockResolvedValueOnce(`---
date: '${todayDate}'
created_at: '${todayStr}'
updated_at: '${todayStr}'
audience:
  - Alice
---

#Design @Alice
[] Alice: Create mockups
`)

      const result = await fileStorage.getRelatedActionItems(['Sarah'])

      expect(result).toHaveLength(1)
      expect(result[0].noteTitle).toBe('#Project @Sarah @Bob')
      expect(result[0].actions).toHaveLength(1)
      expect(result[0].actions[0].text).toBe('Sarah: Review roadmap')
      expect(result[0].actions[0].completed).toBe(false)
      expect(result[0].connections).toHaveLength(1)
      // Full connection text is now stored including both sides of arrow
      expect(result[0].connections[0].subject).toBe('Sarah -> Bob needs approval')
    })

    it('should filter out notes older than 30 days', async () => {
      const thirtyOneDaysAgo = new Date()
      thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31)
      const oldDate = thirtyOneDaysAgo.toISOString()
      const oldDateStr = thirtyOneDaysAgo.toISOString().split('T')[0]

      const today = new Date()
      const todayStr = today.toISOString()
      const todayDate = today.toISOString().split('T')[0]

      mockFs.access.mockResolvedValue(undefined)
      mockFs.readdir.mockResolvedValue(['old.md', 'new.md'] as any)

      mockFs.readFile
        .mockResolvedValueOnce(`---
date: '${oldDateStr}'
created_at: '${oldDate}'
updated_at: '${oldDate}'
audience:
  - Sarah
---

#Old @Sarah
[] Sarah: Old task
`)
        .mockResolvedValueOnce(`---
date: '${todayDate}'
created_at: '${todayStr}'
updated_at: '${todayStr}'
audience:
  - Sarah
---

#New @Sarah
[] Sarah: New task
`)

      const result = await fileStorage.getRelatedActionItems(['Sarah'], 30)

      expect(result).toHaveLength(1)
      expect(result[0].noteTitle).toBe('#New @Sarah')
    })

    it('should match ANY audience member (OR logic)', async () => {
      const today = new Date()
      const todayStr = today.toISOString()
      const todayDate = today.toISOString().split('T')[0]

      mockFs.access.mockResolvedValue(undefined)
      mockFs.readdir.mockResolvedValue(['note1.md', 'note2.md', 'note3.md'] as any)

      mockFs.readFile
        .mockResolvedValueOnce(`---
date: '${todayDate}'
created_at: '${todayStr}'
updated_at: '${todayStr}'
audience:
  - Sarah
---

#Note1 @Sarah
[] Task 1
`)
        .mockResolvedValueOnce(`---
date: '${todayDate}'
created_at: '${todayStr}'
updated_at: '${todayStr}'
audience:
  - Bob
---

#Note2 @Bob
[] Task 2
`)
        .mockResolvedValueOnce(`---
date: '${todayDate}'
created_at: '${todayStr}'
updated_at: '${todayStr}'
audience:
  - Alice
---

#Note3 @Alice
[] Task 3
`)

      const result = await fileStorage.getRelatedActionItems(['Sarah', 'Bob'])

      expect(result).toHaveLength(2)
      expect(result.find(r => r.noteTitle === '#Note1 @Sarah')).toBeDefined()
      expect(result.find(r => r.noteTitle === '#Note2 @Bob')).toBeDefined()
    })

    it('should include all notes with actions (filtering happens in UI)', async () => {
      const today = new Date()
      const todayStr = today.toISOString()
      const todayDate = today.toISOString().split('T')[0]

      mockFs.access.mockResolvedValue(undefined)
      mockFs.readdir.mockResolvedValue(['completed.md', 'incomplete.md'] as any)

      mockFs.readFile
        .mockResolvedValueOnce(`---
date: '${todayDate}'
created_at: '${todayStr}'
updated_at: '${todayStr}'
audience:
  - Sarah
---

#Completed @Sarah
[x] All done
Sarah -x> Everything finished
`)
        .mockResolvedValueOnce(`---
date: '${todayDate}'
created_at: '${todayStr}'
updated_at: '${todayStr}'
audience:
  - Sarah
---

#Incomplete @Sarah
[] Not done
Task -> Still pending
`)

      const result = await fileStorage.getRelatedActionItems(['Sarah'])

      // Both notes are returned, filtering to incomplete happens in UI
      expect(result).toHaveLength(2)

      const completedNote = result.find(r => r.noteTitle === '#Completed @Sarah')
      expect(completedNote).toBeDefined()
      expect(completedNote?.actions[0].completed).toBe(true)

      const incompleteNote = result.find(r => r.noteTitle === '#Incomplete @Sarah')
      expect(incompleteNote).toBeDefined()
      expect(incompleteNote?.actions[0].completed).toBe(false)
    })

    it('should parse different connection formats correctly', async () => {
      const today = new Date()
      const todayStr = today.toISOString()
      const todayDate = today.toISOString().split('T')[0]

      mockFs.access.mockResolvedValue(undefined)
      mockFs.readdir.mockResolvedValue(['note.md'] as any)

      mockFs.readFile.mockResolvedValueOnce(`---
date: '${todayDate}'
created_at: '${todayStr}'
updated_at: '${todayStr}'
audience:
  - Sarah
---

#Test @Sarah
Subject -> Right incomplete
Subject -x> Right complete
Subject <- Left incomplete
Subject <x- Left complete
`)

      const result = await fileStorage.getRelatedActionItems(['Sarah'])

      expect(result).toHaveLength(1)
      expect(result[0].connections).toHaveLength(4)

      // Full connection text is now stored including both sides of arrow
      const rightIncomplete = result[0].connections.find(c => c.subject === 'Subject -> Right incomplete')
      expect(rightIncomplete?.direction).toBe('right')
      expect(rightIncomplete?.completed).toBe(false)

      const rightComplete = result[0].connections.find(c => c.subject === 'Subject -x> Right complete')
      expect(rightComplete?.direction).toBe('right')
      expect(rightComplete?.completed).toBe(true)

      const leftIncomplete = result[0].connections.find(c => c.subject === 'Subject <- Left incomplete')
      expect(leftIncomplete?.direction).toBe('left')
      expect(leftIncomplete?.completed).toBe(false)

      const leftComplete = result[0].connections.find(c => c.subject === 'Subject <x- Left complete')
      expect(leftComplete?.direction).toBe('left')
      expect(leftComplete?.completed).toBe(true)
    })

    it('should handle audience names with @ prefix', async () => {
      const today = new Date()
      const todayStr = today.toISOString()
      const todayDate = today.toISOString().split('T')[0]

      mockFs.access.mockResolvedValue(undefined)
      mockFs.readdir.mockResolvedValue(['note.md'] as any)

      mockFs.readFile.mockResolvedValueOnce(`---
date: '${todayDate}'
created_at: '${todayStr}'
updated_at: '${todayStr}'
audience:
  - '@Sarah'
---

#Test @Sarah
[] Task
`)

      const result = await fileStorage.getRelatedActionItems(['Sarah'])

      expect(result).toHaveLength(1)
      expect(result[0].noteTitle).toBe('#Test @Sarah')
    })

    it('should exclude note when excludeNoteId is provided', async () => {
      const today = new Date()
      const todayStr = today.toISOString()
      const todayDate = today.toISOString().split('T')[0]

      mockFs.access.mockResolvedValue(undefined)
      mockFs.readdir.mockResolvedValue(['note1.md', 'note2.md', 'note3.md'] as any)

      mockFs.readFile
        .mockResolvedValueOnce(`---
date: '${todayDate}'
created_at: '${todayStr}'
updated_at: '${todayStr}'
audience:
  - Sarah
---

#Note1 @Sarah
[] Task 1
`)
        .mockResolvedValueOnce(`---
date: '${todayDate}'
created_at: '${todayStr}'
updated_at: '${todayStr}'
audience:
  - Sarah
---

#Note2 @Sarah
[] Task 2
`)
        .mockResolvedValueOnce(`---
date: '${todayDate}'
created_at: '${todayStr}'
updated_at: '${todayStr}'
audience:
  - Sarah
---

#Note3 @Sarah
[] Task 3
`)

      // Exclude note2.md from results
      const result = await fileStorage.getRelatedActionItems(['Sarah'], 30, 'note2.md')

      expect(result).toHaveLength(2)
      expect(result.find(r => r.noteId === 'note1.md')).toBeDefined()
      expect(result.find(r => r.noteId === 'note2.md')).toBeUndefined()
      expect(result.find(r => r.noteId === 'note3.md')).toBeDefined()
    })

    it('should capture full multi-word connection text', async () => {
      const today = new Date()
      const todayStr = today.toISOString()
      const todayDate = today.toISOString().split('T')[0]

      mockFs.access.mockResolvedValue(undefined)
      mockFs.readdir.mockResolvedValue(['note.md'] as any)

      mockFs.readFile.mockResolvedValueOnce(`---
date: '${todayDate}'
created_at: '${todayStr}'
updated_at: '${todayStr}'
audience:
  - Sarah
---

#Test @Sarah
Jon Smith -> Sarah Jones for review
Alice from Marketing <- Bob from Engineering
`)

      const result = await fileStorage.getRelatedActionItems(['Sarah'])

      expect(result).toHaveLength(1)
      expect(result[0].connections).toHaveLength(2)

      // Full multi-word text should be captured on both sides of arrow
      expect(result[0].connections[0].subject).toBe('Jon Smith -> Sarah Jones for review')
      expect(result[0].connections[1].subject).toBe('Alice from Marketing <- Bob from Engineering')
    })
  })
})
