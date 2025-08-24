import React, { useState, useEffect, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import './App.css'

// Simple fallback editor component
const FallbackEditor: React.FC<{
  value: string
  onChange: (value: string) => void
}> = ({ value, onChange }) => {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        outline: 'none',
        padding: '20px',
        fontSize: '14px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Monaco, Menlo, monospace',
        resize: 'none',
        background: 'transparent'
      }}
      placeholder="Start typing your note..."
    />
  )
}

interface Note {
  id: string
  content: string
  group?: string
  audience: string[]
  createdAt: Date
  updatedAt: Date
}

const App: React.FC = () => {
  const [content, setContent] = useState('')
  const [incompleteCount, setIncompleteCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [notes, setNotes] = useState<Note[]>([])
  const [, setCurrentNoteId] = useState<string | null>(null)
  const [commandMode, setCommandMode] = useState(false)
  const [commandInput, setCommandInput] = useState('')
  const [monacoError, setMonacoError] = useState<string | null>(null)
  const [useMonaco, setUseMonaco] = useState(true)
  const monacoRef = useRef<Monaco | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Simple function to handle content changes
  const simpleHandleContentChange = useCallback((value: string) => {
    setContent(value)
    
    // Update incomplete count
    const count = countIncompleteItems(value)
    setIncompleteCount(count)
    
    // Update badge in tray
    ;(window as any).electronAPI?.updateBadge(count)
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    
    // Auto-save after 1 second of no typing
    saveTimeoutRef.current = setTimeout(async () => {
      const { group, audience } = parseMetadata(value)
      try {
        await (window as any).electronAPI?.saveNote(value, group, audience)
      } catch (error) {
        console.error('Failed to save note:', error)
      }
    }, 1000)
  }, [parseMetadata, countIncompleteItems])

  const parseMetadata = useCallback((text: string) => {
    const lines = text.split('\n')
    let group: string | undefined
    let audience: string[] = []
    
    for (const line of lines) {
      const groupMatch = line.match(/@group:(\w+)/)
      if (groupMatch) {
        group = groupMatch[1]
      }
      
      const audienceMatch = line.match(/@audience:(.+)/)
      if (audienceMatch) {
        audience = audienceMatch[1]
          .split(',')
          .map(a => a.trim())
          .filter(a => a.length > 0)
      }
    }
    
    return { group, audience }
  }, [])

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

  const setupMonacoLanguage = useCallback((monaco: Monaco) => {
    // Register a new language for our note format
    monaco.languages.register({ id: 'notes' })

    // Define tokens for syntax highlighting
    monaco.languages.setMonarchTokensProvider('notes', {
      tokenizer: {
        root: [
          // Metadata tags
          [/@group:\w+/, 'metadata.group'],
          [/@audience:[\w,\s]+/, 'metadata.audience'],
          
          // Actions (incomplete and complete)
          [/\[\s*\]/, 'action.incomplete'],
          [/\[x\]/, 'action.complete'],
          
          // Connections (incomplete and complete)
          [/\w+\s*->\s*\w+/, 'connection.incomplete'],
          [/\w+\s*<-\s*\w+/, 'connection.incomplete'],
          [/\w+\s*-x>\s*\w+/, 'connection.complete'],
          [/\w+\s*<x-\s*\w+/, 'connection.complete'],
          
          // Markdown headers
          [/^#.*/, 'header'],
          [/^##.*/, 'header'],
          [/^###.*/, 'header'],
          
          // Default
          [/.*/, 'text']
        ]
      }
    })

    // Define colors for our custom tokens
    monaco.editor.defineTheme('notes-theme', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'metadata.group', foreground: '0066CC', fontStyle: 'bold' },
        { token: 'metadata.audience', foreground: '0066CC', fontStyle: 'bold' },
        { token: 'action.incomplete', foreground: 'FF3B30', fontStyle: 'bold' },
        { token: 'action.complete', foreground: '34C759', fontStyle: 'bold' },
        { token: 'connection.incomplete', foreground: 'FF9500', fontStyle: 'bold' },
        { token: 'connection.complete', foreground: '34C759', fontStyle: 'bold' },
        { token: 'header', foreground: '1D1D1F', fontStyle: 'bold' },
        { token: 'text', foreground: '1D1D1F' }
      ],
      colors: {
        'editor.background': '#FFFFFF00', // Transparent background
        'editor.foreground': '#1D1D1F'
      }
    })

    // Register autocomplete provider
    monaco.languages.registerCompletionItemProvider('notes', {
      provideCompletionItems: async (model, position) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }

        const line = model.getLineContent(position.lineNumber)
        const textBeforeCursor = line.substring(0, position.column - 1)

        const suggestions: any[] = []

        // Group autocomplete
        if (textBeforeCursor.includes('@group:') || textBeforeCursor.endsWith('@group:')) {
          try {
            const groups = await (window as any).electronAPI?.getGroups()
            if (groups) {
              groups.forEach((group: string) => {
                suggestions.push({
                  label: group,
                  kind: monaco.languages.CompletionItemKind.Value,
                  insertText: group,
                  range: range,
                  detail: 'Group'
                })
              })
            }
          } catch (error) {
            console.error('Failed to get groups:', error)
          }
        }

        // Audience autocomplete
        if (textBeforeCursor.includes('@audience:') || textBeforeCursor.endsWith('@audience:')) {
          try {
            const audience = await (window as any).electronAPI?.getAudience()
            if (audience) {
              audience.forEach((person: string) => {
                suggestions.push({
                  label: person,
                  kind: monaco.languages.CompletionItemKind.Value,
                  insertText: person,
                  range: range,
                  detail: 'Audience member'
                })
              })
            }
          } catch (error) {
            console.error('Failed to get audience:', error)
          }
        }

        // Template suggestions
        if (word.word === '' || textBeforeCursor.trim() === '') {
          suggestions.push(
            {
              label: '@group:',
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: '@group:',
              range: range,
              detail: 'Add group metadata'
            },
            {
              label: '@audience:',
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: '@audience:',
              range: range,
              detail: 'Add audience metadata'
            },
            {
              label: '[]',
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: '[] ',
              range: range,
              detail: 'Add action item'
            }
          )
        }

        return { suggestions }
      }
    })

    monacoRef.current = monaco
  }, [])

  const handleEditorMount = useCallback((editor: any, monaco: Monaco) => {
    setupMonacoLanguage(monaco)
    
    // Add click handler for completion toggling
    editor.onMouseDown((e: any) => {
      const position = e.target.position
      if (!position) return

      const model = editor.getModel()
      const line = model.getLineContent(position.lineNumber)
      const clickColumn = position.column

      // Check if click is on an action item
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
          
          editor.executeEdits('click-complete', [{
            range,
            text: newLine
          }])
          
          return
        }
      }

      // Check if click is on a connection
      const connectionMatches = [
        ...line.matchAll(/\w+\s*->\s*\w+/g),
        ...line.matchAll(/\w+\s*<-\s*\w+/g),
        ...line.matchAll(/\w+\s*-x>\s*\w+/g),
        ...line.matchAll(/\w+\s*<x-\s*\w+/g)
      ]
      
      for (const match of connectionMatches) {
        const startCol = (match.index || 0) + 1
        const endCol = startCol + match[0].length - 1
        
        if (clickColumn >= startCol && clickColumn <= endCol) {
          let newLine = line
          
          if (match[0].includes('->')) {
            newLine = line.replace(match[0], match[0].replace('->', '-x>'))
          } else if (match[0].includes('<-')) {
            newLine = line.replace(match[0], match[0].replace('<-', '<x-'))
          } else if (match[0].includes('-x>')) {
            newLine = line.replace(match[0], match[0].replace('-x>', '->'))
          } else if (match[0].includes('<x-')) {
            newLine = line.replace(match[0], match[0].replace('<x-', '<-'))
          }
          
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: 1,
            endColumn: line.length + 1,
          }
          
          editor.executeEdits('click-complete', [{
            range,
            text: newLine
          }])
          
          return
        }
      }
    })

    // Add keyboard shortcuts for commands
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      setCommandMode(true)
    })
  }, [setupMonacoLanguage])

  const processCommand = useCallback(async (command: string) => {
    const cmd = command.toLowerCase().trim()
    
    try {
      if (cmd === '/today') {
        const today = new Date().toDateString()
        const todayNotes = notes.filter(note => {
          const noteDate = new Date(note.createdAt).toDateString()
          return noteDate === today
        })
        
        if (todayNotes.length > 0) {
          const note = todayNotes[0]
          setContent(note.content)
          setCurrentNoteId(note.id)
        } else {
          // Create new note for today
          setContent('@group: @audience:\n\n# Today\'s Notes\n\n## Actions\n[] \n\n## Key Points\n- ')
          setCurrentNoteId(null)
        }
      }
      else if (cmd === '/recent') {
        if (notes.length > 0) {
          const recentNote = notes[0] // notes are already sorted by updatedAt
          setContent(recentNote.content)
          setCurrentNoteId(recentNote.id)
        }
      }
      else if (cmd.startsWith('/search:')) {
        const query = cmd.replace('/search:', '').trim()
        if (query) {
          const searchResults = await (window as any).electronAPI?.searchNotes(query)
          if (searchResults && searchResults.length > 0) {
            const note = searchResults[0]
            setContent(note.content)
            setCurrentNoteId(note.id)
          }
        }
      }
      else if (cmd.startsWith('/group:')) {
        const group = cmd.replace('/group:', '').trim()
        if (group) {
          const groupNotes = await (window as any).electronAPI?.filterByGroup(group)
          if (groupNotes && groupNotes.length > 0) {
            const note = groupNotes[0]
            setContent(note.content)
            setCurrentNoteId(note.id)
          }
        }
      }
      else if (cmd.startsWith('/audience:')) {
        const audience = cmd.replace('/audience:', '').trim()
        if (audience) {
          const audienceNotes = await (window as any).electronAPI?.filterByAudience(audience)
          if (audienceNotes && audienceNotes.length > 0) {
            const note = audienceNotes[0]
            setContent(note.content)
            setCurrentNoteId(note.id)
          }
        }
      }
      else if (cmd === '/incomplete') {
        const incompleteItems = await (window as any).electronAPI?.getIncompleteItems()
        if (incompleteItems && incompleteItems.totalCount > 0) {
          // Show a summary of incomplete items
          let summary = '# Incomplete Items Summary\n\n'
          
          if (incompleteItems.actions.length > 0) {
            summary += '## Action Items\n'
            incompleteItems.actions.forEach((action: any) => {
              summary += `- [ ] ${action.text} (from note: ${action.noteId})\n`
            })
            summary += '\n'
          }
          
          if (incompleteItems.connections.length > 0) {
            summary += '## Connections\n'
            incompleteItems.connections.forEach((conn: any) => {
              const arrow = conn.direction === 'forward' ? '->' : '<-'
              summary += `- ${conn.from} ${arrow} ${conn.to} (from note: ${conn.noteId})\n`
            })
          }
          
          setContent(summary)
          setCurrentNoteId(null)
        }
      }
      else if (cmd === '/new') {
        setContent('@group: @audience:\n\n# New Note\n\n## Actions\n[] \n\n## Key Points\n- ')
        setCurrentNoteId(null)
      }
    } catch (error) {
      console.error('Failed to process command:', error)
    }
    
    setCommandMode(false)
    setCommandInput('')
  }, [notes])

  const handleCommandSubmit = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      processCommand(commandInput)
    } else if (e.key === 'Escape') {
      setCommandMode(false)
      setCommandInput('')
    }
  }, [commandInput, processCommand])

  const handleContentChange = useCallback((value: string | undefined) => {
    const newContent = value || ''
    setContent(newContent)
    
    // Update incomplete count
    const count = countIncompleteItems(newContent)
    setIncompleteCount(count)
    
    // Update badge in tray
    ;(window as any).electronAPI?.updateBadge(count)
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    
    // Auto-save after 1 second of no typing
    saveTimeoutRef.current = setTimeout(async () => {
      const { group, audience } = parseMetadata(newContent)
      try {
        await (window as any).electronAPI?.saveNote(newContent, group, audience)
      } catch (error) {
        console.error('Failed to save note:', error)
      }
    }, 1000)
  }, [parseMetadata, countIncompleteItems])

  useEffect(() => {
    const loadInitialNote = async () => {
      try {
        const loadedNotes = await (window as any).electronAPI?.loadNotes()
        if (loadedNotes) {
          setNotes(loadedNotes)
          
          if (loadedNotes.length > 0) {
            const todayNote = loadedNotes.find((note: Note) => {
              const today = new Date().toDateString()
              const noteDate = new Date(note.createdAt).toDateString()
              return today === noteDate
            })
            
            if (todayNote) {
              setContent(todayNote.content)
              setCurrentNoteId(todayNote.id)
              setIncompleteCount(countIncompleteItems(todayNote.content))
            } else {
              // Start with a new note template
              setContent('@group: @audience:\n\n# Today\'s Notes\n\n## Actions\n[] \n\n## Key Points\n- ')
              setCurrentNoteId(null)
            }
          }
        }
      } catch (error) {
        console.error('Failed to load notes:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadInitialNote()
  }, [countIncompleteItems])

  if (isLoading) {
    return (
      <div className="app">
        <div className="loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="app">
      {incompleteCount > 0 && (
        <div className="header">
          <div className="incomplete-badge">
            {incompleteCount} incomplete
          </div>
        </div>
      )}
      
      {commandMode && (
        <div className="command-modal">
          <div className="command-input-container">
            <input
              type="text"
              placeholder="Enter command (/today, /recent, /search:keyword, /group:name, /new...)"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              onKeyDown={handleCommandSubmit}
              autoFocus
              className="command-input"
            />
            <div className="command-help">
              Press Enter to execute, Escape to cancel
            </div>
          </div>
        </div>
      )}
      
      {monacoError && (
        <div style={{ padding: '10px', background: '#ffcccc', margin: '10px' }}>
          Monaco Error: {monacoError}
          <button onClick={() => setUseMonaco(false)} style={{ marginLeft: '10px' }}>
            Use Simple Editor
          </button>
        </div>
      )}
      
      <div className="editor-container">
        {useMonaco ? (
          <Editor
            height="100%"
            language="notes"
            value={content}
            onChange={handleContentChange}
            theme="notes-theme"
            onMount={handleEditorMount}
            loading="Loading editor..."
            beforeMount={(monaco) => {
              // Set a timeout to fallback if Monaco doesn't load
              setTimeout(() => {
                if (!monacoRef.current) {
                  setMonacoError('Monaco Editor failed to load within 10 seconds')
                  setUseMonaco(false)
                }
              }, 10000)
            }}
            onValidate={(markers) => {
              if (markers.length > 0) {
                console.log('Monaco validation markers:', markers)
              }
            }}
            options={{
              minimap: { enabled: false },
              lineNumbers: 'off',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              fontSize: 14,
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Monaco, Menlo, monospace',
              padding: { top: 20, bottom: 20 },
              selectOnLineNumbers: false,
              roundedSelection: false,
              readOnly: false,
              cursorStyle: 'line',
              automaticLayout: true,
              scrollbar: {
                vertical: 'hidden',
                horizontal: 'hidden'
              },
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              overviewRulerBorder: false,
              guides: {
                indentation: false
              },
              renderLineHighlight: 'none',
              contextmenu: false,
              quickSuggestions: {
                other: true,
                comments: false,
                strings: true
              },
              parameterHints: { enabled: false },
              suggestOnTriggerCharacters: true,
              acceptSuggestionOnEnter: 'on',
              tabCompletion: 'on',
              wordBasedSuggestions: 'off' as const,
              suggest: {
                showKeywords: true,
                showSnippets: true,
                showValues: true
              }
            }}
          />
        ) : (
          <FallbackEditor 
            value={content} 
            onChange={simpleHandleContentChange}
          />
        )}
      </div>
    </div>
  )
}

export default App