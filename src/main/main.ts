import { app, BrowserWindow, Menu, dialog } from 'electron'
import { join } from 'path'

let mainWindow: BrowserWindow | null = null

const isDev = process.env.NODE_ENV === 'development'

function createWindow() {
  console.log('=== CREATING WINDOW ===')
  
  try {
    // Force window to center of screen
    const { screen } = require('electron')
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
    
    const windowWidth = 600  // Make it wider to be more visible
    const windowHeight = 700 // Make it taller
    // Position in top-left corner to be easily findable
    const x = 100
    const y = 100
    
    console.log(`Screen info: ${screenWidth}x${screenHeight}`)
    console.log(`Window will be positioned at: ${x}, ${y}`)
    console.log(`Window size: ${windowWidth}x${windowHeight}`)
    
    console.log('Creating BrowserWindow instance...')
    mainWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: x,
      y: y,
      show: false, // Don't show until ready
      alwaysOnTop: false, // Disable always-on-top for now to test usability
      resizable: true,
      minimizable: true,
      maximizable: true,
      titleBarStyle: 'default', // Use default title bar for easier debugging
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: join(__dirname, 'preload.js'),
        webSecurity: !isDev
      }
    })
    console.log('BrowserWindow created successfully')

    // Add comprehensive event logging
    mainWindow.webContents.on('dom-ready', () => {
      console.log('DOM ready event')
    })
    
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('Did finish load event')
    })
    
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Did fail load event:', errorCode, errorDescription)
    })

    mainWindow.once('ready-to-show', () => {
      console.log('=== WINDOW READY TO SHOW ===')
      if (mainWindow) {
        console.log('Making window visible...')
        
        // Simple show and focus
        mainWindow.show()
        mainWindow.focus()
        
        console.log('Window state after show:')
        console.log('  Bounds:', mainWindow.getBounds())
        console.log('  Visible:', mainWindow.isVisible())
        console.log('  Focused:', mainWindow.isFocused())
        console.log('  Always on top:', mainWindow.isAlwaysOnTop())
        
        // Add devtools for debugging the React content
        if (!isDev) {
          console.log('Opening DevTools to debug React content...')
          mainWindow.webContents.openDevTools()
        }
        
        // Flash the window to help locate it
        setTimeout(() => {
          if (mainWindow) {
            console.log('Flashing window to help locate it...')
            // Flash the window to make it visible
            for (let i = 0; i < 3; i++) {
              setTimeout(() => {
                if (mainWindow) {
                  mainWindow.flashFrame(true)
                  setTimeout(() => {
                    if (mainWindow) mainWindow.flashFrame(false)
                  }, 200)
                }
              }, i * 600)
            }
          }
        }, 1000)
      }
    })

    console.log('Setting up content loading...')
    if (isDev) {
      console.log('Loading development URL...')
      mainWindow.loadURL('http://localhost:5173')
      mainWindow.webContents.openDevTools()
    } else {
      console.log('Loading production file...')
      const htmlPath = join(__dirname, '../../renderer/index.html')
      console.log('HTML path:', htmlPath)
      
      // Check if file exists first
      const fs = require('fs')
      if (fs.existsSync(htmlPath)) {
        console.log('HTML file exists, loading...')
        mainWindow.loadFile(htmlPath).catch(err => {
          console.error('Failed to load file:', err)
          // Fallback: load a simple HTML string
          console.log('Loading fallback HTML...')
          mainWindow?.loadURL('data:text/html,<html><body style="font-family: system-ui; padding: 20px;"><h1>Note Taker</h1><p>File loading failed, but Electron is working!</p><textarea style="width: 100%; height: 200px;" placeholder="You can type here..."></textarea></body></html>')
        })
      } else {
        console.error('HTML file does not exist:', htmlPath)
        console.log('Loading fallback HTML...')
        mainWindow.loadURL('data:text/html,<html><body style="font-family: system-ui; padding: 20px;"><h1>Note Taker</h1><p>HTML file not found, using fallback!</p><textarea style="width: 100%; height: 200px;" placeholder="You can type here..."></textarea></body></html>')
      }
    }

    console.log('Setting up window event handlers...')
    mainWindow.on('closed', () => {
      console.log('Window closed event')
      mainWindow = null
    })
    
    mainWindow.on('show', () => {
      console.log('Window show event triggered')
    })
    
    mainWindow.on('focus', () => {
      console.log('Window focus event triggered')
    })
    
    mainWindow.on('blur', () => {
      console.log('Window blur event triggered')
    })
    
    console.log('=== WINDOW CREATION COMPLETE ===')
    return mainWindow
  } catch (error) {
    console.error('=== WINDOW CREATION FAILED ===')
    console.error('Error creating window:', error)
    
    // Show error dialog
    dialog.showErrorBox('Window Creation Failed', `Failed to create Note Taker window:\n\n${error}`)
    return null
  }
}

function createMenu() {
  console.log('Creating menu...')
  
  const template = [
    {
      label: 'Note Taker',
      submenu: [
        {
          label: 'Show Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            console.log('Menu: Show Window clicked')
            if (mainWindow) {
              console.log('Window exists, showing...')
              mainWindow.show()
              mainWindow.focus()
            } else {
              console.log('Window does not exist, creating new one...')
              createWindow()
            }
          }
        },
        {
          label: 'Force Create New Window',
          click: () => {
            console.log('Menu: Force Create New Window clicked')
            createWindow()
          }
        },
        {
          label: 'Debug Window State',
          click: () => {
            console.log('Menu: Debug Window State clicked')
            if (mainWindow) {
              const bounds = mainWindow.getBounds()
              const info = `Window State:
Position: ${bounds.x}, ${bounds.y}
Size: ${bounds.width}x${bounds.height}
Visible: ${mainWindow.isVisible()}
Focused: ${mainWindow.isFocused()}
Always on top: ${mainWindow.isAlwaysOnTop()}
Minimized: ${mainWindow.isMinimized()}
Maximized: ${mainWindow.isMaximized()}`
              console.log(info)
              dialog.showMessageBox({
                type: 'info',
                title: 'Window Debug Info',
                message: info
              })
            } else {
              console.log('No window exists')
              dialog.showMessageBox({
                type: 'warning',
                title: 'No Window',
                message: 'No window currently exists'
              })
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            console.log('Menu: Quit clicked')
            app.quit()
          }
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'CmdOrCtrl+M',
          click: () => {
            if (mainWindow) mainWindow.minimize()
          }
        },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            if (mainWindow) mainWindow.close()
          }
        }
      ]
    }
  ]
  
  const menu = Menu.buildFromTemplate(template as any)
  Menu.setApplicationMenu(menu)
  console.log('Menu created and set')
}


console.log('App starting...')

app.whenReady().then(() => {
  console.log('=== APP READY EVENT ===')
  
  // Create menu first
  createMenu()
  
  // Request accessibility permissions on macOS
  if (process.platform === 'darwin') {
    const { systemPreferences } = require('electron')
    console.log('Checking macOS permissions...')
    
    // Check if we have accessibility permissions
    const hasAccessibility = systemPreferences.isTrustedAccessibilityClient(false)
    console.log('Has accessibility permissions:', hasAccessibility)
    
    if (!hasAccessibility) {
      console.log('Requesting accessibility permissions...')
      systemPreferences.isTrustedAccessibilityClient(true)
    }
  }
  
  console.log('Creating initial window...')
  // Add a small delay to ensure macOS is ready
  setTimeout(() => {
    const result = createWindow()
    if (!result) {
      console.error('Failed to create initial window')
    }
  }, 500)

  app.on('activate', () => {
    console.log('App activate event')
    if (BrowserWindow.getAllWindows().length === 0) {
      console.log('No windows exist, creating new one')
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

console.log('Main process setup complete')