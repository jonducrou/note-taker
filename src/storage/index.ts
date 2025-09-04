import { promises as fs } from 'fs'
import { join } from 'path'
import { format } from 'date-fns'
import matter from 'gray-matter'
import { Note, ActionItem, Connection } from '../types'

export class FileStorage {
  private notesDir: string

  constructor(notesDir: string) {
    this.notesDir = notesDir
  }

  async ensureNotesDir(): Promise<void> {
    try {
      await fs.mkdir(this.notesDir, { recursive: true })
    } catch (error) {
      console.error('Failed to create notes directory:', error)
    }
  }

  private generateNoteId(group?: string): string {
    const date = format(new Date(), 'yyyy-MM-dd')
    const time = format(new Date(), 'HHmm')
    const groupPart = group ? `_${group}` : ''
    return `${date}${groupPart}_${time}`
  }

  private generateFilePath(id: string): string {
    return join(this.notesDir, `${id}.md`)
  }

  private extractDateFromFilename(id: string): Date {
    try {
      // Extract date and time from filename: YYYY-MM-DD_Group_HHMM or YYYY-MM-DD_HHMM
      const parts = id.split('_')
      const datePart = parts[0] // YYYY-MM-DD
      const timePart = parts[parts.length - 1] // HHMM (last part)
      
      const [year, month, day] = datePart.split('-').map(Number)
      const hour = parseInt(timePart.substring(0, 2))
      const minute = parseInt(timePart.substring(2, 4))
      
      return new Date(year, month - 1, day, hour, minute)
    } catch (error) {
      console.error(`Failed to parse date from filename ${id}:`, error)
      // Fallback to current date
      return new Date()
    }
  }

  parseNoteContent(content: string): { group?: string; audience: string[]; cleanContent: string } {
    const lines = content.split('\n')
    let group: string | undefined
    let audience: string[] = []
    const cleanLines: string[] = []

    for (const line of lines) {
      const groupMatch = line.match(/^@group:(\w+)/)
      if (groupMatch) {
        group = groupMatch[1]
        continue
      }

      const audienceMatch = line.match(/^@audience:(.+)/)
      if (audienceMatch) {
        audience = audienceMatch[1]
          .split(',')
          .map(a => a.trim())
          .filter(a => a.length > 0)
        continue
      }

      cleanLines.push(line)
    }

    return {
      group,
      audience,
      cleanContent: cleanLines.join('\n').trim()
    }
  }

  async saveNote(content: string, group?: string, audience: string[] = []): Promise<Note> {
    await this.ensureNotesDir()

    const { group: parsedGroup, audience: parsedAudience, cleanContent } = this.parseNoteContent(content)
    const finalGroup = group || parsedGroup
    const finalAudience = audience.length > 0 ? audience : parsedAudience

    const now = new Date()
    const id = this.generateNoteId(finalGroup)
    const filePath = this.generateFilePath(id)

    const frontMatter = {
      date: format(now, 'yyyy-MM-dd'),
      group: finalGroup,
      audience: finalAudience,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    }

    const fileContent = matter.stringify(cleanContent, frontMatter)

    try {
      await fs.writeFile(filePath, fileContent, 'utf-8')
    } catch (error) {
      console.error('Failed to save note:', error)
      throw error
    }

    return {
      id,
      content,
      group: finalGroup,
      audience: finalAudience,
      createdAt: now,
      updatedAt: now,
      filePath
    }
  }

  async loadNotes(): Promise<Note[]> {
    await this.ensureNotesDir()

    try {
      const files = await fs.readdir(this.notesDir)
      const mdFiles = files.filter(file => file.endsWith('.md'))

      const notes: Note[] = []

      for (const file of mdFiles) {
        const filePath = join(this.notesDir, file)
        const fileContent = await fs.readFile(filePath, 'utf-8')
        
        try {
          const parsed = matter(fileContent)
          const data = parsed.data as any

          const note: Note = {
            id: file.replace('.md', ''),
            content: parsed.content,
            group: data.group,
            audience: data.audience || [],
            createdAt: new Date(data.created_at),
            updatedAt: new Date(data.updated_at || data.created_at),
            filePath
          }

          notes.push(note)
        } catch (error) {
          console.error(`Failed to parse note ${file}:`, error)
        }
      }

      // Sort by filename date (newest first) instead of file modification time
      return notes.sort((a, b) => {
        const dateA = this.extractDateFromFilename(a.id)
        const dateB = this.extractDateFromFilename(b.id)
        return dateB.getTime() - dateA.getTime()
      })
    } catch (error) {
      console.error('Failed to load notes:', error)
      return []
    }
  }

  async loadNote(id: string): Promise<Note | null> {
    const filePath = this.generateFilePath(id)

    try {
      const fileContent = await fs.readFile(filePath, 'utf-8')
      const parsed = matter(fileContent)
      const data = parsed.data as any

      return {
        id,
        content: parsed.content,
        group: data.group,
        audience: data.audience || [],
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at || data.created_at),
        filePath
      }
    } catch (error) {
      console.error(`Failed to load note ${id}:`, error)
      return null
    }
  }

  async deleteNote(id: string): Promise<boolean> {
    const filePath = this.generateFilePath(id)

    try {
      await fs.unlink(filePath)
      return true
    } catch (error) {
      console.error(`Failed to delete note ${id}:`, error)
      return false
    }
  }

  extractIncompleteItems(content: string, noteId: string): { actions: ActionItem[]; connections: Connection[] } {
    const lines = content.split('\n')
    const actions: ActionItem[] = []
    const connections: Connection[] = []

    lines.forEach((line, index) => {
      // Extract incomplete actions []
      const actionMatches = line.matchAll(/\[\s*\]/g)
      for (const match of actionMatches) {
        const text = line.substring(match.index! + match[0].length).trim()
        if (text) {
          actions.push({
            text,
            completed: false,
            noteId,
            line: index + 1
          })
        }
      }

      // Extract incomplete forward connections ->
      const forwardMatches = line.matchAll(/(\w+)\s*->\s*(\w+)/g)
      for (const match of forwardMatches) {
        connections.push({
          from: match[1],
          to: match[2],
          completed: false,
          noteId,
          line: index + 1,
          direction: 'forward'
        })
      }

      // Extract incomplete backward connections <-
      const backwardMatches = line.matchAll(/(\w+)\s*<-\s*(\w+)/g)
      for (const match of backwardMatches) {
        connections.push({
          from: match[2], // Note: reversed for backward connections
          to: match[1],
          completed: false,
          noteId,
          line: index + 1,
          direction: 'backward'
        })
      }
    })

    return { actions, connections }
  }

  async getIncompleteItems(): Promise<{ actions: ActionItem[]; connections: Connection[]; totalCount: number }> {
    const notes = await this.loadNotes()
    const allActions: ActionItem[] = []
    const allConnections: Connection[] = []

    for (const note of notes) {
      const { actions, connections } = this.extractIncompleteItems(note.content, note.id)
      allActions.push(...actions)
      allConnections.push(...connections)
    }

    return {
      actions: allActions,
      connections: allConnections,
      totalCount: allActions.length + allConnections.length
    }
  }

  countIncompleteItems(content: string): number {
    const lines = content.split('\n')
    let count = 0
    
    for (const line of lines) {
      // Count incomplete actions []
      const incompleteActions = (line.match(/\[\s*\]/g) || []).length
      count += incompleteActions
      
      // Count incomplete connections -> and <-
      const incompleteForward = (line.match(/\w+\s*->\s*\w+/g) || []).length
      const incompleteBackward = (line.match(/\w+\s*<-\s*\w+/g) || []).length
      count += incompleteForward + incompleteBackward
    }
    
    return count
  }

  async getGroups(): Promise<string[]> {
    const notes = await this.loadNotes()
    const groups = new Set<string>()
    
    notes.forEach(note => {
      if (note.group) {
        groups.add(note.group)
      }
    })

    return Array.from(groups).sort()
  }

  async getAudience(): Promise<string[]> {
    const notes = await this.loadNotes()
    const audience = new Set<string>()
    
    notes.forEach(note => {
      note.audience.forEach(person => audience.add(person))
    })

    return Array.from(audience).sort()
  }

  /**
   * Get the ID of the next note (older note in chronological order)
   * Navigation stops at the last note instead of wrapping
   * @param currentNoteId - The ID of the current note
   * @param skipNotesWithoutOpenActions - Skip notes with no incomplete items (default: false)
   * @returns The ID of the next note, or null if no next note or error
   */
  async getNextNoteId(currentNoteId: string, skipNotesWithoutOpenActions: boolean = false): Promise<string | null> {
    try {
      const notes = await this.loadNotes()
      
      // Return null if no notes or only one note
      if (notes.length <= 1) {
        return null
      }
      
      // Find current note index
      const currentIndex = notes.findIndex(note => note.id === currentNoteId)
      
      // Return null if current note not found
      if (currentIndex === -1) {
        return null
      }
      
      // Look for next note, starting from the note after current
      for (let i = currentIndex + 1; i < notes.length; i++) {
        const candidate = notes[i]
        
        // If not skipping based on actions, return first next note
        if (!skipNotesWithoutOpenActions) {
          return candidate.id
        }
        
        // If skipping, check if this note has open actions
        const incompleteCount = this.countIncompleteItems(candidate.content)
        if (incompleteCount > 0) {
          return candidate.id
        }
      }
      
      // If skipping and no note with open actions found, return last note
      if (skipNotesWithoutOpenActions && currentIndex < notes.length - 1) {
        return notes[notes.length - 1].id
      }
      
      // No suitable next note found
      return null
      
    } catch (error) {
      console.error('Failed to get next note ID:', error)
      return null
    }
  }

  /**
   * Get the ID of the previous note (newer note in chronological order)  
   * Navigation stops at the first note instead of wrapping
   * @param currentNoteId - The ID of the current note
   * @param skipNotesWithoutOpenActions - Skip notes with no incomplete items (default: false)
   * @returns The ID of the previous note, or null if no previous note or error
   */
  async getPreviousNoteId(currentNoteId: string, skipNotesWithoutOpenActions: boolean = false): Promise<string | null> {
    try {
      const notes = await this.loadNotes()
      
      // Return null if no notes or only one note
      if (notes.length <= 1) {
        return null
      }
      
      // Find current note index
      const currentIndex = notes.findIndex(note => note.id === currentNoteId)
      
      // Return null if current note not found
      if (currentIndex === -1) {
        return null
      }
      
      // Look for previous note, starting from the note before current
      for (let i = currentIndex - 1; i >= 0; i--) {
        const candidate = notes[i]
        
        // If not skipping based on actions, return first previous note
        if (!skipNotesWithoutOpenActions) {
          return candidate.id
        }
        
        // If skipping, check if this note has open actions
        const incompleteCount = this.countIncompleteItems(candidate.content)
        if (incompleteCount > 0) {
          return candidate.id
        }
      }
      
      // If skipping and no note with open actions found, return first note
      if (skipNotesWithoutOpenActions && currentIndex > 0) {
        return notes[0].id
      }
      
      // No suitable previous note found
      return null
      
    } catch (error) {
      console.error('Failed to get previous note ID:', error)
      return null
    }
  }
}