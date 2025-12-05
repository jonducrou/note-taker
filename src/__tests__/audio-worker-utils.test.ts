/**
 * Comprehensive tests for Audio Worker Utilities
 *
 * Testing the absolute shit out of the worker utilities
 */

import {
  RingBufferLogger,
  dumpLogsToFile,
  saveFallbackData,
  isIPCDisconnectedError,
  createTranscriberOptions,
  shouldSkipSnippet,
  filterSnippet,
  stopWithTimeout,
  createSignalHandlers,
  MIN_CONFIDENCE,
  SESSION_TIMEOUT_MS
} from '../main/services/audio-worker-utils'

// Mock fs before imports
jest.mock('fs', () => ({
  writeFileSync: jest.fn()
}))

// Mock os before imports
jest.mock('os', () => ({
  homedir: jest.fn(() => '/mock/home')
}))

// Get mocked functions after mocking
const mockWriteFileSync = jest.requireMock('fs').writeFileSync as jest.Mock

describe('Audio Worker Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // ============================================================
  // RingBufferLogger Tests
  // ============================================================
  describe('RingBufferLogger', () => {
    describe('constructor', () => {
      it('should create logger with default max size of 100', () => {
        const logger = new RingBufferLogger()
        expect(logger.getMaxSize()).toBe(100)
        expect(logger.getBufferSize()).toBe(0)
      })

      it('should create logger with custom max size', () => {
        const logger = new RingBufferLogger(50)
        expect(logger.getMaxSize()).toBe(50)
      })

      it('should generate unique start time', () => {
        const logger1 = new RingBufferLogger()
        jest.advanceTimersByTime(1000)
        const logger2 = new RingBufferLogger()
        expect(logger1.getStartTime()).not.toBe(logger2.getStartTime())
      })

      it('should format start time without colons or dots', () => {
        const logger = new RingBufferLogger()
        expect(logger.getStartTime()).not.toContain(':')
        expect(logger.getStartTime()).not.toContain('.')
      })
    })

    describe('add()', () => {
      it('should add log entry with INFO level', () => {
        const logger = new RingBufferLogger()
        logger.add('INFO', 'test message')
        expect(logger.getBufferSize()).toBe(1)
        const logs = logger.getOrderedLogs()
        expect(logs[0]).toContain('[INFO]')
        expect(logs[0]).toContain('test message')
      })

      it('should add log entry with ERROR level', () => {
        const logger = new RingBufferLogger()
        logger.add('ERROR', 'error message')
        const logs = logger.getOrderedLogs()
        expect(logs[0]).toContain('[ERROR]')
        expect(logs[0]).toContain('error message')
      })

      it('should add timestamp to log entries', () => {
        const logger = new RingBufferLogger()
        logger.add('INFO', 'test')
        const logs = logger.getOrderedLogs()
        // ISO timestamp format: [YYYY-MM-DDTHH:mm:ss.sssZ]
        expect(logs[0]).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      })

      it('should handle multiple arguments', () => {
        const logger = new RingBufferLogger()
        logger.add('INFO', 'arg1', 'arg2', 'arg3')
        const logs = logger.getOrderedLogs()
        expect(logs[0]).toContain('arg1 arg2 arg3')
      })

      it('should stringify objects', () => {
        const logger = new RingBufferLogger()
        logger.add('INFO', { key: 'value', nested: { a: 1 } })
        const logs = logger.getOrderedLogs()
        expect(logs[0]).toContain('"key": "value"')
        expect(logs[0]).toContain('"nested"')
      })

      it('should handle null and undefined', () => {
        const logger = new RingBufferLogger()
        logger.add('INFO', null, undefined)
        const logs = logger.getOrderedLogs()
        expect(logs[0]).toContain('null undefined')
      })

      it('should handle numbers and booleans', () => {
        const logger = new RingBufferLogger()
        logger.add('INFO', 42, true, false)
        const logs = logger.getOrderedLogs()
        expect(logs[0]).toContain('42 true false')
      })

      it('should handle Error objects', () => {
        const logger = new RingBufferLogger()
        const error = new Error('test error')
        logger.add('ERROR', error.message, error.stack)
        const logs = logger.getOrderedLogs()
        expect(logs[0]).toContain('test error')
      })
    })

    describe('log() and error() shortcuts', () => {
      it('should add INFO level via log()', () => {
        const logger = new RingBufferLogger()
        logger.log('info message')
        const logs = logger.getOrderedLogs()
        expect(logs[0]).toContain('[INFO]')
      })

      it('should add ERROR level via error()', () => {
        const logger = new RingBufferLogger()
        logger.error('error message')
        const logs = logger.getOrderedLogs()
        expect(logs[0]).toContain('[ERROR]')
      })
    })

    describe('ring buffer behavior', () => {
      it('should not overflow before reaching max size', () => {
        const logger = new RingBufferLogger(5)
        for (let i = 0; i < 5; i++) {
          logger.add('INFO', `message ${i}`)
        }
        expect(logger.getBufferSize()).toBe(5)
        const logs = logger.getOrderedLogs()
        expect(logs[0]).toContain('message 0')
        expect(logs[4]).toContain('message 4')
      })

      it('should overwrite oldest entries when buffer is full', () => {
        const logger = new RingBufferLogger(3)
        logger.add('INFO', 'message 0')
        logger.add('INFO', 'message 1')
        logger.add('INFO', 'message 2')
        logger.add('INFO', 'message 3') // Should overwrite message 0

        const logs = logger.getOrderedLogs()
        expect(logs).toHaveLength(3)
        expect(logs[0]).toContain('message 1')
        expect(logs[1]).toContain('message 2')
        expect(logs[2]).toContain('message 3')
      })

      it('should maintain correct order after multiple overwrites', () => {
        const logger = new RingBufferLogger(3)
        for (let i = 0; i < 10; i++) {
          logger.add('INFO', `message ${i}`)
        }

        const logs = logger.getOrderedLogs()
        expect(logs).toHaveLength(3)
        expect(logs[0]).toContain('message 7')
        expect(logs[1]).toContain('message 8')
        expect(logs[2]).toContain('message 9')
      })

      it('should handle edge case of buffer size 1', () => {
        const logger = new RingBufferLogger(1)
        logger.add('INFO', 'first')
        logger.add('INFO', 'second')
        logger.add('INFO', 'third')

        const logs = logger.getOrderedLogs()
        expect(logs).toHaveLength(1)
        expect(logs[0]).toContain('third')
      })

      it('should handle large number of entries', () => {
        const logger = new RingBufferLogger(100)
        for (let i = 0; i < 1000; i++) {
          logger.add('INFO', `message ${i}`)
        }

        const logs = logger.getOrderedLogs()
        expect(logs).toHaveLength(100)
        expect(logs[0]).toContain('message 900')
        expect(logs[99]).toContain('message 999')
      })
    })

    describe('getOrderedLogs()', () => {
      it('should return empty array when no logs', () => {
        const logger = new RingBufferLogger()
        expect(logger.getOrderedLogs()).toEqual([])
      })

      it('should return copy of logs (not modify original)', () => {
        const logger = new RingBufferLogger()
        logger.add('INFO', 'test')
        const logs1 = logger.getOrderedLogs()
        logs1.push('modified')
        const logs2 = logger.getOrderedLogs()
        expect(logs2).toHaveLength(1)
      })
    })

    describe('clear()', () => {
      it('should clear all logs', () => {
        const logger = new RingBufferLogger()
        logger.add('INFO', 'test 1')
        logger.add('INFO', 'test 2')
        logger.clear()
        expect(logger.getBufferSize()).toBe(0)
        expect(logger.getOrderedLogs()).toEqual([])
      })

      it('should allow new logs after clear', () => {
        const logger = new RingBufferLogger()
        logger.add('INFO', 'before')
        logger.clear()
        logger.add('INFO', 'after')
        const logs = logger.getOrderedLogs()
        expect(logs).toHaveLength(1)
        expect(logs[0]).toContain('after')
      })
    })
  })

  // ============================================================
  // dumpLogsToFile Tests
  // ============================================================
  describe('dumpLogsToFile', () => {
    const testDir = '/test/notes'

    it('should write logs to file with correct path', () => {
      const logger = new RingBufferLogger()
      logger.add('INFO', 'test log')

      const result = dumpLogsToFile(logger, 'test dump', testDir)

      expect(result.success).toBe(true)
      expect(result.path).toContain(testDir)
      expect(result.path).toContain('worker-log-')
      expect(result.path).toContain('.log')
    })

    it('should use custom notes directory if provided', () => {
      const logger = new RingBufferLogger()
      logger.add('INFO', 'test')

      const result = dumpLogsToFile(logger, 'test', '/custom/dir')

      expect(result.path).toContain('/custom/dir/')
    })

    it('should include reason in log header', () => {
      const logger = new RingBufferLogger()
      dumpLogsToFile(logger, 'SIGTERM received', testDir)

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('SIGTERM received')
      )
    })

    it('should include entry count in header', () => {
      const logger = new RingBufferLogger()
      logger.add('INFO', 'log 1')
      logger.add('INFO', 'log 2')

      dumpLogsToFile(logger, 'test', testDir)

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Entries: 2')
      )
    })

    it('should include PID in header', () => {
      const logger = new RingBufferLogger()
      dumpLogsToFile(logger, 'test', testDir)

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(`PID: ${process.pid}`)
      )
    })

    it('should handle write errors gracefully', () => {
      mockWriteFileSync.mockImplementationOnce(() => {
        throw new Error('Disk full')
      })

      const logger = new RingBufferLogger()
      const result = dumpLogsToFile(logger, 'test', testDir)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Disk full')
    })

    it('should include all log entries in dump', () => {
      const logger = new RingBufferLogger()
      logger.add('INFO', 'first')
      logger.add('ERROR', 'second')
      logger.add('INFO', 'third')

      dumpLogsToFile(logger, 'test', testDir)

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string
      expect(writtenContent).toContain('first')
      expect(writtenContent).toContain('second')
      expect(writtenContent).toContain('third')
    })
  })

  // ============================================================
  // saveFallbackData Tests
  // ============================================================
  describe('saveFallbackData', () => {
    const testDir = '/test/fallback'

    it('should save fallback data with correct structure', () => {
      const result = saveFallbackData('snippet', { text: 'hello' }, 'session-123', testDir)

      expect(result.success).toBe(true)
      expect(mockWriteFileSync).toHaveBeenCalled()

      const writtenContent = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
      expect(writtenContent.type).toBe('snippet')
      expect(writtenContent.data).toEqual({ text: 'hello' })
      expect(writtenContent.sessionId).toBe('session-123')
      expect(writtenContent.timestamp).toBeDefined()
    })

    it('should generate unique filename with timestamp', () => {
      saveFallbackData('test', {}, null, testDir)

      const path = mockWriteFileSync.mock.calls[0][0] as string
      expect(path).toMatch(/worker-fallback-\d+\.json$/)
    })

    it('should use custom directory if provided', () => {
      saveFallbackData('test', {}, null, '/custom/path')

      const path = mockWriteFileSync.mock.calls[0][0] as string
      expect(path).toContain('/custom/path/')
    })

    it('should handle null sessionId', () => {
      saveFallbackData('test', { data: 'value' }, null, testDir)

      const writtenContent = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
      expect(writtenContent.sessionId).toBeNull()
    })

    it('should handle write errors gracefully', () => {
      mockWriteFileSync.mockImplementationOnce(() => {
        throw new Error('Permission denied')
      })

      const result = saveFallbackData('test', {}, 'session', testDir)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Permission denied')
    })

    it('should save complex data structures', () => {
      const complexData = {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        string: 'test'
      }

      saveFallbackData('complex', complexData, 'session', testDir)

      const writtenContent = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
      expect(writtenContent.data).toEqual(complexData)
    })
  })

  // ============================================================
  // isIPCDisconnectedError Tests
  // ============================================================
  describe('isIPCDisconnectedError', () => {
    it('should detect EPIPE error', () => {
      const error = new Error('write EPIPE') as Error & { code?: string }
      error.code = 'EPIPE'
      expect(isIPCDisconnectedError(error)).toBe(true)
    })

    it('should detect ERR_IPC_CHANNEL_CLOSED error', () => {
      const error = new Error('IPC channel closed') as Error & { code?: string }
      error.code = 'ERR_IPC_CHANNEL_CLOSED'
      expect(isIPCDisconnectedError(error)).toBe(true)
    })

    it('should detect "channel closed" in message', () => {
      const error = new Error('The channel closed before completion') as Error & { code?: string }
      expect(isIPCDisconnectedError(error)).toBe(true)
    })

    it('should detect "IPC channel" in message', () => {
      const error = new Error('IPC channel is not connected') as Error & { code?: string }
      expect(isIPCDisconnectedError(error)).toBe(true)
    })

    it('should return false for unrelated errors', () => {
      const error = new Error('Something went wrong') as Error & { code?: string }
      error.code = 'ENOENT'
      expect(isIPCDisconnectedError(error)).toBe(false)
    })

    it('should return false for errors without code or message match', () => {
      const error = new Error('Generic error') as Error & { code?: string }
      expect(isIPCDisconnectedError(error)).toBe(false)
    })

    it('should handle error with undefined message', () => {
      const error = { code: 'OTHER' } as Error & { code?: string }
      expect(isIPCDisconnectedError(error)).toBe(false)
    })
  })

  // ============================================================
  // createTranscriberOptions Tests
  // ============================================================
  describe('createTranscriberOptions', () => {
    it('should create options with microphone enabled', () => {
      const config = {
        enableMicrophone: true,
        modelPath: '/path/to/model',
        outputDir: '/path/to/output'
      }

      const options = createTranscriberOptions(config)

      expect(options.enableMicrophone).toBe(true)
    })

    it('should create options with microphone disabled', () => {
      const config = {
        enableMicrophone: false,
        modelPath: '/path/to/model',
        outputDir: '/path/to/output'
      }

      const options = createTranscriberOptions(config)

      expect(options.enableMicrophone).toBe(false)
    })

    it('should default enableSystemAudio to false', () => {
      const config = {
        enableMicrophone: true,
        modelPath: '/path/to/model',
        outputDir: '/path/to/output'
      }

      const options = createTranscriberOptions(config)

      expect(options.enableSystemAudio).toBe(false)
    })

    it('should respect enableSystemAudio when provided', () => {
      const config = {
        enableMicrophone: true,
        enableSystemAudio: true,
        modelPath: '/path/to/model',
        outputDir: '/path/to/output'
      }

      const options = createTranscriberOptions(config)

      expect(options.enableSystemAudio).toBe(true)
    })

    it('should set snippet options correctly', () => {
      const config = {
        enableMicrophone: true,
        modelPath: '/custom/model',
        outputDir: '/output'
      }

      const options = createTranscriberOptions(config)

      expect(options.snippets.enabled).toBe(true)
      expect(options.snippets.intervalSeconds).toBe(15)
      expect(options.snippets.engine).toBe('vosk')
      expect(options.snippets.confidenceThreshold).toBe(0.3)
      expect(options.snippets.engineOptions.modelPath).toBe('/custom/model')
    })

    it('should set session transcript options correctly', () => {
      const config = {
        enableMicrophone: true,
        modelPath: '/model/path',
        outputDir: '/output'
      }

      const options = createTranscriberOptions(config)

      expect(options.sessionTranscript.enabled).toBe(true)
      expect(options.sessionTranscript.engine).toBe('vosk')
      expect(options.sessionTranscript.engineOptions.modelPath).toBe('/model/path')
    })

    it('should set recording options correctly', () => {
      const config = {
        enableMicrophone: true,
        modelPath: '/model',
        outputDir: '/custom/output'
      }

      const options = createTranscriberOptions(config)

      expect(options.recording.enabled).toBe(true)
      expect(options.recording.outputDir).toBe('/custom/output')
      expect(options.recording.format).toBe('wav')
      expect(options.recording.autoCleanup).toBe(false)
    })

    it('should set reconnection options correctly', () => {
      const config = {
        enableMicrophone: true,
        modelPath: '/model',
        outputDir: '/output'
      }

      const options = createTranscriberOptions(config)

      expect(options.reconnection.maxAttempts).toBe(5)
      expect(options.reconnection.baseDelay).toBe(1000)
      expect(options.reconnection.maxDelay).toBe(30000)
      expect(options.reconnection.backoffMultiplier).toBe(2)
    })
  })

  // ============================================================
  // Snippet Filtering Tests
  // ============================================================
  describe('shouldSkipSnippet', () => {
    it('should skip snippets below MIN_CONFIDENCE', () => {
      expect(shouldSkipSnippet({ text: 'the', confidence: 0.3 })).toBe(true)
      expect(shouldSkipSnippet({ text: 'the', confidence: 0.49 })).toBe(true)
    })

    it('should not skip snippets at MIN_CONFIDENCE', () => {
      expect(shouldSkipSnippet({ text: 'hello', confidence: 0.5 })).toBe(false)
    })

    it('should not skip high confidence snippets', () => {
      expect(shouldSkipSnippet({ text: 'hello world', confidence: 0.9 })).toBe(false)
      expect(shouldSkipSnippet({ text: 'test', confidence: 1.0 })).toBe(false)
    })

    it('should skip snippets with zero confidence', () => {
      expect(shouldSkipSnippet({ text: '', confidence: 0 })).toBe(true)
    })
  })

  describe('filterSnippet', () => {
    it('should return skip:true with reason for low confidence', () => {
      const result = filterSnippet({ text: 'the', confidence: 0.3 })
      expect(result.skip).toBe(true)
      expect(result.reason).toContain('30%')
      expect(result.reason).toContain('the')
    })

    it('should return skip:false without reason for high confidence', () => {
      const result = filterSnippet({ text: 'hello', confidence: 0.8 })
      expect(result.skip).toBe(false)
      expect(result.reason).toBeUndefined()
    })

    it('should format percentage correctly', () => {
      const result = filterSnippet({ text: 'test', confidence: 0.456 })
      expect(result.reason).toContain('46%') // Rounds to nearest integer
    })
  })

  describe('MIN_CONFIDENCE', () => {
    it('should be 0.5', () => {
      expect(MIN_CONFIDENCE).toBe(0.5)
    })
  })

  // ============================================================
  // stopWithTimeout Tests
  // ============================================================
  describe('stopWithTimeout', () => {
    it('should return success when promise resolves before timeout', async () => {
      const promise = Promise.resolve('done')
      const result = await stopWithTimeout(promise, 1000)

      expect(result.success).toBe(true)
      expect(result.timedOut).toBe(false)
      expect(result.result).toBe('done')
    })

    it('should return timedOut:true when promise times out', async () => {
      const promise = new Promise((resolve) => {
        setTimeout(resolve, 5000)
      })

      const resultPromise = stopWithTimeout(promise, 100)
      jest.advanceTimersByTime(150)
      const result = await resultPromise

      expect(result.success).toBe(true)
      expect(result.timedOut).toBe(true)
    })

    it('should return error when promise rejects', async () => {
      const promise = Promise.reject(new Error('Something failed'))
      const result = await stopWithTimeout(promise, 1000)

      expect(result.success).toBe(false)
      expect(result.timedOut).toBe(false)
      expect(result.error?.message).toBe('Something failed')
    })

    it('should use default timeout of SESSION_TIMEOUT_MS', async () => {
      expect(SESSION_TIMEOUT_MS).toBe(60000)
    })

    it('should include timeout duration in error message', async () => {
      const promise = new Promise((resolve) => {
        setTimeout(resolve, 70000)
      })

      const resultPromise = stopWithTimeout(promise, 5000)
      jest.advanceTimersByTime(5500)
      const result = await resultPromise

      expect(result.timedOut).toBe(true)
    })
  })

  // ============================================================
  // Signal Handler Tests
  // ============================================================
  describe('createSignalHandlers', () => {
    let mockExit: jest.SpyInstance

    beforeEach(() => {
      mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    })

    afterEach(() => {
      mockExit.mockRestore()
    })

    it('should create sigterm and sigint handlers', () => {
      const handlers = createSignalHandlers(async () => {})

      expect(handlers.sigterm).toBeDefined()
      expect(handlers.sigint).toBeDefined()
      expect(typeof handlers.sigterm).toBe('function')
      expect(typeof handlers.sigint).toBe('function')
    })

    it('should call onShutdown when sigterm fires', async () => {
      const onShutdown = jest.fn().mockResolvedValue(undefined)
      const handlers = createSignalHandlers(onShutdown)

      handlers.sigterm()
      await Promise.resolve() // Let the async handler run

      expect(onShutdown).toHaveBeenCalled()
    })

    it('should call onShutdown when sigint fires', async () => {
      const onShutdown = jest.fn().mockResolvedValue(undefined)
      const handlers = createSignalHandlers(onShutdown)

      handlers.sigint()
      await Promise.resolve()

      expect(onShutdown).toHaveBeenCalled()
    })

    it('should exit with code 0 on successful shutdown', async () => {
      const onShutdown = jest.fn().mockResolvedValue(undefined)
      const handlers = createSignalHandlers(onShutdown)

      handlers.sigterm()
      await Promise.resolve()
      await Promise.resolve() // Extra tick for the .then()

      expect(mockExit).toHaveBeenCalledWith(0)
    })

    it('should exit with code 1 on shutdown error', async () => {
      const onShutdown = jest.fn().mockRejectedValue(new Error('Shutdown failed'))
      const handlers = createSignalHandlers(onShutdown)

      handlers.sigterm()
      await Promise.resolve()
      await Promise.resolve()

      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })

  // ============================================================
  // Edge Cases and Stress Tests
  // ============================================================
  describe('Edge Cases', () => {
    describe('RingBufferLogger stress tests', () => {
      it('should handle empty string messages', () => {
        const logger = new RingBufferLogger()
        logger.add('INFO', '')
        expect(logger.getBufferSize()).toBe(1)
      })

      it('should handle very long messages', () => {
        const logger = new RingBufferLogger()
        const longMessage = 'x'.repeat(10000)
        logger.add('INFO', longMessage)
        const logs = logger.getOrderedLogs()
        expect(logs[0]).toContain(longMessage)
      })

      it('should handle special characters', () => {
        const logger = new RingBufferLogger()
        logger.add('INFO', '🎤 录音 مرحبا \n\t\r\\')
        expect(logger.getBufferSize()).toBe(1)
      })

      it('should handle circular object references gracefully', () => {
        const logger = new RingBufferLogger()
        const obj: Record<string, unknown> = { a: 1 }
        obj.self = obj // Circular reference

        // JSON.stringify will throw, so the logger should handle it
        expect(() => logger.add('INFO', obj)).toThrow()
      })

      it('should handle rapid logging', () => {
        const logger = new RingBufferLogger(100)
        for (let i = 0; i < 10000; i++) {
          logger.add('INFO', `rapid message ${i}`)
        }
        expect(logger.getBufferSize()).toBe(100)
      })
    })

    describe('saveFallbackData edge cases', () => {
      const testDir = '/test/edge'

      it('should handle undefined data', () => {
        saveFallbackData('test', undefined, null, testDir)
        const content = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
        expect(content.data).toBeUndefined()
      })

      it('should handle array data', () => {
        saveFallbackData('test', [1, 2, 3], null, testDir)
        const content = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
        expect(content.data).toEqual([1, 2, 3])
      })

      it('should handle empty string sessionId', () => {
        saveFallbackData('test', {}, '', testDir)
        const content = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
        expect(content.sessionId).toBe('')
      })
    })

    describe('stopWithTimeout edge cases', () => {
      it('should handle zero timeout', async () => {
        const promise = Promise.resolve('instant')
        const result = await stopWithTimeout(promise, 0)

        // With 0ms timeout, the promise should still win if it's already resolved
        expect(result.success).toBe(true)
      })

      it('should handle promise that resolves with undefined', async () => {
        const promise = Promise.resolve(undefined)
        const result = await stopWithTimeout(promise, 1000)

        expect(result.success).toBe(true)
        expect(result.result).toBeUndefined()
      })

      it('should handle promise that resolves with null', async () => {
        const promise = Promise.resolve(null)
        const result = await stopWithTimeout(promise, 1000)

        expect(result.success).toBe(true)
        expect(result.result).toBeNull()
      })
    })
  })

  // ============================================================
  // Integration-like Tests
  // ============================================================
  describe('Integration scenarios', () => {
    const testDir = '/test/integration'

    it('should handle full logging workflow', () => {
      const logger = new RingBufferLogger(5)

      // Simulate worker lifecycle
      logger.log('Worker starting')
      logger.log('AudioTranscriber imported')
      logger.log('Transcriber initialized')
      logger.log('Recording started')
      logger.error('Device disconnected')
      logger.log('Reconnecting...')
      logger.log('Reconnected successfully')

      // Dump logs
      const result = dumpLogsToFile(logger, 'Graceful shutdown', testDir)

      expect(result.success).toBe(true)
      const content = mockWriteFileSync.mock.calls[0][1] as string
      expect(content).toContain('Device disconnected')
      expect(content).toContain('Reconnected successfully')
      // Old messages should be gone (buffer size 5, 7 messages logged)
      expect(content).not.toContain('Worker starting')
    })

    it('should handle IPC failure with fallback save', () => {
      const logger = new RingBufferLogger()
      logger.log('Recording session started')
      logger.log('Snippet received: hello world')

      // Simulate EPIPE - save fallback
      const fallbackResult = saveFallbackData(
        'sessionTranscript',
        { text: 'Final transcript', confidence: 0.95 },
        'session-456',
        testDir
      )

      expect(fallbackResult.success).toBe(true)

      // Then dump logs
      const dumpResult = dumpLogsToFile(logger, 'IPC disconnected - EPIPE', testDir)
      expect(dumpResult.success).toBe(true)
    })

    it('should filter multiple snippets correctly', () => {
      const snippets = [
        { text: 'the', confidence: 0.3 },
        { text: 'hello world', confidence: 0.8 },
        { text: '', confidence: 0.1 },
        { text: 'this is a test', confidence: 0.95 },
        { text: 'um', confidence: 0.45 }
      ]

      const accepted = snippets.filter(s => !shouldSkipSnippet(s))

      expect(accepted).toHaveLength(2)
      expect(accepted[0].text).toBe('hello world')
      expect(accepted[1].text).toBe('this is a test')
    })
  })
})
