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

  private getLocalDateString(date: Date = new Date()): string {
    // Get local date string in YYYY-MM-DD format
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
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
    
    // Match both old format (@audience:name1,name2) and new format (@name)
    const audienceOldMatch = content.match(/@audience:([^\n@]+)/i)
    const audienceNewMatches = content.match(/@([a-zA-Z][a-zA-Z0-9_-]*)/g)
    
    const group = groupMatch ? groupMatch[1].trim() : undefined
    
    let audience: string[] | undefined
    if (audienceOldMatch) {
      // Old format: @audience:name1,name2
      audience = audienceOldMatch[1].split(',').map(a => a.trim()).filter(a => a)
    } else if (audienceNewMatches) {
      // New format: @name @name2 (extract just the names without @)
      // Filter out the word "audience" itself
      audience = audienceNewMatches
        .map(match => match.slice(1))
        .filter(a => a && a.toLowerCase() !== 'audience')
    }

    return { group, audience }
  }

  generateFilename(): string {
    const now = new Date()
    const date = this.getLocalDateString(now)
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
    const now = new Date()
    const nowISO = now.toISOString()
    const metadata: NoteMetadata = {
      date: this.getLocalDateString(now),
      group: extracted.group,
      audience: extracted.audience,
      created_at: nowISO,
      updated_at: nowISO
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
      const now = new Date()
      const nowISO = now.toISOString()
      
      const metadata: NoteMetadata = {
        date: this.getLocalDateString(now),
        group: finalGroup,
        audience: finalAudience,
        created_at: nowISO,
        updated_at: nowISO
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
    const twoWeeksAgoStr = this.getLocalDateString(twoWeeksAgo)
    
    const notes = await this.loadNotes()
    const groups = new Set<string>()
    
    notes.forEach(note => {
      const noteDate = typeof note.metadata.date === 'string' 
        ? note.metadata.date 
        : this.getLocalDateString(new Date(note.metadata.date))
      
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
    const twoWeeksAgoStr = this.getLocalDateString(twoWeeksAgo)
    
    const notes = await this.loadNotes()
    const audience = new Set<string>()
    
    notes.forEach(note => {
      const noteDate = typeof note.metadata.date === 'string' 
        ? note.metadata.date 
        : this.getLocalDateString(new Date(note.metadata.date))
      
      if (noteDate >= twoWeeksAgoStr && note.metadata.audience) {
        note.metadata.audience.forEach(a => {
          // Remove @ prefix if it exists (for backwards compatibility)
          const cleanName = a.startsWith('@') ? a.slice(1) : a
          if (cleanName) {
            audience.add(cleanName)
          }
        })
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
    const today = this.getLocalDateString()
    const notes = await this.loadNotes()
    return notes.filter(note => {
      const noteDate = typeof note.metadata.date === 'string' 
        ? note.metadata.date 
        : this.getLocalDateString(new Date(note.metadata.date))
      return noteDate === today
    })
  }

  async getNotesForYesterday(): Promise<Note[]> {
    const notes = await this.loadNotes()
    const noteDates = [...new Set(notes.map(note => {
      return typeof note.metadata.date === 'string' 
        ? note.metadata.date 
        : this.getLocalDateString(new Date(note.metadata.date))
    }))]
      .sort((a, b) => b.localeCompare(a)) // Most recent first
    
    const today = this.getLocalDateString()
    const yesterdayDate = noteDates.find(date => date < today)
    
    if (!yesterdayDate) return []
    
    return notes.filter(note => {
      const noteDate = typeof note.metadata.date === 'string' 
        ? note.metadata.date 
        : this.getLocalDateString(new Date(note.metadata.date))
      return noteDate === yesterdayDate
    })
  }

  async getNotesForPreviousWeek(): Promise<Note[]> {
    const today = new Date()
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const todayStr = this.getLocalDateString(today)
    const sevenDaysAgoStr = this.getLocalDateString(sevenDaysAgo)
    
    const notes = await this.loadNotes()
    return notes.filter(note => {
      const noteDate = typeof note.metadata.date === 'string' 
        ? note.metadata.date 
        : this.getLocalDateString(new Date(note.metadata.date))
      return noteDate < todayStr && noteDate >= sevenDaysAgoStr
    })
  }

  async getNotesForPriorWeek(): Promise<Note[]> {
    const today = new Date()
    const notes = await this.loadNotes()
    const noteDates = [...new Set(notes.map(note => {
      return typeof note.metadata.date === 'string' 
        ? note.metadata.date 
        : this.getLocalDateString(new Date(note.metadata.date))
    }))]
      .sort((a, b) => b.localeCompare(a)) // Most recent first
    
    const todayStr = this.getLocalDateString(today)
    const yesterdayDate = noteDates.find(date => date < todayStr)
    
    if (!yesterdayDate) return []
    
    // Get 7 days prior to yesterday
    const yesterdayDateObj = new Date(yesterdayDate + 'T00:00:00')
    const priorWeekStart = new Date(yesterdayDateObj.getTime() - 7 * 24 * 60 * 60 * 1000)
    const priorWeekEnd = new Date(yesterdayDateObj.getTime() - 1 * 24 * 60 * 60 * 1000) // Day before yesterday
    
    const priorWeekStartStr = this.getLocalDateString(priorWeekStart)
    const priorWeekEndStr = this.getLocalDateString(priorWeekEnd)
    
    return notes.filter(note => {
      const noteDate = typeof note.metadata.date === 'string' 
        ? note.metadata.date 
        : this.getLocalDateString(new Date(note.metadata.date))
      return noteDate >= priorWeekStartStr && noteDate <= priorWeekEndStr
    })
  }

  async getOpenNotesFromLastMonth(): Promise<Note[]> {
    const today = new Date()
    const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    const todayStr = this.getLocalDateString(today)
    const oneMonthAgoStr = this.getLocalDateString(oneMonthAgo)
    
    const notes = await this.loadNotes()
    return notes.filter(note => {
      const noteDate = typeof note.metadata.date === 'string' 
        ? note.metadata.date 
        : this.getLocalDateString(new Date(note.metadata.date))
      
      // Check if note is within the last month
      if (noteDate < oneMonthAgoStr || noteDate > todayStr) {
        return false
      }
      
      // Check if note has incomplete items ([] or -> or <-)
      const incompleteCount = this.countIncompleteItems(note.content)
      return incompleteCount > 0
    })
  }

  async getNotesGroupedByAudienceFromLastMonth(): Promise<{ [audience: string]: Note[] }> {
    const today = new Date()
    const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    const todayStr = this.getLocalDateString(today)
    const oneMonthAgoStr = this.getLocalDateString(oneMonthAgo)
    
    const notes = await this.loadNotes()
    const recentNotes = notes.filter(note => {
      const noteDate = typeof note.metadata.date === 'string' 
        ? note.metadata.date 
        : this.getLocalDateString(new Date(note.metadata.date))
      
      return noteDate >= oneMonthAgoStr && noteDate <= todayStr
    })
    
    const grouped: { [audience: string]: Note[] } = {}
    
    recentNotes.forEach(note => {
      if (note.metadata.audience && note.metadata.audience.length > 0) {
        note.metadata.audience.forEach(person => {
          // Clean up audience name (remove @ if present)
          const cleanPerson = person.startsWith('@') ? person.slice(1) : person
          if (cleanPerson) {
            if (!grouped[cleanPerson]) {
              grouped[cleanPerson] = []
            }
            grouped[cleanPerson].push(note)
          }
        })
      }
    })
    
    return grouped
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