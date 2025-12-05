/**
 * Tests for PermissionsService
 */

// Mock electron before imports
jest.mock('electron', () => ({
  systemPreferences: {
    getMediaAccessStatus: jest.fn(),
    askForMediaAccess: jest.fn()
  }
}))

// Mock child_process
const mockExec = jest.fn()
jest.mock('child_process', () => ({
  exec: mockExec
}))

import { systemPreferences } from 'electron'
import { PermissionsService } from '../main/services/PermissionsService'

const mockSystemPreferences = systemPreferences as jest.Mocked<typeof systemPreferences>

describe('PermissionsService', () => {
  let service: PermissionsService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new PermissionsService()
  })

  describe('checkPermissions', () => {
    it('should return granted status for both permissions', async () => {
      mockSystemPreferences.getMediaAccessStatus
        .mockReturnValueOnce('granted') // microphone
        .mockReturnValueOnce('granted') // screen

      const result = await service.checkPermissions()

      expect(result).toEqual({
        microphone: 'granted',
        screenRecording: 'granted'
      })
      expect(mockSystemPreferences.getMediaAccessStatus).toHaveBeenCalledWith('microphone')
      expect(mockSystemPreferences.getMediaAccessStatus).toHaveBeenCalledWith('screen')
    })

    it('should return denied status for both permissions', async () => {
      mockSystemPreferences.getMediaAccessStatus
        .mockReturnValueOnce('denied')
        .mockReturnValueOnce('denied')

      const result = await service.checkPermissions()

      expect(result).toEqual({
        microphone: 'denied',
        screenRecording: 'denied'
      })
    })

    it('should return not-determined status for both permissions', async () => {
      mockSystemPreferences.getMediaAccessStatus
        .mockReturnValueOnce('not-determined')
        .mockReturnValueOnce('not-determined')

      const result = await service.checkPermissions()

      expect(result).toEqual({
        microphone: 'not-determined',
        screenRecording: 'not-determined'
      })
    })

    it('should handle mixed permission statuses', async () => {
      mockSystemPreferences.getMediaAccessStatus
        .mockReturnValueOnce('granted')
        .mockReturnValueOnce('denied')

      const result = await service.checkPermissions()

      expect(result).toEqual({
        microphone: 'granted',
        screenRecording: 'denied'
      })
    })

    it('should handle errors in microphone check', async () => {
      mockSystemPreferences.getMediaAccessStatus
        .mockImplementationOnce(() => { throw new Error('Access error') })
        .mockReturnValueOnce('granted')

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await service.checkPermissions()

      expect(result.microphone).toBe('not-determined')
      expect(result.screenRecording).toBe('granted')
      expect(consoleSpy).toHaveBeenCalledWith(
        '[PermissionsService] Error checking microphone permission:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })

    it('should handle errors in screen recording check', async () => {
      mockSystemPreferences.getMediaAccessStatus
        .mockReturnValueOnce('granted')
        .mockImplementationOnce(() => { throw new Error('Access error') })

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await service.checkPermissions()

      expect(result.microphone).toBe('granted')
      expect(result.screenRecording).toBe('not-determined')
      expect(consoleSpy).toHaveBeenCalledWith(
        '[PermissionsService] Error checking screen recording permission:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })
  })

  describe('requestMicrophonePermission', () => {
    it('should return true when permission is granted', async () => {
      mockSystemPreferences.askForMediaAccess.mockResolvedValueOnce(true)
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      const result = await service.requestMicrophonePermission()

      expect(result).toBe(true)
      expect(mockSystemPreferences.askForMediaAccess).toHaveBeenCalledWith('microphone')
      expect(consoleSpy).toHaveBeenCalledWith(
        '[PermissionsService] Microphone permission:',
        'granted'
      )

      consoleSpy.mockRestore()
    })

    it('should return false when permission is denied', async () => {
      mockSystemPreferences.askForMediaAccess.mockResolvedValueOnce(false)
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      const result = await service.requestMicrophonePermission()

      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith(
        '[PermissionsService] Microphone permission:',
        'denied'
      )

      consoleSpy.mockRestore()
    })

    it('should return false and log error on exception', async () => {
      mockSystemPreferences.askForMediaAccess.mockRejectedValueOnce(new Error('Request failed'))
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await service.requestMicrophonePermission()

      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith(
        '[PermissionsService] Error requesting microphone permission:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })
  })

  describe('requestScreenRecordingPermission', () => {
    it('should open System Preferences for screen recording', async () => {
      mockExec.mockImplementationOnce((_cmd: string, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
        cb(null, '', '')
      })
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      await service.requestScreenRecordingPermission()

      expect(mockExec).toHaveBeenCalledWith(
        'open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"',
        expect.any(Function)
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        '[PermissionsService] Opened System Preferences for screen recording permission'
      )

      consoleSpy.mockRestore()
    })

    it('should handle errors when opening System Preferences', async () => {
      mockExec.mockImplementationOnce((_cmd: string, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
        cb(new Error('Failed to open'), '', '')
      })
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      await service.requestScreenRecordingPermission()

      expect(consoleSpy).toHaveBeenCalledWith(
        '[PermissionsService] Error opening System Preferences:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })
  })

  describe('ensurePermissions', () => {
    it('should return granted: true when all permissions are granted', async () => {
      mockSystemPreferences.getMediaAccessStatus
        .mockReturnValueOnce('granted')
        .mockReturnValueOnce('granted')

      const result = await service.ensurePermissions()

      expect(result).toEqual({
        granted: true,
        missing: []
      })
    })

    it('should request microphone permission if not granted', async () => {
      mockSystemPreferences.getMediaAccessStatus
        .mockReturnValueOnce('not-determined')
        .mockReturnValueOnce('granted')
      mockSystemPreferences.askForMediaAccess.mockResolvedValueOnce(true)

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      const result = await service.ensurePermissions()

      expect(mockSystemPreferences.askForMediaAccess).toHaveBeenCalledWith('microphone')
      expect(result.missing).toContain('microphone')

      consoleSpy.mockRestore()
    })

    it('should log warning when microphone request is denied', async () => {
      mockSystemPreferences.getMediaAccessStatus
        .mockReturnValueOnce('denied')
        .mockReturnValueOnce('granted')
      mockSystemPreferences.askForMediaAccess.mockResolvedValueOnce(false)

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()

      await service.ensurePermissions()

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[PermissionsService] Microphone permission not granted'
      )

      consoleWarnSpy.mockRestore()
      consoleLogSpy.mockRestore()
    })

    it('should log warning when screen recording is not granted', async () => {
      mockSystemPreferences.getMediaAccessStatus
        .mockReturnValueOnce('granted')
        .mockReturnValueOnce('denied')

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()

      const result = await service.ensurePermissions()

      expect(result.missing).toContain('screen recording')
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[PermissionsService] Screen recording permission not granted'
      )

      consoleWarnSpy.mockRestore()
    })

    it('should return both permissions as missing when neither granted', async () => {
      mockSystemPreferences.getMediaAccessStatus
        .mockReturnValueOnce('denied')
        .mockReturnValueOnce('denied')
      mockSystemPreferences.askForMediaAccess.mockResolvedValueOnce(false)

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()

      const result = await service.ensurePermissions()

      expect(result).toEqual({
        granted: false,
        missing: ['microphone', 'screen recording']
      })

      consoleWarnSpy.mockRestore()
      consoleLogSpy.mockRestore()
    })
  })
})
