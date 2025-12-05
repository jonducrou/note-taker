/**
 * Tests for ZoomDetectionService
 */

// Mock child_process with promisify-compatible implementation
const mockExecAsync = jest.fn()
jest.mock('child_process', () => ({
  exec: jest.fn()
}))

// Mock util.promisify to return our mock
jest.mock('util', () => ({
  promisify: () => mockExecAsync
}))

import { ZoomDetectionService } from '../main/services/ZoomDetectionService'

describe('ZoomDetectionService', () => {
  let service: ZoomDetectionService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new ZoomDetectionService()
  })

  afterEach(() => {
    service.stop()
  })

  describe('initial state', () => {
    it('should start with service not running', () => {
      expect(service.isServiceRunning()).toBe(false)
    })

    it('should start with zoom status as inactive', () => {
      expect(service.getStatus()).toBe(false)
    })
  })

  describe('start', () => {
    it('should set service as running', () => {
      mockExecAsync.mockRejectedValueOnce({ code: 1 })

      service.start(jest.fn())

      expect(service.isServiceRunning()).toBe(true)
    })

    it('should log when starting', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      mockExecAsync.mockRejectedValueOnce({ code: 1 })

      service.start(jest.fn())

      expect(consoleSpy).toHaveBeenCalledWith('[ZoomDetectionService] Started')
      consoleSpy.mockRestore()
    })

    it('should check zoom status immediately on start', () => {
      mockExecAsync.mockRejectedValueOnce({ code: 1 })

      service.start(jest.fn())

      expect(mockExecAsync).toHaveBeenCalledWith('pgrep -x "zoom.us"')
    })

    it('should not start if already running', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
      mockExecAsync.mockRejectedValue({ code: 1 })

      service.start(jest.fn())
      service.start(jest.fn())

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[ZoomDetectionService] Already running'
      )
      consoleWarnSpy.mockRestore()
      consoleLogSpy.mockRestore()
    })

    it('should set up interval to check periodically', () => {
      jest.useFakeTimers()
      mockExecAsync.mockRejectedValue({ code: 1 })

      service.start(jest.fn())

      // First call is immediate
      expect(mockExecAsync).toHaveBeenCalledTimes(1)

      // Advance time by 5 seconds
      jest.advanceTimersByTime(5000)

      expect(mockExecAsync).toHaveBeenCalledTimes(2)

      jest.useRealTimers()
    })
  })

  describe('stop', () => {
    it('should set service as not running', () => {
      mockExecAsync.mockRejectedValueOnce({ code: 1 })

      service.start(jest.fn())
      service.stop()

      expect(service.isServiceRunning()).toBe(false)
    })

    it('should reset zoom status to inactive', async () => {
      // Start with zoom active
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '12345', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'zoom.us', stderr: '' })

      const callback = jest.fn()
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      service.start(callback)

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(service.getStatus()).toBe(true)

      service.stop()

      expect(service.getStatus()).toBe(false)
      consoleSpy.mockRestore()
    })

    it('should log when stopping', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      mockExecAsync.mockRejectedValueOnce({ code: 1 })

      service.start(jest.fn())
      service.stop()

      expect(consoleSpy).toHaveBeenCalledWith('[ZoomDetectionService] Stopped')
      consoleSpy.mockRestore()
    })

    it('should stop the interval', () => {
      jest.useFakeTimers()
      mockExecAsync.mockRejectedValue({ code: 1 })

      service.start(jest.fn())
      service.stop()

      const callCount = mockExecAsync.mock.calls.length

      // Advance time - should not trigger more checks
      jest.advanceTimersByTime(10000)

      expect(mockExecAsync.mock.calls.length).toBe(callCount)
      jest.useRealTimers()
    })
  })

  describe('zoom status detection', () => {
    it('should detect when zoom is active', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '12345', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'zoom.us', stderr: '' })

      const callback = jest.fn()
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      service.start(callback)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(service.getStatus()).toBe(true)
      expect(callback).toHaveBeenCalledWith(true)
      expect(consoleSpy).toHaveBeenCalledWith(
        '[ZoomDetectionService] Zoom meeting status changed:',
        'ACTIVE'
      )

      consoleSpy.mockRestore()
    })

    it('should detect when zoom is inactive (no process)', async () => {
      mockExecAsync.mockRejectedValueOnce({ code: 1 })

      const callback = jest.fn()

      service.start(callback)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(service.getStatus()).toBe(false)
      // Callback not called since status didn't change from initial false
      expect(callback).not.toHaveBeenCalled()
    })

    it('should assume active if pgrep succeeds but osascript fails', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '12345', stderr: '' })
        .mockRejectedValueOnce(new Error('osascript failed'))

      const callback = jest.fn()
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      service.start(callback)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(service.getStatus()).toBe(true)
      expect(callback).toHaveBeenCalledWith(true)

      consoleSpy.mockRestore()
    })

    it('should handle unexpected pgrep errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      mockExecAsync.mockRejectedValueOnce({ code: 2, message: 'Unexpected error' })

      service.start(jest.fn())

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(service.getStatus()).toBe(false)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ZoomDetectionService] Error checking for Zoom process:',
        expect.any(Object)
      )

      consoleErrorSpy.mockRestore()
    })
  })

  describe('getStatus', () => {
    it('should return current zoom meeting status', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '12345', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'zoom.us', stderr: '' })

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      service.start(jest.fn())

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(service.getStatus()).toBe(true)

      consoleSpy.mockRestore()
    })
  })

  describe('isServiceRunning', () => {
    it('should return true when service is running', () => {
      mockExecAsync.mockRejectedValueOnce({ code: 1 })

      service.start(jest.fn())

      expect(service.isServiceRunning()).toBe(true)
    })

    it('should return false when service is stopped', () => {
      mockExecAsync.mockRejectedValueOnce({ code: 1 })

      service.start(jest.fn())
      service.stop()

      expect(service.isServiceRunning()).toBe(false)
    })
  })
})
