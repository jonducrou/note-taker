import { app, BrowserWindow, Menu, dialog, Tray, ipcMain } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { FileStorage } from '../storage/FileStorage'

// Get version from app instead of requiring package.json
const appVersion = app.getVersion()

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
const fileStorage = new FileStorage()

const isDev = process.env.NODE_ENV === 'development'

function getTrayIconPath(): string | null {
  // Check if we're running from the project directory (assets folder exists)
  const isRunningFromProject = fs.existsSync(join(process.cwd(), 'assets'))
  
  let trayIconPath: string
  
  if (isRunningFromProject) {
    // Try the SVG-converted 32x32 PNG first, fallback to original PNG
    trayIconPath = join(process.cwd(), 'assets/tray-icon-32.png')
    if (fs.existsSync(trayIconPath)) {
      return trayIconPath
    }
    trayIconPath = join(process.cwd(), 'assets/tray-icon.png')
  } else {
    // Running from packaged app - use resources folder
    trayIconPath = join(process.resourcesPath, 'assets/tray-icon-32.png')
    if (fs.existsSync(trayIconPath)) {
      return trayIconPath
    }
    trayIconPath = join(process.resourcesPath, 'assets/tray-icon.png')
  }
  
  return fs.existsSync(trayIconPath) ? trayIconPath : null
}

function createWindow() {
  try {
    const { screen } = require('electron') // eslint-disable-line @typescript-eslint/no-var-requires
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
    
    const windowWidth = 300
    const windowHeight = 400
    const x = screenWidth - windowWidth - 20  // 20px from right edge
    const y = screenHeight - windowHeight - 20  // 20px from bottom edge
    
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
    
    // Remove auto-hide on blur - window should stay visible
    
    return mainWindow
  } catch (error) {
    console.error('Error creating window:', error)
    dialog.showErrorBox('Window Creation Failed', `Failed to create Note Taker window:\n\n${error}`)
    return null
  }
}

async function createTray() {
  try {
    const trayIconPath = getTrayIconPath()
    
    if (!trayIconPath) {
      console.warn('Tray icon not found, menu bar will not be available')
      return
    }
    
    tray = new Tray(trayIconPath)
    tray.setToolTip('Note Taker')
    
    // Left click: show/hide window  
    tray.on('click', () => {
      console.log('Tray click detected')
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide()
        } else {
          mainWindow.show()
          mainWindow.focus()
        }
      } else {
        createWindow()
      }
    })
    
    // Right click: show context menu
    tray.on('right-click', async () => {
      console.log('Tray right-click detected')
      const menuItems = cachedMenuItems || await buildPermanentTrayMenu()
      const contextMenu = Menu.buildFromTemplate(menuItems as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      tray?.popUpContextMenu(contextMenu)
    })
  } catch (error) {
    console.warn('Failed to create system tray:', error)
  }
}

// Cache for menu items to avoid rebuilding on every right-click
let cachedMenuItems: any[] | null = null

async function buildPermanentTrayMenu(): Promise<any[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const todayNotes = await fileStorage.getNotesForToday()
    const yesterdayNotes = await fileStorage.getNotesForYesterday()
    
    console.log('Building menu - Today:', todayNotes.length, 'Yesterday:', yesterdayNotes.length)
    
    const buildSubmenuItems = (notes: any[]) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (notes.length === 0) {
        return [{
          label: 'No notes',
          enabled: false
        }]
      }

      const grouped = fileStorage.groupNotesByGroupAndAudience(notes)
      const items: any[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
      
      Object.entries(grouped).forEach(([key, notesList]) => {
        const totalIncomplete = notesList.reduce((sum, note) => {
          return sum + fileStorage.countIncompleteItems(note.content)
        }, 0)
        
        const displayLabel = totalIncomplete > 0 ? `${key} (${totalIncomplete})` : key
        
        items.push({
          label: displayLabel,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('load-note', notesList[0].id)
              mainWindow.show()
              mainWindow.focus()
            }
          }
        })
      })
      
      return items
    }

    const menuItems = [
      {
        label: 'Show Notes',
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
        label: 'Today',
        submenu: buildSubmenuItems(todayNotes)
      },
      {
        label: 'Yesterday', 
        submenu: buildSubmenuItems(yesterdayNotes)
      },
      { type: 'separator' },
      {
        label: `Note Taker v${appVersion}`,
        enabled: false
      },
      {
        label: 'Quit Note Taker',
        click: () => {
          app.quit()
        }
      }
    ]
    
    // Cache the menu items
    cachedMenuItems = menuItems
    return menuItems
    
  } catch (error) {
    console.error('Failed to build menu:', error)
    return [
      {
        label: 'Show Notes',
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
        label: 'Today',
        submenu: [{ label: 'No notes', enabled: false }]
      },
      {
        label: 'Yesterday',
        submenu: [{ label: 'No notes', enabled: false }]
      },
      { type: 'separator' },
      {
        label: 'Quit Note Taker',
        click: () => {
          app.quit()
        }
      }
    ]
  }
}

// Function to refresh the cached menu
async function refreshTrayMenu(): Promise<void> {
  console.log('Refreshing tray menu...')
  cachedMenuItems = null // Clear cache
  await buildPermanentTrayMenu() // Rebuild cache
}

function updateTrayBadge(count: number) {
  // Update dock badge only
  if (count > 0) {
    app.setBadgeCount(count)
  } else {
    app.setBadgeCount(0)
  }
  
  // The menu will be rebuilt on next right-click, so no explicit refresh needed here
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


// IPC handlers for file operations
ipcMain.handle('save-note', async (_event, content: string, group?: string, audience?: string[]) => {
  const result = await fileStorage.saveNote(content, group, audience)
  // Refresh tray menu to reflect new note
  await refreshTrayMenu()
  return result
})

ipcMain.handle('load-notes', async () => {
  return await fileStorage.loadNotes()
})

ipcMain.handle('load-recent-note', async () => {
  return await fileStorage.loadMostRecentNote()
})

ipcMain.handle('search-notes', async (_event, query: string) => {
  return await fileStorage.searchNotes(query)
})

ipcMain.handle('get-group-suggestions', async () => {
  return await fileStorage.getGroupSuggestions()
})

ipcMain.handle('get-audience-suggestions', async () => {
  return await fileStorage.getAudienceSuggestions()
})

ipcMain.handle('get-recent-group-suggestions', async (_event, prefix?: string) => {
  return await fileStorage.getRecentGroupSuggestions(prefix)
})

ipcMain.handle('get-recent-audience-suggestions', async (_event, prefix?: string) => {
  return await fileStorage.getRecentAudienceSuggestions(prefix)
})

ipcMain.handle('update-badge', async (_event, count: number) => {
  updateTrayBadge(count)
  return { success: true }
})

ipcMain.handle('create-new-note', async () => {
  // Signal to create new note - just return success for now
  // Frontend will handle clearing current content and starting fresh
  return { success: true }
})

ipcMain.handle('get-menu-structure', async () => {
  try {
    const todayNotes = await fileStorage.getNotesForToday()
    const yesterdayNotes = await fileStorage.getNotesForYesterday()
    const previousWeekNotes = await fileStorage.getNotesForPreviousWeek()

    const buildMenuItems = (notes: any[], label: string) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const grouped = fileStorage.groupNotesByGroupAndAudience(notes)
      const items: any[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
      
      Object.entries(grouped).forEach(([key, notesList]) => {
        const totalIncomplete = notesList.reduce((sum, note) => {
          return sum + fileStorage.countIncompleteItems(note.content)
        }, 0)
        
        const displayLabel = totalIncomplete > 0 ? `${key} (${totalIncomplete})` : key
        
        items.push({
          label: displayLabel,
          noteId: notesList[0].id,
          incompleteCount: totalIncomplete
        })
      })
      
      return items.length > 0 ? [{
        label: label,
        submenu: items
      }] : []
    }

    const menuStructure = [
      ...buildMenuItems(todayNotes, 'Today'),
      ...buildMenuItems(yesterdayNotes, 'Yesterday'), 
      ...buildMenuItems(previousWeekNotes, 'Previous Week')
    ]

    return { menuStructure }
  } catch (error) {
    console.error('Failed to build menu structure:', error)
    return { menuStructure: [] }
  }
})

ipcMain.handle('load-note-by-id', async (_event, noteId: string) => {
  try {
    const notes = await fileStorage.loadNotes()
    const note = notes.find(n => n.id === noteId)
    return note || null
  } catch (error) {
    console.error('Failed to load note by ID:', error)
    return null
  }
})

ipcMain.handle('update-existing-note', async (_event, noteId: string, content: string) => {
  try {
    await fileStorage.updateExistingNote(noteId, content)
    // Refresh tray menu to reflect updated note
    await refreshTrayMenu()
    return { success: true }
  } catch (error) {
    console.error('Failed to update existing note:', error)
    return { success: false }
  }
})

app.whenReady().then(async () => {
  createMenu()
  await createTray()
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

app.on('before-quit', () => {
  if (tray) {
    tray.destroy()
  }
})