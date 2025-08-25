import React, { useState, useCallback, useEffect, useRef } from 'react'
import './App.css'

const SimpleApp: React.FC = () => {
  const [content, setContent] = useState('')
  const [incompleteCount, setIncompleteCount] = useState(0)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null)
  const currentNoteIdRef = useRef<string | null>(null)
  
  // Keep ref in sync with state
  useEffect(() => {
    currentNoteIdRef.current = currentNoteId
  }, [currentNoteId])

  useEffect(() => {
    // Verify electronAPI is available and load recent note
    if (!(window as any).electronAPI) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error('ElectronAPI not available!')
    } else {
      // Don't load recent note - start with blank notepad
      
      // Listen for note loading from menu
      (window as any).electronAPI.onLoadNote(async (noteId: string) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        await loadNoteById(noteId)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps


  const loadNoteById = async (noteId: string) => {
    try {
      const note = await (window as any).electronAPI?.loadNoteById(noteId) // eslint-disable-line @typescript-eslint/no-explicit-any
      if (note) {
        setContent(note.content)
        setCurrentNoteId(noteId)
        const count = countIncompleteItems(note.content)
        setIncompleteCount(count)
        ;(window as any).electronAPI?.updateBadge(count) // eslint-disable-line @typescript-eslint/no-explicit-any
        setHasUnsavedChanges(false)
      }
    } catch (error) {
      console.error('Failed to load note by ID:', error)
    }
  }

  const createNewNote = async () => {
    try {
      if (hasUnsavedChanges && currentNoteId) {
        // Save current note first
        await (window as any).electronAPI?.updateExistingNote(currentNoteId, content) // eslint-disable-line @typescript-eslint/no-explicit-any
      }
      
      // Reset to empty note
      const newContent = ''
      setContent(newContent)
      setCurrentNoteId(null)
      setIncompleteCount(0)
      ;(window as any).electronAPI?.updateBadge(0) // eslint-disable-line @typescript-eslint/no-explicit-any
      setHasUnsavedChanges(false)
    } catch (error) {
      console.error('Failed to create new note:', error)
    }
  }

  const countIncompleteItems = useCallback((text: string) => {
    const lines = text.split('\n')
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
  }, [])

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    setContent(newContent)
    setHasUnsavedChanges(true)
    
    // Update incomplete count
    const count = countIncompleteItems(newContent)
    setIncompleteCount(count)
    
    // Update badge in menu bar
    ;(window as any).electronAPI?.updateBadge(count) // eslint-disable-line @typescript-eslint/no-explicit-any
    
    // Auto-save after 1 second of no typing
    setTimeout(async () => {
      try {
        const noteId = currentNoteIdRef.current
        console.log('Auto-save triggered. Current note ID:', noteId)
        if (noteId) {
          // Update existing note
          console.log('Updating existing note:', noteId)
          await (window as any).electronAPI?.updateExistingNote(noteId, newContent) // eslint-disable-line @typescript-eslint/no-explicit-any
        } else {
          // Create new note and track its ID
          console.log('Creating new note')
          const result = await (window as any).electronAPI?.saveNote(newContent) // eslint-disable-line @typescript-eslint/no-explicit-any
          console.log('Save result:', result)
          if (result?.id) {
            setCurrentNoteId(result.id)
            console.log('Set current note ID to:', result.id)
          }
        }
        setHasUnsavedChanges(false)
        console.log('Note saved')
      } catch (error) {
        console.error('Failed to save note:', error)
      }
    }, 1000)
  }, [countIncompleteItems])

  return (
    <div className="app">
      <div className="header">
        <div className="header-left">
          {incompleteCount > 0 && (
            <div className="incomplete-badge">
              {incompleteCount} incomplete
            </div>
          )}
        </div>
        <div className="header-right">
          <button 
            className="new-note-button"
            onClick={createNewNote}
            style={{
              background: 'rgba(0, 0, 0, 0.1)',
              border: '1px solid rgba(0, 0, 0, 0.2)',
              borderRadius: '4px',
              padding: '4px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              color: '#333'
            }}
          >
            New
          </button>
        </div>
      </div>
      
      <div className="editor-container">
        <textarea
          value={content}
          onChange={handleContentChange}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            outline: 'none',
            padding: '20px',
            fontSize: '10px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Monaco, Menlo, monospace',
            resize: 'none',
            background: 'transparent',
            lineHeight: '1.4'
          }}
          placeholder="Start typing... Use #group @audience: [] -> <- to add structure"
        />
      </div>
    </div>
  )
}

export default SimpleApp