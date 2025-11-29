import { TranscriptionManager } from '../main/services/TranscriptionManager'
import { EventEmitter } from 'events'

// Create mock streams
function createMockStream() {
  const stream = new EventEmitter()
  return stream
}

// Create mock worker with all required properties
function createMockWorker() {
  const emitter = new EventEmitter()
  const mockWorker = emitter as any
  mockWorker.send = jest.fn()
  mockWorker.kill = jest.fn()
  mockWorker.pid = 12345
  mockWorker.connected = true
  mockWorker.stdout = createMockStream()
  mockWorker.stderr = createMockStream()
  return mockWorker
}

// Store mock worker reference for tests
let mockWorker: any

// Mock child_process
jest.mock('child_process', () => ({
  fork: jest.fn(),
  spawn: jest.fn(() => {
    mockWorker = createMockWorker()
    return mockWorker
  }),
  exec: jest.fn((cmd, callback) => {
    // Mock successful sox check
    if (cmd === 'which sox') {
      callback(null, '/usr/bin/sox', '')
    } else {
      callback(new Error('Unknown command'), '', '')
    }
  })
}))

// Mock fs/promises
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  appendFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('')
}))

// Mock ModelDownloader
jest.mock('../main/services/ModelDownloader', () => ({
  ModelDownloader: jest.fn().mockImplementation(() => ({
    isModelAvailable: jest.fn().mockResolvedValue(true),
    getModelPath: jest.fn().mockReturnValue('/mock/model/path'),
    download: jest.fn().mockResolvedValue(undefined)
  }))
}))

// Mock os
jest.mock('os', () => ({
  homedir: jest.fn(() => '/mock/home')
}))

// Helper to simulate worker initialization
async function initializeManager(manager: TranscriptionManager) {
  const initPromise = manager.initialize()

  // Flush pending promises and timers
  await Promise.resolve()
  jest.advanceTimersByTime(0)
  await Promise.resolve()

  // Simulate worker ready sequence
  mockWorker.emit('message', { type: 'ready' })

  // Flush again
  await Promise.resolve()
  jest.advanceTimersByTime(0)
  await Promise.resolve()

  mockWorker.emit('message', { type: 'initialized', data: { success: true } })

  // Flush final
  await Promise.resolve()
  jest.advanceTimersByTime(0)
  await Promise.resolve()

  await initPromise
}

describe('TranscriptionManager', () => {
  let manager: TranscriptionManager

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    manager = new TranscriptionManager()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('Grace Period Logic', () => {
    it('should set newestNoteId when start() is called', async () => {
      await initializeManager(manager)

      const noteId = 'test-note-123.md'

      // Start recording - let it complete the async setup
      const startPromise = manager.start(noteId)

      // The start() method is async - wait for it to complete
      // This sets up file paths and sends the start command
      await startPromise

      // Verify isInitializing is true after start() completes
      expect(manager.getStatus().isInitializing).toBe(true)

      // Now simulate the worker responding to the start command
      mockWorker.emit('message', {
        type: 'recordingStarted',
        data: { sessionId: 'session-1' }
      })

      // Simulate started event (sets isRecording = true)
      mockWorker.emit('message', {
        type: 'started',
        data: { noteId, success: true }
      })

      // Verify status is recording
      const status = manager.getStatus()
      expect(status.isRecording).toBe(true)

      // Verify newestNoteId was set by checking that onWindowHidden starts grace period
      // (which only happens if newestNoteId is set)
      manager.onWindowHidden()

      // Recording should still be active
      expect(manager.getStatus().isRecording).toBe(true)

      // Advance past grace period (25 seconds)
      jest.advanceTimersByTime(26000)

      // Should have sent stop command (grace period expired)
      expect(mockWorker.send).toHaveBeenCalledWith({ type: 'stop' })
    })

    it('should cancel grace period when window is shown on newest note', async () => {
      await initializeManager(manager)

      const noteId = 'test-note-123.md'

      // Start recording - wait for async setup to complete
      await manager.start(noteId)

      // Simulate worker responding
      mockWorker.emit('message', {
        type: 'recordingStarted',
        data: { sessionId: 'session-1' }
      })
      mockWorker.emit('message', {
        type: 'started',
        data: { noteId, success: true }
      })

      // Reset mock to track new calls
      ;(mockWorker.send as jest.Mock).mockClear()

      // Hide window - starts grace period
      manager.onWindowHidden()

      // Advance halfway through grace period
      jest.advanceTimersByTime(10000)

      // Show window on the same note - should cancel grace period
      manager.onWindowShown(noteId)

      // Advance past where grace period would have expired
      jest.advanceTimersByTime(20000)

      // Stop should NOT have been called because grace period was cancelled
      const stopCalls = (mockWorker.send as jest.Mock).mock.calls.filter(
        (call: any) => call[0]?.type === 'stop'
      )
      expect(stopCalls.length).toBe(0)
    })

    it('should start grace period when navigating away from newest note', async () => {
      await initializeManager(manager)

      const newestNote = 'newest-note.md'
      const olderNote = 'older-note.md'

      // Start recording on newest note - wait for async setup
      await manager.start(newestNote)

      // Simulate worker responding
      mockWorker.emit('message', {
        type: 'recordingStarted',
        data: { sessionId: 'session-1' }
      })
      mockWorker.emit('message', {
        type: 'started',
        data: { noteId: newestNote, success: true }
      })

      // Reset mock
      ;(mockWorker.send as jest.Mock).mockClear()

      // Navigate to older note - should start grace period
      await manager.onNoteSwitched(olderNote)

      // Recording should still be active
      expect(manager.getStatus().isRecording).toBe(true)

      // Advance past grace period (25 seconds)
      jest.advanceTimersByTime(26000)

      // Should have stopped recording
      expect(mockWorker.send).toHaveBeenCalledWith({ type: 'stop' })
    })

    it('should cancel grace period when navigating back to newest note', async () => {
      await initializeManager(manager)

      const newestNote = 'newest-note.md'
      const olderNote = 'older-note.md'

      // Start recording - wait for async setup
      await manager.start(newestNote)

      // Simulate worker responding
      mockWorker.emit('message', {
        type: 'recordingStarted',
        data: { sessionId: 'session-1' }
      })
      mockWorker.emit('message', {
        type: 'started',
        data: { noteId: newestNote, success: true }
      })

      ;(mockWorker.send as jest.Mock).mockClear()

      // Navigate away - starts grace period
      await manager.onNoteSwitched(olderNote)

      // Advance partially through grace period
      jest.advanceTimersByTime(10000)

      // Navigate back to newest note - should cancel grace period
      await manager.onNoteSwitched(newestNote)

      // Advance past original grace period expiry
      jest.advanceTimersByTime(20000)

      // Stop should NOT have been called
      const stopCalls = (mockWorker.send as jest.Mock).mock.calls.filter(
        (call: any) => call[0]?.type === 'stop'
      )
      expect(stopCalls.length).toBe(0)
    })
  })

  describe('sendToWorker Error Handling', () => {
    it('should handle worker send errors gracefully', async () => {
      await initializeManager(manager)

      // Make worker.send throw an error
      ;(mockWorker.send as jest.Mock).mockImplementation(() => {
        throw new Error('IPC channel closed')
      })

      const noteId = 'test-note.md'

      // This should not throw, just log and handle gracefully
      await expect(manager.start(noteId)).resolves.not.toThrow()

      // Status should be reset due to worker disconnect
      const status = manager.getStatus()
      expect(status.isRecording).toBe(false)
      expect(status.isInitializing).toBe(false)
    })

    it('should cleanup state when worker disconnects', async () => {
      await initializeManager(manager)

      // Start recording - wait for async setup
      await manager.start('test-note.md')

      // Simulate worker responding
      mockWorker.emit('message', {
        type: 'recordingStarted',
        data: { sessionId: 'session-1' }
      })
      mockWorker.emit('message', {
        type: 'started',
        data: { noteId: 'test-note.md', success: true }
      })

      expect(manager.getStatus().isRecording).toBe(true)

      // Simulate worker exit
      mockWorker.emit('exit', 1)

      // workerReady should be false (checked indirectly)
      // Starting again should fail
      ;(mockWorker.send as jest.Mock).mockClear()

      // Worker is marked as not ready after exit
      await expect(manager.start('another-note.md')).rejects.toThrow('Worker not initialized')
    })
  })

  describe('Session Transcript Handling', () => {
    it('should map session ID to note file paths', async () => {
      await initializeManager(manager)
      const fs = require('fs/promises')

      const noteId = 'test-note.md'
      const sessionId = 'session-123'

      // Start recording - wait for async setup
      await manager.start(noteId)

      // Simulate worker responding
      mockWorker.emit('message', {
        type: 'recordingStarted',
        data: { sessionId }
      })
      mockWorker.emit('message', {
        type: 'started',
        data: { noteId, success: true }
      })

      // Clear any previous calls
      ;(fs.appendFile as jest.Mock).mockClear()

      // Simulate session transcript event
      mockWorker.emit('message', {
        type: 'sessionTranscript',
        data: {
          sessionId,
          text: 'Test transcript',
          wordCount: 2,
          confidence: 0.95
        }
      })

      // Wait for async handling
      await Promise.resolve()
      jest.advanceTimersByTime(100)
      await Promise.resolve()

      // Verify transcript was written
      expect(fs.appendFile).toHaveBeenCalled()
      const appendCall = (fs.appendFile as jest.Mock).mock.calls[0]
      expect(appendCall[0]).toContain('test-note.md.transcription')
      expect(appendCall[1]).toContain('Test transcript')
    })
  })

  describe('Status Tracking', () => {
    it('should return correct initial status', () => {
      const status = manager.getStatus()
      expect(status.isRecording).toBe(false)
      expect(status.isInitializing).toBe(false)
      expect(status.isProcessingTranscript).toBe(false)
      expect(status.isPaused).toBe(false)
    })

    it('should track initializing state correctly', async () => {
      await initializeManager(manager)

      // Start recording and wait for it to set up (but not for worker response)
      await manager.start('test-note.md')

      // Should be initializing after start() completes
      expect(manager.getStatus().isInitializing).toBe(true)
      expect(manager.getStatus().isRecording).toBe(false)

      // Simulate worker responding
      mockWorker.emit('message', {
        type: 'recordingStarted',
        data: { sessionId: 'session-1' }
      })
      mockWorker.emit('message', {
        type: 'started',
        data: { noteId: 'test-note.md', success: true }
      })

      // Should now be recording
      expect(manager.getStatus().isRecording).toBe(true)
      expect(manager.getStatus().isInitializing).toBe(false)
    })
  })

  describe('isActive()', () => {
    it('should return false when not recording', async () => {
      await initializeManager(manager)
      expect(manager.isActive()).toBe(false)
    })

    it('should return true when recording', async () => {
      await initializeManager(manager)

      // Start recording - wait for async setup
      await manager.start('test-note.md')

      // Simulate worker responding
      mockWorker.emit('message', {
        type: 'recordingStarted',
        data: { sessionId: 'session-1' }
      })
      mockWorker.emit('message', {
        type: 'started',
        data: { noteId: 'test-note.md', success: true }
      })

      expect(manager.isActive()).toBe(true)
    })

    it('should return true when initializing', async () => {
      await initializeManager(manager)

      // Start recording - wait for async setup
      await manager.start('test-note.md')

      // After start() completes, isInitializing is true
      expect(manager.isActive()).toBe(true)
    })

    it('should return true when processing transcript', async () => {
      await initializeManager(manager)

      // Start recording - wait for async setup
      await manager.start('test-note.md')

      // Simulate worker responding
      mockWorker.emit('message', {
        type: 'recordingStarted',
        data: { sessionId: 'session-1' }
      })
      mockWorker.emit('message', {
        type: 'started',
        data: { noteId: 'test-note.md', success: true }
      })

      // Stop recording - should enter processing state
      manager.stop()

      // Simulate recordingStopped which sets isProcessingTranscript
      mockWorker.emit('message', {
        type: 'recordingStopped',
        data: {}
      })

      expect(manager.isActive()).toBe(true)
      expect(manager.getStatus().isProcessingTranscript).toBe(true)
    })
  })

  describe('stopAndWaitForTranscript', () => {
    it('should resolve when transcript is received', async () => {
      await initializeManager(manager)

      // Start recording - wait for async setup
      await manager.start('test-note.md')

      // Simulate worker responding
      mockWorker.emit('message', {
        type: 'recordingStarted',
        data: { sessionId: 'session-1' }
      })
      mockWorker.emit('message', {
        type: 'started',
        data: { noteId: 'test-note.md', success: true }
      })

      // Start stop and wait
      const stopPromise = manager.stopAndWaitForTranscript(5000)

      // Wait a bit
      jest.advanceTimersByTime(100)
      await Promise.resolve()

      // Simulate transcript received
      mockWorker.emit('message', {
        type: 'sessionTranscript',
        data: {
          sessionId: 'session-1',
          text: 'Final transcript',
          wordCount: 2,
          confidence: 0.9
        }
      })

      // Should resolve
      await expect(stopPromise).resolves.not.toThrow()
    })

    it('should timeout if transcript not received', async () => {
      await initializeManager(manager)

      // Start recording - wait for async setup
      await manager.start('test-note.md')

      // Simulate worker responding
      mockWorker.emit('message', {
        type: 'recordingStarted',
        data: { sessionId: 'session-1' }
      })
      mockWorker.emit('message', {
        type: 'started',
        data: { noteId: 'test-note.md', success: true }
      })

      // Start stop and wait with short timeout
      const stopPromise = manager.stopAndWaitForTranscript(1000)

      // Advance past timeout
      jest.advanceTimersByTime(2000)

      // Should resolve (timeout triggers resolve, not reject)
      await expect(stopPromise).resolves.not.toThrow()
    })

    it('should return immediately if not recording', async () => {
      await initializeManager(manager)

      // Not recording, should return immediately
      await expect(manager.stopAndWaitForTranscript()).resolves.not.toThrow()
    })
  })
})
