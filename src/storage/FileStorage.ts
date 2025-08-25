import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import * as yaml from 'js-yaml'

export interface NoteMetadata {
  date: string
  group?: string
  audience?: string[]
  created_at: string
  updated_at: string
}

export interface Note {
  id: string
  filename: string
  metadata: NoteMetadata
  content: string
}

export class FileStorage {
  private notesDir: string

  constructor() {
    this.notesDir = join(homedir(), 'Documents', 'Notes')
  }

  async ensureNotesDirectory(): Promise<void> {
    try {
      await fs.access(this.notesDir)
    } catch {
      await fs.mkdir(this.notesDir, { recursive: true })
    }
  }

  extractMetadata(content: string): { group?: string; audience?: string[] } {
    const groupMatch = content.match(/#([^\s#@]+)/i)
    const audienceMatch = content.match(/@audience:([^\n@]+)/i)
    
    const group = groupMatch ? groupMatch[1].trim() : undefined
    const audience = audienceMatch 
      ? audienceMatch[1].split(',').map(a => a.trim()).filter(a => a)
      : undefined

    return { group, audience }
  }

  generateFilename(): string {
    const now = new Date()
    const date = now.toISOString().split('T')[0] // YYYY-MM-DD
    const time = now.toTimeString().slice(0, 8).replace(/:/g, '') // HHMMSS
    return `${date}_${time}.md`
  }

  formatNoteContent(content: string, metadata: NoteMetadata): string {
    const frontmatter = yaml.dump(metadata)
    return `---\n${frontmatter}---\n\n${content}`
  }

  parseNoteContent(fileContent: string): { metadata: NoteMetadata; content: string } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/
    const match = fileContent.match(frontmatterRegex)
    
    if (match) {
      const metadata = yaml.load(match[1]) as NoteMetadata
      const content = match[2]
      return { metadata, content }
    }
    
    // Fallback for files without frontmatter
    const extracted = this.extractMetadata(fileContent)
    const now = new Date().toISOString()
    const metadata: NoteMetadata = {
      date: now.split('T')[0],
      group: extracted.group,
      audience: extracted.audience,
      created_at: now,
      updated_at: now
    }
    
    return { metadata, content: fileContent }
  }

  async saveNote(content: string, group?: string, audience?: string[]): Promise<{ id: string; success: boolean }> {
    try {
      await this.ensureNotesDirectory()
      
      const extracted = this.extractMetadata(content)
      const finalGroup = group || extracted.group
      const finalAudience = audience || extracted.audience

      const filename = this.generateFilename()
      const now = new Date().toISOString()
      
      const metadata: NoteMetadata = {
        date: now.split('T')[0],
        group: finalGroup,
        audience: finalAudience,
        created_at: now,
        updated_at: now
      }

      const formattedContent = this.formatNoteContent(content, metadata)
      const filePath = join(this.notesDir, filename)
      
      await fs.writeFile(filePath, formattedContent, 'utf-8')
      
      return { id: filename, success: true }
    } catch (error) {
      console.error('Failed to save note:', error)
      return { id: '', success: false }
    }
  }

  async updateExistingNote(noteId: string, content: string): Promise<void> {
    try {
      await this.ensureNotesDirectory()
      const filePath = join(this.notesDir, noteId)
      
      // Read existing file to preserve created_at timestamp
      const existingContent = await fs.readFile(filePath, 'utf-8')
      const { metadata: existingMetadata } = this.parseNoteContent(existingContent)
      
      // Extract new metadata from content
      const extracted = this.extractMetadata(content)
      
      // Update metadata but preserve created_at
      const updatedMetadata: NoteMetadata = {
        ...existingMetadata,
        group: extracted.group || existingMetadata.group,
        audience: extracted.audience || existingMetadata.audience,
        updated_at: new Date().toISOString()
      }
      
      const formattedContent = this.formatNoteContent(content, updatedMetadata)
      await fs.writeFile(filePath, formattedContent, 'utf-8')
    } catch (error) {
      console.error('Failed to update existing note:', error)
      throw error
    }
  }

  async loadNotes(): Promise<Note[]> {
    try {
      await this.ensureNotesDirectory()
      const files = await fs.readdir(this.notesDir)
      const markdownFiles = files.filter(file => file.endsWith('.md'))
      
      const notes: Note[] = []
      
      for (const filename of markdownFiles) {
        try {
          const filePath = join(this.notesDir, filename)
          const fileContent = await fs.readFile(filePath, 'utf-8')
          const { metadata, content } = this.parseNoteContent(fileContent)
          
          notes.push({
            id: filename,
            filename,
            metadata,
            content
          })
        } catch (error) {
          console.error(`Failed to load note ${filename}:`, error)
        }
      }
      
      // Sort by updated_at descending (most recent first)
      notes.sort((a, b) => new Date(b.metadata.updated_at).getTime() - new Date(a.metadata.updated_at).getTime())
      
      return notes
    } catch (error) {
      console.error('Failed to load notes:', error)
      return []
    }
  }

  async loadMostRecentNote(): Promise<Note | null> {
    const notes = await this.loadNotes()
    return notes.length > 0 ? notes[0] : null
  }

  async searchNotes(query: string): Promise<Note[]> {
    const notes = await this.loadNotes()
    const lowerQuery = query.toLowerCase()
    
    return notes.filter(note => 
      note.content.toLowerCase().includes(lowerQuery) ||
      note.metadata.group?.toLowerCase().includes(lowerQuery) ||
      note.metadata.audience?.some(a => a.toLowerCase().includes(lowerQuery))
    )
  }

  async getGroupSuggestions(): Promise<string[]> {
    const notes = await this.loadNotes()
    const groups = new Set<string>()
    
    notes.forEach(note => {
      if (note.metadata.group) {
        groups.add(note.metadata.group)
      }
    })
    
    return Array.from(groups).sort()
  }

  async getAudienceSuggestions(): Promise<string[]> {
    const notes = await this.loadNotes()
    const audience = new Set<string>()
    
    notes.forEach(note => {
      note.metadata.audience?.forEach(a => audience.add(a))
    })
    
    return Array.from(audience).sort()
  }

  async getRecentGroupSuggestions(prefix?: string): Promise<string[]> {
    const twoWeeksAgo = new Date()
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
    const twoWeeksAgoStr = twoWeeksAgo.toISOString().split('T')[0]
    
    const notes = await this.loadNotes()
    const groups = new Set<string>()
    
    notes.forEach(note => {
      const noteDate = typeof note.metadata.date === 'string' 
        ? note.metadata.date 
        : new Date(note.metadata.date).toISOString().split('T')[0]
      
      if (noteDate >= twoWeeksAgoStr && note.metadata.group) {
        groups.add(note.metadata.group)
      }
    })
    
    let results = Array.from(groups).sort()
    
    if (prefix) {
      const lowerPrefix = prefix.toLowerCase()
      results = results.filter(group => 
        group.toLowerCase().startsWith(lowerPrefix)
      )
    }
    
    return results
  }

  async getRecentAudienceSuggestions(prefix?: string): Promise<string[]> {
    const twoWeeksAgo = new Date()
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
    const twoWeeksAgoStr = twoWeeksAgo.toISOString().split('T')[0]
    
    const notes = await this.loadNotes()
    const audience = new Set<string>()
    
    notes.forEach(note => {
      const noteDate = typeof note.metadata.date === 'string' 
        ? note.metadata.date 
        : new Date(note.metadata.date).toISOString().split('T')[0]
      
      if (noteDate >= twoWeeksAgoStr && note.metadata.audience) {
        note.metadata.audience.forEach(a => audience.add(a))
      }
    })
    
    let results = Array.from(audience).sort()
    
    if (prefix) {
      const lowerPrefix = prefix.toLowerCase()
      results = results.filter(person => 
        person.toLowerCase().startsWith(lowerPrefix)
      )
    }
    
    return results
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

  async getNotesForToday(): Promise<Note[]> {
    const today = new Date().toISOString().split('T')[0]
    const notes = await this.loadNotes()
    return notes.filter(note => {
      const noteDate = typeof note.metadata.date === 'string' 
        ? note.metadata.date 
        : new Date(note.metadata.date).toISOString().split('T')[0]
      return noteDate === today
    })
  }

  async getNotesForYesterday(): Promise<Note[]> {
    const notes = await this.loadNotes()
    const noteDates = [...new Set(notes.map(note => {
      return typeof note.metadata.date === 'string' 
        ? note.metadata.date 
        : new Date(note.metadata.date).toISOString().split('T')[0]
    }))]
      .sort((a, b) => b.localeCompare(a)) // Most recent first
    
    const today = new Date().toISOString().split('T')[0]
    const yesterdayDate = noteDates.find(date => date < today)
    
    if (!yesterdayDate) return []
    
    return notes.filter(note => {
      const noteDate = typeof note.metadata.date === 'string' 
        ? note.metadata.date 
        : new Date(note.metadata.date).toISOString().split('T')[0]
      return noteDate === yesterdayDate
    })
  }

  async getNotesForPreviousWeek(): Promise<Note[]> {
    const today = new Date()
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const todayStr = today.toISOString().split('T')[0]
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]
    
    const notes = await this.loadNotes()
    return notes.filter(note => {
      const noteDate = typeof note.metadata.date === 'string' 
        ? note.metadata.date 
        : new Date(note.metadata.date).toISOString().split('T')[0]
      return noteDate < todayStr && noteDate >= sevenDaysAgoStr
    })
  }

  groupNotesByGroupAndAudience(notes: Note[]): { [key: string]: Note[] } {
    const grouped: { [key: string]: Note[] } = {}
    
    notes.forEach(note => {
      const group = note.metadata.group || 'No Group'
      const audience = note.metadata.audience?.join(',') || ''
      const key = audience ? `${group} @${audience}` : group
      
      if (!grouped[key]) {
        grouped[key] = []
      }
      grouped[key].push(note)
    })
    
    // Add numbers if there are duplicates
    const finalGrouped: { [key: string]: Note[] } = {}
    Object.entries(grouped).forEach(([key, notesList]) => {
      if (notesList.length === 1) {
        finalGrouped[key] = notesList
      } else {
        notesList.forEach((note, index) => {
          finalGrouped[`${key} (${index + 1})`] = [note]
        })
      }
    })
    
    return finalGrouped
  }
}