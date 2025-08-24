import React, { useState, useCallback, useEffect } from 'react'
import './App.css'

const SimpleApp: React.FC = () => {
  useEffect(() => {
    // Verify electronAPI is available
    if (!(window as any).electronAPI) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error('ElectronAPI not available!')
    }
  }, [])
  const [content, setContent] = useState('@group: @audience:\n\n# Today\'s Notes\n\n## Actions\n[] \n\n## Key Points\n- ')
  const [incompleteCount, setIncompleteCount] = useState(0)

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
    
    // Update incomplete count
    const count = countIncompleteItems(newContent)
    setIncompleteCount(count)
    
    // Update badge in tray (mock for now)
    ;(window as any).electronAPI?.updateBadge(count) // eslint-disable-line @typescript-eslint/no-explicit-any
    
    // Auto-save after 1 second of no typing (simplified)
    setTimeout(async () => {
      try {
        await (window as any).electronAPI?.saveNote(newContent) // eslint-disable-line @typescript-eslint/no-explicit-any
        console.log('Note saved')
      } catch (error) {
        console.error('Failed to save note:', error)
      }
    }, 1000)
  }, [countIncompleteItems])

  return (
    <div className="app">
      {incompleteCount > 0 && (
        <div className="header">
          <div className="incomplete-badge">
            {incompleteCount} incomplete
          </div>
        </div>
      )}
      
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
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Monaco, Menlo, monospace',
            resize: 'none',
            background: 'transparent',
            lineHeight: '1.4'
          }}
          placeholder="Start typing your note..."
        />
      </div>
    </div>
  )
}

export default SimpleApp