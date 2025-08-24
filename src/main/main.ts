import { app, BrowserWindow, Menu, dialog } from 'electron'
import { join } from 'path'

let mainWindow: BrowserWindow | null = null

const isDev = process.env.NODE_ENV === 'development'

function createWindow() {
  try {
    const { screen } = require('electron') // eslint-disable-line @typescript-eslint/no-var-requires
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
    
    const windowWidth = 300
    const windowHeight = 400
    const x = Math.floor((screenWidth - windowWidth) / 2)
    const y = Math.floor((screenHeight - windowHeight) / 2)
    
    mainWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: x,
      y: y,
      show: false,
      alwaysOnTop: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      titleBarStyle: 'hiddenInset',
      vibrancy: 'under-window',
      visualEffectState: 'active',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: join(__dirname, 'preload.js'),
        webSecurity: !isDev
      }
    })

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error('Failed to load content:', errorCode, errorDescription)
    })

    mainWindow.once('ready-to-show', () => {
      if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
        
        if (isDev) {
          mainWindow.webContents.openDevTools()
        }
      }
    })

    if (isDev) {
      mainWindow.loadURL('http://localhost:5173')
    } else {
      const htmlPath = join(__dirname, '../../renderer/index.html')
      mainWindow.loadFile(htmlPath).catch(err => {
        console.error('Failed to load file:', err)
      })
    }

    mainWindow.on('closed', () => {
      mainWindow = null
    })
    
    mainWindow.on('blur', () => {
      if (mainWindow) {
        mainWindow.hide()
      }
    })
    
    return mainWindow
  } catch (error) {
    console.error('Error creating window:', error)
    dialog.showErrorBox('Window Creation Failed', `Failed to create Note Taker window:\n\n${error}`)
    return null
  }
}

function createMenu() {
  const template = [
    {
      label: 'Note Taker',
      submenu: [
        {
          label: 'Show Notes',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            if (mainWindow) {
              mainWindow.show()
              mainWindow.focus()
            } else {
              createWindow()
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit()
          }
        }
      ]
    }
  ]
  
  const menu = Menu.buildFromTemplate(template as any) // eslint-disable-line @typescript-eslint/no-explicit-any
  Menu.setApplicationMenu(menu)
}


app.whenReady().then(() => {
  createMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', (_event: Event) => {
  _event.preventDefault()
})