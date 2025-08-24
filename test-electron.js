const { app, BrowserWindow } = require('electron')

console.log('=== ELECTRON TEST START ===')
console.log('Electron version:', process.versions.electron)
console.log('Node version:', process.versions.node)
console.log('Platform:', process.platform)
console.log('Arch:', process.arch)

function createWindow() {
  console.log('Creating test window...')
  
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  win.once('ready-to-show', () => {
    console.log('Window ready to show')
    win.show()
    win.focus()
  })

  win.on('closed', () => {
    console.log('Window closed')
  })

  // Load a simple HTML string instead of file
  win.loadURL('data:text/html,<html><body><h1>Electron Test Window</h1><p>If you see this, Electron is working!</p></body></html>')
  
  console.log('Window creation completed')
}

console.log('Setting up app event handlers...')

app.whenReady().then(() => {
  console.log('App ready event fired')
  createWindow()
})

app.on('window-all-closed', () => {
  console.log('All windows closed')
  app.quit()
})

app.on('activate', () => {
  console.log('App activate event')
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

console.log('=== ELECTRON TEST SETUP COMPLETE ===')