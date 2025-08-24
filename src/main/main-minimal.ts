import { app, BrowserWindow } from 'electron'
import { join } from 'path'

let mainWindow: BrowserWindow | null = null

const isDev = process.env.NODE_ENV === 'development'

function createWindow() {
  console.log('Creating window...')
  
  mainWindow = new BrowserWindow({
    width: 300,
    height: 400,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
      webSecurity: !isDev
    }
  })

  if (isDev) {
    console.log('Loading development URL...')
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    console.log('Loading production file...')
    const htmlPath = join(__dirname, '../../renderer/index.html')
    console.log('HTML path:', htmlPath)
    mainWindow.loadFile(htmlPath)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
  
  console.log('Window created successfully')
}

console.log('App starting...')

app.whenReady().then(() => {
  console.log('App ready, creating window...')
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
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