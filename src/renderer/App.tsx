import React, { useState, useCallback, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import './App.css'


const App: React.FC = () => {
  const [content, setContent] = useState('')
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRecording, setIsRecording] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const currentNoteIdRef = useRef<string | null>(null)
  
  const formatNoteDate = (noteId: string): string => {
    try {
      // Extract date and time from note ID format: YYYY-MM-DD_HHMMSS or YYYY-MM-DD_group_HHMMSS
      const parts = noteId.split('_')
      const datePart = parts[0] // YYYY-MM-DD
      const timePart = parts[parts.length - 1] // HHMMSS (last part)
      
      // Parse the date
      const [year, month, day] = datePart.split('-').map(Number)
      const hour = parseInt(timePart.substring(0, 2))
      const minute = parseInt(timePart.substring(2, 4))
      
      const date = new Date(year, month - 1, day, hour, minute)
      
      // Format as "Tue 26 Aug 14:31"
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      
      const dayName = dayNames[date.getDay()]
      const dayNum = date.getDate()
      const monthName = monthNames[date.getMonth()]
      const formattedHour = hour.toString().padStart(2, '0')
      const formattedMinute = minute.toString().padStart(2, '0')
      
      return `${dayName} ${dayNum} ${monthName} ${formattedHour}:${formattedMinute}`
    } catch (error) {
      console.error('Failed to format note date:', error)
      return 'Note Taker'
    }
  }
  
  const updateWindowTitle = async (noteId: string | null) => {
    try {
      const title = noteId ? formatNoteDate(noteId) : 'Note Taker'
      await (window as any).electronAPI?.setWindowTitle(title)
    } catch (error) {
      console.error('Failed to update window title:', error)
    }
  }
  
  // Keep ref in sync with state and update window title
  useEffect(() => {
    currentNoteIdRef.current = currentNoteId
    updateWindowTitle(currentNoteId)
  }, [currentNoteId])
  
  const setupMonacoLanguage = useCallback((monaco: Monaco) => {
    // Register a new language for our note format
    monaco.languages.register({ id: 'notes' })

    // Define tokens for syntax highlighting
    monaco.languages.setMonarchTokensProvider('notes', {
      tokenizer: {
        root: [
          // Action lines - highlight entire line with [] or [x]
          [/.*\[\s*\].*$/, 'action.incomplete.line'],
          [/.*\[x\].*$/, 'action.complete.line'],
          
          // Connection lines - more flexible patterns that allow special chars, quotes, and audience tags
          // Match lines containing -> or <- patterns (more flexible - allows any characters before/after arrows)
          [/.*-[/\\]>.*$/, 'connection.complete.line'],
          [/.*<[/\\]-.*$/, 'connection.complete.line'],  
          [/.*->.*$/, 'connection.incomplete.line'],
          [/.*<-.*$/, 'connection.incomplete.line'],
          
          // Group tags - highlight just the tag (these will override line colors)
          [/#[a-zA-Z][a-zA-Z0-9_-]*/, 'tag.group'],
          
          // Audience tags - highlight just the tag (these will override line colors)
          [/@[a-zA-Z][a-zA-Z0-9_-]*/, 'tag.audience'],
        ]
      }
    })

    // Define colors for our custom tokens
    monaco.editor.defineTheme('notes-theme', {
      base: 'vs',
      inherit: true,
      rules: [
        // Full-line highlighting for actions and connections
        { token: 'action.incomplete.line', foreground: 'FF3B30', fontStyle: 'bold' },
        { token: 'action.complete.line', foreground: '34C759', fontStyle: 'bold' },
        { token: 'connection.incomplete.line', foreground: 'FF9500', fontStyle: 'bold' },
        { token: 'connection.complete.line', foreground: '34C759', fontStyle: 'bold' },
        
        // Just the tags themselves
        { token: 'tag.group', foreground: '0066CC', fontStyle: 'bold' },
        { token: 'tag.audience', foreground: '8E44AD', fontStyle: 'bold' },
      ],
      colors: {
        'editor.background': '#FFFFFF00', // Transparent background
        'editor.foreground': '#1D1D1F',
        'editor.lineHighlightBackground': '#FFFFFF00' // Remove line highlight
      }
    })

    // Register autocomplete provider for # and @ only
    monaco.languages.registerCompletionItemProvider('notes', {
      triggerCharacters: ['#', '@'],
      provideCompletionItems: async (model, position) => {
        const line = model.getLineContent(position.lineNumber)
        const textBeforeCursor = line.substring(0, position.column - 1)
        const suggestions: any[] = []

        // Check for group tag pattern: # anywhere followed by optional letters
        const groupMatch = textBeforeCursor.match(/#([a-zA-Z0-9_-]*)$/)
        if (groupMatch) {
          const prefix = groupMatch[1] || ''
          try {
            const groups = await (window as any).electronAPI?.getRecentGroupSuggestions(prefix)
            
            // Add some fallback suggestions if no recent ones exist
            let allGroups = groups || []
            if (allGroups.length === 0) {
              allGroups = ['eng', 'product', 'prodtech', 'external'].filter(g => 
                g.toLowerCase().startsWith(prefix.toLowerCase())
              )
            }
            
            if (allGroups.length > 0) {
              const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: position.column - prefix.length - 1, // Include the #
                endColumn: position.column,
              }

              allGroups.forEach((group: string) => {
                suggestions.push({
                  label: `#${group}`,
                  kind: monaco.languages.CompletionItemKind.Keyword,
                  insertText: `#${group}`,
                  range: range,
                  detail: 'Recent group',
                  sortText: '0' + group
                })
              })
            }
          } catch (error) {
            console.error('Failed to get recent group suggestions:', error)
          }
        }

        // Check for audience tag pattern: ends with @ followed by optional letters
        const audienceMatch = textBeforeCursor.match(/@([a-zA-Z0-9_-]*)$/)
        if (audienceMatch) {
          const prefix = audienceMatch[1] || ''
          try {
            const audience = await (window as any).electronAPI?.getRecentAudienceSuggestions(prefix)
            
            // Add some fallback suggestions if no recent ones exist
            let allAudience = audience || []
            if (allAudience.length === 0) {
              allAudience = ['team', 'manager', 'client', 'john', 'sarah'].filter(a => 
                a.toLowerCase().startsWith(prefix.toLowerCase())
              )
            }
            
            if (allAudience.length > 0) {
              const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: position.column - prefix.length - 1, // Include the @
                endColumn: position.column,
              }

              allAudience.forEach((person: string) => {
                suggestions.push({
                  label: `@${person}`,
                  kind: monaco.languages.CompletionItemKind.Keyword,
                  insertText: `@${person}`,
                  range: range,
                  detail: 'Recent audience member',
                  sortText: '0' + person
                })
              })
            }
          } catch (error) {
            console.error('Failed to get recent audience suggestions:', error)
          }
        }

        return { suggestions }
      }
    })
  }, [])
  
  const handleContentChange = useCallback((value: string | undefined) => {
    const newContent = value || ''
    setContent(newContent)
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    
    // Auto-save after 250ms of no typing
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const noteId = currentNoteIdRef.current
        if (noteId) {
          // Update existing note
          await (window as any).electronAPI?.updateExistingNote(noteId, newContent)
        } else {
          // Create new note and track its ID
          const result = await (window as any).electronAPI?.saveNote(newContent)
          if (result?.id) {
            setCurrentNoteId(result.id)
          }
        }
      } catch (error) {
        console.error('Failed to save note:', error)
      }
    }, 250)
  }, [])

  // Load initial note on startup
  useEffect(() => {
    const loadInitialNote = async () => {
      try {
        console.log('Loading initial note...')
        const recentNote = await (window as any).electronAPI?.loadRecentNote()
        console.log('Recent note loaded:', recentNote)
        
        if (recentNote) {
          setContent(recentNote.content)
          setCurrentNoteId(recentNote.id)
          console.log('Set currentNoteId to:', recentNote.id)
        } else {
          console.log('No recent note found')
        }
        
      } catch (error) {
        console.error('Failed to load recent note:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadInitialNote()
    
    // Listen for note loading from menu
    let cleanupLoadNote: (() => void) | undefined
    let cleanupDeleteNote: (() => void) | undefined
    
    if ((window as any).electronAPI) {
      cleanupLoadNote = (window as any).electronAPI.onLoadNote(async (noteId: string) => {
        await loadNoteById(noteId)
      })

      // Listen for delete current note from menu
      cleanupDeleteNote = (window as any).electronAPI.onDeleteCurrentNote(async () => {
        await deleteCurrentNote()
      })
    }

    // Cleanup function
    return () => {
      if (cleanupLoadNote) cleanupLoadNote()
      if (cleanupDeleteNote) cleanupDeleteNote()
    }
  }, [])

  const loadNoteById = async (noteId: string) => {
    try {
      console.log('loadNoteById called with noteId:', noteId)
      const note = await (window as any).electronAPI?.loadNoteById(noteId)
      console.log('Note loaded from backend:', note)
      
      if (note) {
        setContent(note.content)
        setCurrentNoteId(noteId)
        console.log('Set currentNoteId to:', noteId)
        
        // Update the ref as well for navigation
        currentNoteIdRef.current = noteId
        console.log('Set currentNoteIdRef.current to:', noteId)
        
        // Update window title
        await updateWindowTitle(noteId)
      } else {
        console.log('No note returned from backend')
      }
    } catch (error) {
      console.error('Failed to load note by ID:', error)
    }
  }

  const handleNewNote = useCallback(() => {
    setContent('')
    setCurrentNoteId(null)
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  const deleteCurrentNote = async () => {
    console.log('deleteCurrentNote called, currentNoteId:', currentNoteId)
    console.log('deleteCurrentNote called, currentNoteIdRef.current:', currentNoteIdRef.current)

    const noteIdToDelete = currentNoteIdRef.current || currentNoteId

    if (!noteIdToDelete) {
      console.log('No current note to delete - both currentNoteId and ref are null/undefined')
      return
    }

    try {
      console.log('Deleting note:', noteIdToDelete)
      const result = await (window as any).electronAPI?.deleteNote(noteIdToDelete)

      if (result?.success) {
        console.log('Note deleted successfully')

        // Try to load any available note after deletion
        try {
          console.log('Looking for any available note to load...')
          const recentNote = await (window as any).electronAPI?.loadRecentNote()

          if (recentNote) {
            console.log('Loading most recent note:', recentNote.id)
            setContent(recentNote.content)
            setCurrentNoteId(recentNote.id)
            currentNoteIdRef.current = recentNote.id
            await updateWindowTitle(recentNote.id)
          } else {
            console.log('No other notes available, clearing editor')
            // Clear the editor and reset state if no other notes
            setContent('')
            setCurrentNoteId(null)
            currentNoteIdRef.current = null
            // Clear any pending saves
            if (saveTimeoutRef.current) {
              clearTimeout(saveTimeoutRef.current)
            }
            // Update window title
            await updateWindowTitle(null)
          }
        } catch (navError) {
          console.error('Failed to navigate after deletion:', navError)
          // Fallback: just clear the editor
          setContent('')
          setCurrentNoteId(null)
          currentNoteIdRef.current = null
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
          }
          await updateWindowTitle(null)
        }
      } else {
        console.error('Failed to delete note')
      }
    } catch (error) {
      console.error('Error deleting note:', error)
    }
  }

  // Transcription handlers
  const handleToggleRecording = async () => {
    try {
      if (isRecording) {
        // Stop recording
        const result = await (window as any).electronAPI?.transcriptionStop()
        if (result?.success) {
          setIsRecording(false)
          console.log('Transcription stopped')
        }
      } else {
        // Start recording - need a note ID
        if (!currentNoteIdRef.current) {
          console.warn('Cannot start recording without a note')
          return
        }

        const result = await (window as any).electronAPI?.transcriptionStart(currentNoteIdRef.current)
        if (result?.success) {
          setIsRecording(true)
          console.log('Transcription started for note:', currentNoteIdRef.current)
        } else {
          console.error('Failed to start transcription:', result?.error)
        }
      }
    } catch (error) {
      console.error('Error toggling recording:', error)
    }
  }

  // Poll transcription status
  useEffect(() => {
    const pollStatus = async () => {
      try {
        const status = await (window as any).electronAPI?.transcriptionGetStatus()
        setIsRecording(status?.isRecording || false)
      } catch (error) {
        console.error('Failed to poll transcription status:', error)
      }
    }

    // Poll every 2 seconds
    const interval = setInterval(pollStatus, 2000)

    // Initial poll
    pollStatus()

    return () => clearInterval(interval)
  }, [])

  if (isLoading) {
    return (
      <div className="app">
        <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="header">
        <div className="header-left">
          <span>{currentNoteId ? formatNoteDate(currentNoteId) : 'Note Taker'}</span>
          {isRecording && (
            <span
              style={{
                marginLeft: '8px',
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#FF3B30',
                animation: 'pulse 1.5s ease-in-out infinite'
              }}
              title="Recording audio"
            />
          )}
        </div>
        <div className="header-right">
          <button
            onClick={handleToggleRecording}
            disabled={!currentNoteId}
            style={{
              background: isRecording ? 'rgba(255, 59, 48, 0.2)' : 'rgba(0, 0, 0, 0.1)',
              border: isRecording ? '1px solid rgba(255, 59, 48, 0.5)' : '1px solid rgba(0, 0, 0, 0.2)',
              borderRadius: '4px',
              padding: '4px 12px',
              fontSize: '12px',
              cursor: currentNoteId ? 'pointer' : 'not-allowed',
              color: isRecording ? '#FF3B30' : '#333',
              marginRight: '8px',
              opacity: currentNoteId ? 1 : 0.5
            }}
          >
            {isRecording ? '⏹ Stop' : '⏺ Record'}
          </button>
          <button
            onClick={handleNewNote}
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
        <Editor
          height="100%"
          language="notes"
          value={content}
          onChange={handleContentChange}
          theme="notes-theme"
          loading="Loading editor..."
          beforeMount={(monaco) => {
            setupMonacoLanguage(monaco)
          }}
          onMount={(editor, monaco) => {
            monaco.editor.setTheme('notes-theme')
            
            // Add navigation commands
            editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.DownArrow, async () => {
              console.log('Cmd+Down pressed - navigating to previous note')
              try {
                if (!currentNoteIdRef.current) {
                  console.log('No current note ID available')
                  return
                }
                
                const previousId = await (window as any).electronAPI?.getPreviousNoteId(currentNoteIdRef.current)
                console.log('Previous note ID:', previousId)
                
                if (previousId) {
                  await loadNoteById(previousId)
                  console.log('Successfully loaded previous note:', previousId)
                } else {
                  console.log('No previous note available')
                }
              } catch (error) {
                console.error('Failed to navigate to previous note:', error)
              }
            })

            editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.UpArrow, async () => {
              console.log('Cmd+Up pressed - navigating to next note')
              try {
                if (!currentNoteIdRef.current) {
                  console.log('No current note ID available')
                  return
                }
                
                const nextId = await (window as any).electronAPI?.getNextNoteId(currentNoteIdRef.current)
                console.log('Next note ID:', nextId)
                
                if (nextId) {
                  await loadNoteById(nextId)
                  console.log('Successfully loaded next note:', nextId)
                } else {
                  console.log('No next note available')
                }
              } catch (error) {
                console.error('Failed to navigate to next note:', error)
              }
            })

            editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.LeftArrow , async () => {
              console.log('Cmd+Left pressed - navigating to next note with action items')
              try {
                if (!currentNoteIdRef.current) {
                  console.log('No current note ID available')
                  return
                }
                
                const nextId = await (window as any).electronAPI?.getNextNoteId(currentNoteIdRef.current, true)
                console.log('Next note ID:', nextId)
                
                if (nextId) {
                  await loadNoteById(nextId)
                  console.log('Successfully loaded next note:', nextId)
                } else {
                  console.log('No next note available')
                }
              } catch (error) {
                console.error('Failed to navigate to next note:', error)
              }
            })

            editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.RightArrow, async () => {
              console.log('Cmd+Right pressed - navigating to previous note with action items')
              try {
                if (!currentNoteIdRef.current) {
                  console.log('No current note ID available')
                  return
                }
                
                const previousId = await (window as any).electronAPI?.getPreviousNoteId(currentNoteIdRef.current, true)
                console.log('Previous note ID:', previousId)
                
                if (previousId) {
                  await loadNoteById(previousId)
                  console.log('Successfully loaded previous note:', previousId)
                } else {
                  console.log('No previous note available')
                }
              } catch (error) {
                console.error('Failed to navigate to previous note:', error)
              }
            })
            
            // Add double-click handler for completion toggling
            let lastClickTime = 0
            let lastClickPosition: any = null
            
            editor.onMouseUp((e: any) => {
              const currentTime = Date.now()
              const position = e.target.position
              
              // Check if this is a double-click (within 300ms and same position)
              const isDoubleClick = currentTime - lastClickTime < 300 && 
                lastClickPosition && position &&
                lastClickPosition.lineNumber === position.lineNumber &&
                Math.abs(lastClickPosition.column - position.column) <= 2
              
              lastClickTime = currentTime
              lastClickPosition = position
              
              if (!isDoubleClick || !position) return

              const model = editor.getModel()
              if (!model) return
              const line = model.getLineContent(position.lineNumber)
              const clickColumn = position.column

              // Check if double-click is on an action item
              const actionMatches = [...line.matchAll(/\[\s*\]|\[x\]/g)]
              for (const match of actionMatches) {
                const startCol = (match.index || 0) + 1
                const endCol = startCol + match[0].length - 1
                
                if (clickColumn >= startCol && clickColumn <= endCol) {
                  const newLine = match[0] === '[]' || match[0] === '[ ]' 
                    ? line.replace(match[0], '[x]')
                    : line.replace(match[0], '[]')
                  
                  const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: 1,
                    endColumn: line.length + 1,
                  }
                  
                  editor.executeEdits('double-click-complete', [{
                    range,
                    text: newLine
                  }])
                  
                  return
                }
              }

              // Check if double-click is on a connection arrow symbol
              const connectionMatches = [
                // Complete connections (forward slash syntax)
                ...line.matchAll(/-[/\\]>/g),
                ...line.matchAll(/<[/\\]-/g),
                // Incomplete connections  
                ...line.matchAll(/->/g),
                ...line.matchAll(/<-/g)
              ]
              
              for (const match of connectionMatches) {
                const startCol = (match.index || 0) + 1
                const endCol = startCol + match[0].length - 1
                
                if (clickColumn >= startCol && clickColumn <= endCol) {
                  let newLine = line
                  
                  // Handle different arrow types by replacing the exact match
                  if (match[0] === '->') {
                    // Incomplete forward arrow -> complete forward arrow
                    newLine = line.replace(match[0], '-/>')
                  }
                  else if (match[0] === '<-') {
                    // Incomplete backward arrow -> complete backward arrow  
                    newLine = line.replace(match[0], '</-')
                  }
                  else if (match[0] === '-/>' || match[0] === '-\\>') {
                    // Complete forward arrow -> incomplete forward arrow
                    newLine = line.replace(match[0], '->')
                  }
                  else if (match[0] === '</-' || match[0] === '<\\-') {
                    // Complete backward arrow -> incomplete backward arrow
                    newLine = line.replace(match[0], '<-')
                  }
                  
                  const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: 1,
                    endColumn: line.length + 1,
                  }
                  
                  editor.executeEdits('double-click-complete', [{
                    range,
                    text: newLine
                  }])
                  
                  return
                }
              }
            })

            // Handle special key combinations
            editor.onKeyDown((e: any) => {
              if (e.keyCode === 3) { // Enter key
                const model = editor.getModel()
                if (!model) return
                
                const position = editor.getPosition()
                if (!position) return
                
                if (position.lineNumber >= 2) {
                  setTimeout(() => {
                    const newPosition = editor.getPosition()
                    if (!newPosition) return
                    
                    const currentLine = model.getLineContent(newPosition.lineNumber)
                    if (currentLine.trim() === '') {
                      editor.executeEdits('auto-bullet', [{
                        range: {
                          startLineNumber: newPosition.lineNumber,
                          endLineNumber: newPosition.lineNumber,
                          startColumn: 1,
                          endColumn: 1
                        },
                        text: '- '
                      }])
                      
                      editor.setPosition({
                        lineNumber: newPosition.lineNumber,
                        column: 3
                      })
                    }
                  }, 10)
                }
              }
              
              // Tab and Shift+Tab for bullet point indentation
              if (e.keyCode === 2) { // Tab key
                const model = editor.getModel()
                if (!model) return
                
                const position = editor.getPosition()
                if (!position) return
                
                const line = model.getLineContent(position.lineNumber)
                const trimmedLine = line.trimStart()
                
                // Check if first non-whitespace character is "-"
                if (trimmedLine.startsWith('-')) {
                  e.preventDefault()
                  e.stopPropagation()
                  
                  if (e.shiftKey) {
                    // Shift+Tab: Decrease indentation (remove 2 spaces if they exist)
                    const leadingSpaces = line.length - trimmedLine.length
                    if (leadingSpaces >= 2) {
                      const newLine = line.substring(2) // Remove 2 spaces
                      editor.executeEdits('decrease-indent', [{
                        range: {
                          startLineNumber: position.lineNumber,
                          endLineNumber: position.lineNumber,
                          startColumn: 1,
                          endColumn: line.length + 1
                        },
                        text: newLine
                      }])
                      
                      // Move cursor back by 2 positions
                      editor.setPosition({
                        lineNumber: position.lineNumber,
                        column: Math.max(1, position.column - 2)
                      })
                    }
                  } else {
                    // Tab: Increase indentation (add 2 spaces at beginning)
                    const newLine = '  ' + line
                    editor.executeEdits('increase-indent', [{
                      range: {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: 1,
                        endColumn: line.length + 1
                      },
                      text: newLine
                    }])
                    
                    // Move cursor forward by 2 positions
                    editor.setPosition({
                      lineNumber: position.lineNumber,
                      column: position.column + 2
                    })
                  }
                } else {
                  // For non-bullet lines, still prevent default tab behavior
                  e.preventDefault()
                  e.stopPropagation()
                }
              }
            })
          }}
          options={{
            minimap: { enabled: false },
            lineNumbers: 'off',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            fontSize: 12,
            fontFamily: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
            padding: { top: 20, bottom: 20 },
            automaticLayout: true,
            scrollbar: {
              vertical: 'hidden',
              horizontal: 'hidden'
            },
            renderLineHighlight: 'none', // Remove grey line highlight
            quickSuggestions: false, // Disable autocomplete on all words
            wordBasedSuggestions: 'off' as const, // Disable word-based suggestions
            suggestOnTriggerCharacters: true, // Enable for our # and @ triggers
            acceptSuggestionOnEnter: 'on', // Accept suggestions on enter
            tabCompletion: 'on' // Accept suggestions on tab
          }}
        />
      </div>
    </div>
  )
}

export default App