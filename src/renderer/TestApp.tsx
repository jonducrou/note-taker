import React, { useState, useEffect } from 'react'

const TestApp: React.FC = () => {
  const [message, setMessage] = useState('Loading...')
  const [electronAPI, setElectronAPI] = useState<any>(null)

  useEffect(() => {
    console.log('TestApp mounted')
    
    // Test if electronAPI is available
    const api = (window as any).electronAPI
    setElectronAPI(api)
    
    if (api) {
      setMessage('React is working! ElectronAPI is available.')
      console.log('ElectronAPI available:', Object.keys(api))
    } else {
      setMessage('React is working, but ElectronAPI is NOT available.')
      console.error('ElectronAPI not found on window')
    }
  }, [])

  const testSave = async () => {
    if (electronAPI) {
      try {
        await electronAPI.saveNote('Test content', 'TestGroup', ['TestAudience'])
        setMessage('Save test successful!')
      } catch (error) {
        setMessage(`Save test failed: ${error}`)
        console.error('Save test error:', error)
      }
    }
  }

  const testHideWindow = async () => {
    if (electronAPI) {
      try {
        await electronAPI.hideWindow()
      } catch (error) {
        console.error('Hide window error:', error)
      }
    }
  }

  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'system-ui', 
      height: '100vh',
      background: 'white'
    }}>
      <h1>Note Taker Test</h1>
      <p>{message}</p>
      
      <div style={{ marginTop: '20px' }}>
        <button onClick={testSave} style={{ marginRight: '10px' }}>
          Test Save
        </button>
        <button onClick={testHideWindow}>
          Test Hide Window
        </button>
      </div>
      
      <div style={{ marginTop: '20px' }}>
        <p>Window object keys: {Object.keys(window).length}</p>
        <p>ElectronAPI available: {electronAPI ? 'Yes' : 'No'}</p>
        {electronAPI && (
          <p>ElectronAPI methods: {Object.keys(electronAPI).join(', ')}</p>
        )}
      </div>
      
      <textarea 
        placeholder="Simple text area test"
        style={{ 
          width: '100%', 
          height: '100px', 
          marginTop: '20px',
          padding: '10px'
        }}
      />
    </div>
  )
}

export default TestApp