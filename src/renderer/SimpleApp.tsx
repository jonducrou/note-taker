import React, { useState, useCallback, useEffect } from 'react'
import './App.css'

const SimpleApp: React.FC = () => {
  useEffect(() => {
    console.log('=== SIMPLE APP MOUNTED ===')
    console.log('ElectronAPI available:', !!(window as any).electronAPI)
    console.log('Debug info:', (window as any).debugInfo)
    
    // Test electronAPI
    if ((window as any).electronAPI) {
      console.log('Testing electronAPI.test()...')
      ;(window as any).electronAPI.test()
    } else {
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
    ;(window as any).electronAPI?.updateBadge(count)
    
    // Auto-save after 1 second of no typing (simplified)
    setTimeout(async () => {
      try {
        await (window as any).electronAPI?.saveNote(newContent)
        console.log('Note saved')
      } catch (error) {
        console.error('Failed to save note:', error)
      }
    }, 1000)
  }, [countIncompleteItems])

  return (
    <div className="app" style={{ background: '#f0f0f0' }}>
      {/* Debug header */}
      <div style={{ 
        background: '#007AFF', 
        color: 'white', 
        padding: '5px 10px', 
        fontSize: '12px',
        fontWeight: 'bold'
      }}>
        ✅ React App Loaded Successfully - ElectronAPI: {(window as any).electronAPI ? '✅' : '❌'}
      </div>
      
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
            height: 'calc(100% - 30px)', // Account for debug header
            border: '2px solid #007AFF',
            outline: 'none',
            padding: '20px',
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Monaco, Menlo, monospace',
            resize: 'none',
            background: 'white',
            lineHeight: '1.4'
          }}
          placeholder="🎯 Click here and start typing your note... This should be interactive!"
        />
      </div>
      
      <div style={{ 
        position: 'absolute', 
        bottom: '5px', 
        left: '5px', 
        fontSize: '10px', 
        color: '#666',
        userSelect: 'none',
        background: 'yellow',
        padding: '2px 5px'
      }}>
        Simple Note Taker - Window is interactive: {document.hasFocus() ? '✅' : '❌'}
      </div>
    </div>
  )
}

export default SimpleApp