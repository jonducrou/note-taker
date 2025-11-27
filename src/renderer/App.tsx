import React, { useState, useCallback, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import './App.css'


const App: React.FC = () => {
  const [content, setContent] = useState('')
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRecording, setIsRecording] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [isProcessingTranscript, setIsProcessingTranscript] = useState(false)
  const [modelReady, setModelReady] = useState(false)
  const [modelDownloadProgress, setModelDownloadProgress] = useState(0)
  const [connectionState, setConnectionState] = useState<'connected' | 'disconnected' | 'reconnecting' | 'failed' | null>(null)
  const [reconnectionAttempt, setReconnectionAttempt] = useState<number | undefined>(undefined)
  const [showFinishingModal, setShowFinishingModal] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const currentNoteIdRef = useRef<string | null>(null)
  const previousAudienceRef = useRef<string[]>([])
  const aggregationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const editorRef = useRef<any>(null)
  const decorationsRef = useRef<string[]>([])
  
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

  // Extract audience members from content (only user content, not aggregated section)
  const extractAudience = (content: string): string[] => {
    // Only extract from user content - before the aggregation separator
    const userContent = content.split('--------')[0]
    const audience: Set<string> = new Set()

    // Look for @audience: format (comma-separated)
    const audienceMatch = userContent.match(/@audience:([^\n]+)/)
    if (audienceMatch) {
      const members = audienceMatch[1].split(',').map(m => m.trim()).filter(m => m.length > 0)
      members.forEach(m => audience.add(m))
    }

    // Also look for standalone @ tags - only at start of line or after whitespace
    // This prevents matching @ in email addresses or mid-word
    const atMatches = userContent.matchAll(/(?:^|[\s])@([a-zA-Z][a-zA-Z0-9_-]*)/gm)
    for (const match of atMatches) {
      // Skip "audience" since it's handled above
      if (match[1].toLowerCase() !== 'audience') {
        audience.add(match[1])
      }
    }

    return Array.from(audience)
  }

  // Format aggregated content from related actions
  const formatAggregatedContent = (relatedActions: any[]): string => {
    if (relatedActions.length === 0) {
      return ''
    }

    // Helper to format date as "Today", "Yesterday", or date
    const formatDate = (dateStr: string): string => {
      const noteDate = new Date(dateStr)
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      const isToday = noteDate.toDateString() === today.toDateString()
      const isYesterday = noteDate.toDateString() === yesterday.toDateString()

      if (isToday) return 'Today'
      if (isYesterday) return 'Yesterday'

      // Format as "Nov 12"
      const month = noteDate.toLocaleString('en-AU', { month: 'short' })
      const day = noteDate.getDate()
      return `${month} ${day}`
    }

    let formatted = '\n--------\n'

    for (const related of relatedActions) {
      const dateFormatted = formatDate(related.noteDate)
      formatted += `${related.noteTitle} (${dateFormatted})\n`

      // Add incomplete actions
      const incompleteActions = related.actions.filter((a: any) => !a.completed)
      for (const action of incompleteActions) {
        formatted += `[] ${action.text}\n`
      }

      // Add incomplete connections
      const incompleteConnections = related.connections.filter((c: any) => !c.completed)
      for (const conn of incompleteConnections) {
        const arrow = conn.direction === 'right' ? '->' : '<-'
        formatted += `${conn.subject} ${arrow}\n`
      }

      formatted += '\n'
    }

    return formatted
  }

  // Update Monaco decorations for aggregated section
  const updateAggregatedDecorations = useCallback((content: string) => {
    if (!editorRef.current) return

    const delimiterIndex = content.indexOf('--------')

    if (delimiterIndex === -1) {
      // Clear decorations if no delimiter
      decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, [])
      return
    }

    // Find line number where delimiter starts
    const linesBeforeDelimiter = content.substring(0, delimiterIndex).split('\n').length
    const totalLines = content.split('\n').length

    // Apply grey background from delimiter line onwards
    const decorations = [{
      range: {
        startLineNumber: linesBeforeDelimiter,
        startColumn: 1,
        endLineNumber: totalLines,
        endColumn: 1
      },
      options: {
        isWholeLine: true,
        className: 'aggregated-section',
        inlineClassName: 'aggregated-section-inline'
      }
    }]

    decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, decorations)
  }, [])

  // Helper to compare audience arrays
  const audienceChanged = (prev: string[], current: string[]): boolean => {
    if (prev.length !== current.length) return true
    const prevSorted = [...prev].sort()
    const currentSorted = [...current].sort()
    return prevSorted.some((item, index) => item !== currentSorted[index])
  }

  // Handle aggregation when audience tags change
  const handleAggregation = useCallback(async (content: string, _cursorLineNumber?: number) => {
    // Extract audience from content
    const audience = extractAudience(content)

    // Check if audience has actually changed
    const hasAudienceChanged = audienceChanged(previousAudienceRef.current, audience)

    if (!hasAudienceChanged) {
      // Audience hasn't changed, don't refresh
      return
    }

    // Update the previous audience ref
    previousAudienceRef.current = audience

    if (audience.length === 0) {
      // No audience, clear aggregation
      const userContent = content.split('--------')[0]
      if (content !== userContent) {
        // Save cursor position
        const editor = editorRef.current
        const position = editor?.getPosition()

        setContent(userContent)
        updateAggregatedDecorations(userContent)

        // Restore cursor position
        if (editor && position) {
          setTimeout(() => {
            editor.setPosition(position)
            editor.focus()
          }, 0)
        }
      }
      return
    }

    // Clear existing aggregation timeout
    if (aggregationTimeoutRef.current) {
      clearTimeout(aggregationTimeoutRef.current)
    }

    // Debounce aggregation by 500ms
    aggregationTimeoutRef.current = setTimeout(async () => {
      try {
        const relatedActions = await (window as any).electronAPI?.getRelatedActions(audience, 30)

        if (!relatedActions || relatedActions.length === 0) {
          // No related actions, clear aggregation
          const userContent = content.split('--------')[0]
          if (content !== userContent) {
            // Save cursor position
            const editor = editorRef.current
            const position = editor?.getPosition()

            setContent(userContent)
            updateAggregatedDecorations(userContent)

            // Restore cursor position
            if (editor && position) {
              setTimeout(() => {
                editor.setPosition(position)
                editor.focus()
              }, 0)
            }
          }
          return
        }

        // Save cursor position before updating content
        const editor = editorRef.current
        const position = editor?.getPosition()

        // Format aggregated content
        const aggregatedContent = formatAggregatedContent(relatedActions)

        // Get user content (everything before delimiter)
        const userContent = content.split('--------')[0]

        // Rebuild with single delimiter
        const newContent = userContent + aggregatedContent

        setContent(newContent)
        updateAggregatedDecorations(newContent)

        // Restore cursor position after content update
        if (editor && position) {
          setTimeout(() => {
            editor.setPosition(position)
            editor.focus()
          }, 0)
        }
      } catch (error) {
        console.error('Failed to get related actions:', error)
      }
    }, 500)
  }, [updateAggregatedDecorations])
  
  // Keep ref in sync with state and update window title
  useEffect(() => {
    currentNoteIdRef.current = currentNoteId
    updateWindowTitle(currentNoteId)
  }, [currentNoteId])

  // Update decorations whenever content changes
  useEffect(() => {
    if (editorRef.current) {
      updateAggregatedDecorations(content)
    }
  }, [content, updateAggregatedDecorations])
  
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

    // Get current cursor position
    const editor = editorRef.current
    const position = editor?.getPosition()
    const cursorLineNumber = position?.lineNumber

    // Trigger aggregation check (only when cursor leaves first line)
    handleAggregation(newContent, cursorLineNumber)

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Auto-save after 250ms of no typing
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        // Strip aggregated content before saving
        const contentToSave = newContent.split('--------')[0]

        const noteId = currentNoteIdRef.current
        if (noteId) {
          // Update existing note
          await (window as any).electronAPI?.updateExistingNote(noteId, contentToSave)
        } else {
          // Create new note and track its ID
          const result = await (window as any).electronAPI?.saveNote(contentToSave)
          if (result?.id) {
            setCurrentNoteId(result.id)
          }
        }
      } catch (error) {
        console.error('Failed to save note:', error)
      }
    }, 250)
  }, [handleAggregation])

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

        // Reset audience ref to force aggregation check
        previousAudienceRef.current = []

        // Trigger aggregation for the loaded note
        handleAggregation(note.content)

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

    // Reset audience ref
    previousAudienceRef.current = []

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Clear any pending aggregation
    if (aggregationTimeoutRef.current) {
      clearTimeout(aggregationTimeoutRef.current)
    }

    // Clear decorations
    if (editorRef.current) {
      decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, [])
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

  // Poll transcription status
  useEffect(() => {
    const pollStatus = async () => {
      try {
        const status = await (window as any).electronAPI?.transcriptionGetStatus()
        setIsRecording(status?.isRecording || false)
        setIsInitializing(status?.isInitializing || false)
        setIsProcessingTranscript(status?.isProcessingTranscript || false)
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

  // Poll model status and listen for download progress
  useEffect(() => {
    const pollModelStatus = async () => {
      try {
        const status = await (window as any).electronAPI?.transcriptionGetModelStatus()
        if (status) {
          setModelReady(status.ready)
          setModelDownloadProgress(status.progress)
        }
      } catch (error) {
        console.error('Failed to poll model status:', error)
      }
    }

    // Poll every 2 seconds
    const interval = setInterval(pollModelStatus, 2000)

    // Initial poll
    pollModelStatus()

    // Listen for progress updates
    let cleanup: (() => void) | undefined
    if ((window as any).electronAPI) {
      cleanup = (window as any).electronAPI.onModelDownloadProgress((progress: number) => {
        setModelDownloadProgress(progress)
        if (progress === 100) {
          setModelReady(true)
        }
      })
    }

    return () => {
      clearInterval(interval)
      if (cleanup) cleanup()
    }
  }, [])

  // Listen for transcription connection state changes
  useEffect(() => {
    let cleanup: (() => void) | undefined
    if ((window as any).electronAPI) {
      cleanup = (window as any).electronAPI.onTranscriptionConnectionState((data: {
        state: 'connected' | 'disconnected' | 'reconnecting' | 'failed'
        attempt?: number
        maxAttempts?: number
      }) => {
        setConnectionState(data.state)
        setReconnectionAttempt(data.attempt)
      })
    }

    return () => {
      if (cleanup) cleanup()
    }
  }, [])

  // Listen for finishing modal display from main process
  useEffect(() => {
    let cleanup: (() => void) | undefined
    if ((window as any).electronAPI) {
      cleanup = (window as any).electronAPI.onShowFinishingModal((show: boolean) => {
        setShowFinishingModal(show)
      })
    }

    return () => {
      if (cleanup) cleanup()
    }
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
          {/* v2 - no manual button */}
          {isInitializing && (
            <span
              style={{
                marginLeft: '8px',
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#FFCC00',
                animation: 'pulse 1.5s ease-in-out infinite'
              }}
              title="Initializing audio capture..."
            />
          )}
          {isRecording && (
            <span
              style={{
                marginLeft: '8px',
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: connectionState === 'reconnecting' ? '#FF9500' : '#FF3B30',
                animation: 'pulse 1.5s ease-in-out infinite'
              }}
              title={connectionState === 'reconnecting'
                ? `Reconnecting... (attempt ${reconnectionAttempt || 1})`
                : 'Recording audio'}
            />
          )}
          {isProcessingTranscript && (
            <span
              style={{
                marginLeft: '8px',
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#007AFF',
                animation: 'pulse 1.5s ease-in-out infinite'
              }}
              title="Processing session transcript..."
            />
          )}
          {!modelReady && modelDownloadProgress < 100 && (
            <span
              style={{
                marginLeft: '8px',
                fontSize: '10px',
                color: '#666',
                fontStyle: 'italic'
              }}
              title={`Downloading speech model... ${modelDownloadProgress}%`}
            >
              ⬇ {modelDownloadProgress}%
            </span>
          )}
        </div>
        <div className="header-right">
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

            // Store editor reference
            editorRef.current = editor

            // Apply initial decorations if content has delimiter
            updateAggregatedDecorations(content)
            
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

      {/* Finishing up modal - shown when app is quitting with active recording */}
      {showFinishingModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
        >
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor: '#007AFF',
              animation: 'pulse 1.5s ease-in-out infinite',
              marginBottom: '16px'
            }}
          />
          <div
            style={{
              fontSize: '14px',
              color: '#333',
              fontWeight: 500
            }}
          >
            Finishing up...
          </div>
          <div
            style={{
              fontSize: '12px',
              color: '#666',
              marginTop: '8px'
            }}
          >
            Saving transcription
          </div>
        </div>
      )}
    </div>
  )
}

export default App