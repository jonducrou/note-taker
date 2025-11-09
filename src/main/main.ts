import { app, BrowserWindow, Menu, dialog, Tray, ipcMain } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { FileStorage } from '../storage/FileStorage'
import { TranscriptionManager } from './services/TranscriptionManager'
import { PermissionsService } from './services/PermissionsService'

// Get version from app instead of requiring package.json
const appVersion = app.getVersion()

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
const fileStorage = new FileStorage()
const transcriptionManager = new TranscriptionManager()
const permissionsService = new PermissionsService()
let isQuitting = false
let currentNoteId: string | null = null // Track current note for transcription lifecycle

const isDev = process.env.NODE_ENV === 'development'

function getTrayIconPath(): string | null {
  // Check if we're running from the project directory (assets folder exists)
  const isRunningFromProject = fs.existsSync(join(process.cwd(), 'assets'))
  
  let trayIconPath: string
  
  if (isRunningFromProject) {
    // Try the padded icons first
    trayIconPath = join(process.cwd(), 'assets/tray-icon-padded-32.png')
    if (fs.existsSync(trayIconPath)) {
      return trayIconPath
    }
    trayIconPath = join(process.cwd(), 'assets/tray-icon-padded-16.png')
    if (fs.existsSync(trayIconPath)) {
      return trayIconPath
    }
    // Fallback to original icons
    trayIconPath = join(process.cwd(), 'assets/tray-icon-32.png')
    if (fs.existsSync(trayIconPath)) {
      return trayIconPath
    }
    trayIconPath = join(process.cwd(), 'assets/tray-icon.png')
  } else {
    // Running from packaged app - use resources folder, try padded first
    trayIconPath = join(process.resourcesPath, 'assets/tray-icon-padded-32.png')
    if (fs.existsSync(trayIconPath)) {
      return trayIconPath
    }
    trayIconPath = join(process.resourcesPath, 'assets/tray-icon-padded-16.png')
    if (fs.existsSync(trayIconPath)) {
      return trayIconPath
    }
    // Fallback to original icons
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
    
    // Different window sizes for dev vs production
    const windowWidth = isDev ? 1200 : 300
    const windowHeight = isDev ? 800 : 400
    const x = isDev ? 50 : screenWidth - windowWidth - 20  // Center-left in dev, right edge in prod
    const y = isDev ? 50 : screenHeight - windowHeight - 20  // Top in dev, bottom in prod
    
    mainWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: x,
      y: y,
      show: false,
      alwaysOnTop: !isDev,  // Not always on top in dev mode for easier debugging
      resizable: isDev,     // Resizable in dev mode
      minimizable: isDev,   // Minimizable in dev mode  
      maximizable: isDev,   // Maximizable in dev mode
      fullscreenable: isDev,
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

    mainWindow.on('close', (event) => {
      if (!isQuitting) {
        event.preventDefault()
        mainWindow?.hide()
      }
    })

    mainWindow.on('closed', () => {
      mainWindow = null
    })

    // Privacy control: Start grace period when window is hidden
    mainWindow.on('hide', () => {
      transcriptionManager.onWindowHidden()
    })

    // Cancel grace period when window is shown (if on newest note)
    mainWindow.on('show', () => {
      if (currentNoteId) {
        transcriptionManager.onWindowShown(currentNoteId)
      }
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
    const priorWeekNotes = await fileStorage.getNotesForPriorWeek()
    const openNotes = await fileStorage.getOpenNotesFromLastMonth()
    const audienceGroupedNotes = await fileStorage.getNotesGroupedByAudienceFromLastMonth()
    
    
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

    // Build "With..." submenu from audience grouped notes
    const buildAudienceSubmenu = () => {
      const audienceEntries = Object.entries(audienceGroupedNotes).sort(([a], [b]) => a.localeCompare(b))
      
      if (audienceEntries.length === 0) {
        return [{ label: 'No audience notes', enabled: false }]
      }
      
      return audienceEntries.map(([audience, notes]) => {
        const totalIncomplete = notes.reduce((sum, note) => {
          return sum + fileStorage.countIncompleteItems(note.content)
        }, 0)
        
        const displayLabel = totalIncomplete > 0 ? `${audience} (${totalIncomplete})` : audience
        
        // Create submenu for this audience's notes, grouped by group and audience
        const audienceSubmenu = buildSubmenuItems(notes)
        
        return {
          label: displayLabel,
          submenu: audienceSubmenu
        }
      })
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
      {
        label: 'Delete Current Note',
        click: async () => {
          if (mainWindow) {
            const result = await dialog.showMessageBox(mainWindow, {
              type: 'warning',
              buttons: ['Cancel', 'Delete'],
              defaultId: 0,
              cancelId: 0,
              title: 'Delete Note',
              message: 'Are you sure you want to delete the current note?',
              detail: 'This action cannot be undone.'
            })
            
            if (result.response === 1) { // Delete button clicked
              mainWindow.webContents.send('delete-current-note')
            }
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Open Notes',
        submenu: buildSubmenuItems(openNotes)
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
      {
        label: 'Prior Week',
        submenu: buildSubmenuItems(priorWeekNotes)
      },
      { type: 'separator' },
      {
        label: 'With...',
        submenu: buildAudienceSubmenu()
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
        label: 'Open Notes',
        submenu: [{ label: 'No open items', enabled: false }]
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
      {
        label: 'Prior Week',
        submenu: [{ label: 'No notes', enabled: false }]
      },
      { type: 'separator' },
      {
        label: 'With...',
        submenu: [{ label: 'No audience notes', enabled: false }]
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

async function updateDockBadge() {
  try {
    const notesWithIncompleteItems = await fileStorage.getOpenNotesFromLastMonth()
    const totalCount = notesWithIncompleteItems.reduce((sum, note) => {
      return sum + fileStorage.countIncompleteItems(note.content)
    }, 0)
    updateTrayBadge(totalCount)
  } catch (error) {
    console.error('Failed to update dock badge:', error)
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
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' }
      ]
    }
  ]
  
  const menu = Menu.buildFromTemplate(template as any) // eslint-disable-line @typescript-eslint/no-explicit-any
  Menu.setApplicationMenu(menu)
}


// IPC handlers for file operations
ipcMain.handle('save-note', async (_event, content: string, group?: string, audience?: string[]) => {
  const result = await fileStorage.saveNote(content, group, audience)

  // Track current note ID and start recording for new notes
  const noteId = result.id
  const isNewNote = currentNoteId !== noteId
  currentNoteId = noteId

  if (isNewNote) {
    // Auto-start recording for newest note
    try {
      await transcriptionManager.onNoteCreated(noteId)
    } catch (error) {
      console.error('[Main] Failed to start recording for new note:', error)
    }
  }

  // Refresh tray menu to reflect new note
  await refreshTrayMenu()
  // Update dock badge with current incomplete count
  await updateDockBadge()
  return result
})

ipcMain.handle('load-notes', async () => {
  return await fileStorage.loadNotes()
})

ipcMain.handle('load-recent-note', async () => {
  try {
    console.log('IPC: Loading most recent note...')
    const recentNote = await fileStorage.loadMostRecentNote()
    console.log('IPC: Recent note loaded:', recentNote ? recentNote.id : 'null')
    return recentNote
  } catch (error) {
    console.error('IPC: Failed to load recent note:', error)
    return null
  }
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


ipcMain.handle('create-new-note', async () => {
  // Signal to create new note - just return success for now
  // Frontend will handle clearing current content and starting fresh
  return { success: true }
})


ipcMain.handle('load-note-by-id', async (_event, noteId: string) => {
  try {
    const notes = await fileStorage.loadNotes()
    const note = notes.find(n => n.id === noteId)

    if (note) {
      // Update current note tracking and handle grace period
      const previousNoteId = currentNoteId
      currentNoteId = noteId

      if (previousNoteId !== noteId) {
        // Switched to a different note - trigger grace period logic
        try {
          await transcriptionManager.onNoteSwitched(noteId)
        } catch (error) {
          console.error('[Main] Failed to handle note switch:', error)
        }
      }
    }

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
    // Update dock badge with current incomplete count
    await updateDockBadge()
    return { success: true }
  } catch (error) {
    console.error('Failed to update existing note:', error)
    return { success: false }
  }
})

ipcMain.handle('get-previous-note-id', async (_event, currentNoteId: string, skipNotesWithoutOpenActions?: boolean) => {
  try {
    const previousId = await fileStorage.getPreviousNoteId(currentNoteId, skipNotesWithoutOpenActions)
    return previousId
  } catch (error) {
    console.error('Failed to get previous note ID:', error)
    return null
  }
})

ipcMain.handle('get-next-note-id', async (_event, currentNoteId: string, skipNotesWithoutOpenActions?: boolean) => {
  try {
    const nextId = await fileStorage.getNextNoteId(currentNoteId, skipNotesWithoutOpenActions)
    return nextId
  } catch (error) {
    console.error('Failed to get next note ID:', error)
    return null
  }
})

ipcMain.handle('set-window-title', async (_event, title: string) => {
  try {
    if (mainWindow) {
      mainWindow.setTitle(title)
    }
    return { success: true }
  } catch (error) {
    console.error('Failed to set window title:', error)
    return { success: false }
  }
})

ipcMain.handle('delete-note', async (_event, noteId: string) => {
  try {
    const success = await fileStorage.deleteNote(noteId)
    if (success) {
      // Delete associated transcription if it exists
      await transcriptionManager.deleteTranscription(noteId).catch(err => {
        console.error('Failed to delete transcription:', err)
      })
      // Refresh tray menu to remove deleted note
      await createTray()
      // Update dock badge with current incomplete count
      await updateDockBadge()
    }
    return { success }
  } catch (error) {
    console.error('Failed to delete note:', error)
    return { success: false }
  }
})

// Transcription IPC handlers
ipcMain.handle('transcription-start', async (_event, noteId: string) => {
  try {
    await transcriptionManager.start(noteId)
    return { success: true }
  } catch (error: any) {
    console.error('Failed to start transcription:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('transcription-stop', async () => {
  try {
    await transcriptionManager.stop()
    return { success: true }
  } catch (error: any) {
    console.error('Failed to stop transcription:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('transcription-get-status', async () => {
  try {
    return transcriptionManager.getStatus()
  } catch (error) {
    console.error('Failed to get transcription status:', error)
    return {
      isRecording: false,
      isPaused: false
    }
  }
})

ipcMain.handle('transcription-has-transcription', async (_event, noteId: string) => {
  try {
    return await transcriptionManager.hasTranscription(noteId)
  } catch (error) {
    console.error('Failed to check transcription:', error)
    return false
  }
})

ipcMain.handle('transcription-get-content', async (_event, noteId: string) => {
  try {
    return await transcriptionManager.getTranscription(noteId)
  } catch (error) {
    console.error('Failed to get transcription content:', error)
    return null
  }
})

// Permissions IPC handlers
ipcMain.handle('permissions-check', async () => {
  try {
    return await permissionsService.checkPermissions()
  } catch (error) {
    console.error('Failed to check permissions:', error)
    return {
      microphone: 'not-determined',
      screenRecording: 'not-determined'
    }
  }
})

ipcMain.handle('permissions-request-microphone', async () => {
  try {
    return await permissionsService.requestMicrophonePermission()
  } catch (error) {
    console.error('Failed to request microphone permission:', error)
    return false
  }
})

ipcMain.handle('permissions-request-screen-recording', async () => {
  try {
    await permissionsService.requestScreenRecordingPermission()
    return true
  } catch (error) {
    console.error('Failed to request screen recording permission:', error)
    return false
  }
})

app.whenReady().then(async () => {
  // Initialize transcription manager
  try {
    await transcriptionManager.initialize()
    console.log('TranscriptionManager initialized')
  } catch (error) {
    console.error('Failed to initialize TranscriptionManager:', error)
  }

  createMenu()
  await createTray()
  createWindow()
  // Set initial dock badge count
  await updateDockBadge()

  app.on('activate', () => {
    // Dock icon click: show/hide window (same as tray left-click)
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
})

app.on('window-all-closed', () => {
  // Don't quit on macOS when windows are closed, but allow explicit quit
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  isQuitting = true
  if (tray) {
    tray.destroy()
  }
  // Cleanup services
  try {
    await transcriptionManager.cleanup()
    console.log('Services cleaned up successfully')
  } catch (error) {
    console.error('Failed to cleanup services:', error)
  }
})